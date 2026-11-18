-- CampusSign Step 30: verified attendance contributes to course results when enabled
-- Additive migration. Existing sessions, attendance, scores and published results are preserved.

alter table public.sessions
  add column if not exists academic_course_id uuid references public.academic_courses(id) on delete restrict,
  add column if not exists academic_term_id uuid references public.academic_terms(id) on delete restrict,
  add column if not exists teaching_group_id uuid references public.course_teaching_groups(id) on delete restrict;
alter table public.sessions drop constraint if exists sessions_academic_scope_check;
alter table public.sessions add constraint sessions_academic_scope_check check (
  (academic_course_id is null and academic_term_id is null and teaching_group_id is null)
  or (academic_course_id is not null and academic_term_id is not null)
);
create index if not exists sessions_academic_scope_idx
  on public.sessions(academic_course_id,academic_term_id,teaching_group_id,created_at);

alter table public.course_result_entries
  add column if not exists attendance_score numeric(6,2);
alter table public.course_result_entries drop constraint if exists course_result_entries_attendance_score_check;
alter table public.course_result_entries add constraint course_result_entries_attendance_score_check
  check (attendance_score is null or attendance_score between 0 and 100);

-- Existing sessions are linked only when the course label and term dates identify exactly one scope.
with matches as (
  select s.id as session_id,c.id as course_id,t.id as term_id,
    count(*) over(partition by s.id) as match_count
  from public.sessions s
  join public.academic_courses c on lower(btrim(s.course))=lower(btrim(c.code||' - '||c.title))
  join public.academic_terms t on t.starts_on is not null and t.ends_on is not null
    and s.created_at::date between t.starts_on and t.ends_on
  where s.academic_course_id is null and s.academic_term_id is null
)
update public.sessions s
set academic_course_id=m.course_id,academic_term_id=m.term_id
from matches m where s.id=m.session_id and m.match_count=1;

create or replace function public._campussign_validate_session_academic_scope()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.academic_course_id is null and new.academic_term_id is null and new.teaching_group_id is null then
    return new;
  end if;
  if new.academic_course_id is null or new.academic_term_id is null then
    raise exception 'session_academic_scope_incomplete';
  end if;
  if not exists (
    select 1 from public.academic_courses c
    where c.id=new.academic_course_id and c.is_active
      and lower(btrim(new.course)) in (lower(btrim(c.code)),lower(btrim(c.title)),lower(btrim(c.code||' - '||c.title)))
  ) then raise exception 'session_course_catalog_mismatch'; end if;
  if not exists(select 1 from public.academic_terms t where t.id=new.academic_term_id) then
    raise exception 'session_academic_term_not_found';
  end if;
  if auth.uid() is not null and new.lecturer_id<>auth.uid() then
    raise exception 'session_lecturer_mismatch';
  end if;
  if auth.uid() is not null and not exists (
    select 1 from public.lecturers l join public.lecturer_course_assignments a on a.lecturer_id=l.id
    where l.id=auth.uid() and l.role='lecturer' and l.is_verified and a.course_id=new.academic_course_id
  ) then raise exception 'course_access_denied'; end if;
  if new.teaching_group_id is not null and not exists (
    select 1 from public.course_teaching_groups g
    where g.id=new.teaching_group_id and g.course_id=new.academic_course_id
      and g.academic_term_id=new.academic_term_id
  ) then raise exception 'session_teaching_group_mismatch'; end if;
  return new;
end;
$$;
revoke all on function public._campussign_validate_session_academic_scope() from public,anon,authenticated;
drop trigger if exists sessions_validate_academic_scope on public.sessions;
create trigger sessions_validate_academic_scope
before insert or update of academic_course_id,academic_term_id,teaching_group_id,course,lecturer_id
on public.sessions for each row execute function public._campussign_validate_session_academic_scope();

create or replace function public.submit_course_results(
  p_course uuid,p_term uuid,p_group uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_sheet uuid;
  v_ca_weight numeric := 40;
  v_exam_weight numeric := 60;
  v_attendance_weight numeric := 0;
  v_attendance_enabled boolean := false;
  v_ca_effective_weight numeric := 40;
  v_ca_components numeric := 0;
  v_exam_components numeric := 0;
  v_attendance_sessions integer := 0;
  v_count integer := 0;
  v_status text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.lecturers l join public.lecturer_course_assignments a on a.lecturer_id=l.id
    where l.id=auth.uid() and l.role='lecturer' and l.is_verified and a.course_id=p_course
  ) then raise exception 'course_access_denied'; end if;
  if not exists(select 1 from public.academic_courses where id=p_course and is_active)
     or not exists(select 1 from public.academic_terms where id=p_term) then
    raise exception 'course_or_term_not_found';
  end if;
  if p_group is not null and not exists(
    select 1 from public.course_teaching_groups
    where id=p_group and course_id=p_course and academic_term_id=p_term and created_by=auth.uid()
  ) then raise exception 'teaching_group_not_found_or_not_owned'; end if;

  select ca_weight_percent,exam_weight_percent,attendance_enabled,attendance_weight_percent
    into v_ca_weight,v_exam_weight,v_attendance_enabled,v_attendance_weight
  from public.course_assessment_policies where course_id=p_course and academic_term_id=p_term;
  v_ca_weight:=coalesce(v_ca_weight,40);
  v_exam_weight:=coalesce(v_exam_weight,60);
  v_attendance_enabled:=coalesce(v_attendance_enabled,false);
  v_attendance_weight:=case when v_attendance_enabled then coalesce(v_attendance_weight,0) else 0 end;
  v_ca_effective_weight:=v_ca_weight-v_attendance_weight;
  if v_ca_effective_weight<0 then raise exception 'attendance_weight_exceeds_ca_weight'; end if;

  if v_attendance_enabled and v_attendance_weight>0 then
    select count(*) into v_attendance_sessions from public.sessions
    where academic_course_id=p_course and academic_term_id=p_term
      and teaching_group_id is not distinct from p_group;
    if v_attendance_sessions=0 then raise exception 'attendance_sessions_missing'; end if;
    if exists(
      select 1 from public.sessions
      where academic_course_id=p_course and academic_term_id=p_term
        and teaching_group_id is not distinct from p_group
        and (academic_course_id is null or academic_term_id is null)
    ) then raise exception 'attendance_session_scope_incomplete'; end if;
  end if;

  select coalesce(sum(weight_percent) filter(where assessment_type='ca'),0),
         coalesce(sum(weight_percent) filter(where assessment_type='exam'),0)
    into v_ca_components,v_exam_components
  from public.course_assessments
  where course_id=p_course and academic_term_id=p_term
    and teaching_group_id is not distinct from p_group;
  if v_ca_effective_weight>0 and abs(v_ca_components-100)>0.01 then
    raise exception 'ca_components_must_total_100';
  end if;
  if v_exam_weight>0 and abs(v_exam_components-100)>0.01 then
    raise exception 'exam_components_must_total_100';
  end if;
  if v_ca_effective_weight>0 and v_ca_components=0 then raise exception 'ca_assessments_missing'; end if;
  if v_exam_weight>0 and v_exam_components=0 then raise exception 'exam_assessments_missing'; end if;

  if p_group is null then
    select count(*) into v_count from public.assessment_course_students(p_course);
    if exists (
      select 1 from public.assessment_course_students(p_course) r
      cross join public.course_assessments a
      left join public.course_assessment_scores s on s.assessment_id=a.id and s.student_user_id=r.user_id
      where a.course_id=p_course and a.academic_term_id=p_term and a.teaching_group_id is null and s.id is null
    ) then raise exception 'assessment_marks_incomplete'; end if;
  else
    select count(*) into v_count from public.assessment_teaching_group_students(p_group);
    if exists (
      select 1 from public.assessment_teaching_group_students(p_group) r
      cross join public.course_assessments a
      left join public.course_assessment_scores s on s.assessment_id=a.id and s.student_user_id=r.user_id
      where a.course_id=p_course and a.academic_term_id=p_term and a.teaching_group_id=p_group and s.id is null
    ) then raise exception 'assessment_marks_incomplete'; end if;
  end if;
  if v_count=0 then raise exception 'result_roster_empty'; end if;

  insert into public.course_result_sheets(course_id,academic_term_id,teaching_group_id,status,submitted_by,submitted_at,reviewed_by,reviewed_at,review_note,published_at,updated_at)
  values(p_course,p_term,p_group,'submitted',auth.uid(),now(),null,null,null,null,now())
  on conflict (course_id,academic_term_id,(coalesce(teaching_group_id,'00000000-0000-0000-0000-000000000000'::uuid)))
  do update set status='submitted',submitted_by=auth.uid(),submitted_at=now(),reviewed_by=null,reviewed_at=null,
    review_note=null,published_at=null,updated_at=now()
  where public.course_result_sheets.status in ('draft','rejected')
  returning id,status into v_sheet,v_status;
  if v_sheet is null then raise exception 'result_sheet_already_under_review_or_published'; end if;
  delete from public.course_result_entries where result_sheet_id=v_sheet;

  if p_group is null then
    insert into public.course_result_entries(result_sheet_id,student_user_id,ca_score,attendance_score,exam_score,final_score)
    select v_sheet,r.user_id,round(x.ca_score,2),x.attendance_score,round(x.exam_score,2),
      round(x.ca_score*v_ca_effective_weight/100 + coalesce(x.attendance_score,0)*v_attendance_weight/100 + x.exam_score*v_exam_weight/100,2)
    from public.assessment_course_students(p_course) r
    cross join lateral (
      select
        coalesce(sum(case when a.assessment_type='ca' then s.score/a.max_score*a.weight_percent else 0 end),0) ca_score,
        coalesce(sum(case when a.assessment_type='exam' then s.score/a.max_score*a.weight_percent else 0 end),0) exam_score,
        case when v_attendance_enabled and v_attendance_weight>0 then round(100*(
          select count(distinct se.id)::numeric from public.sessions se
          join public.attendance atd on atd.session_id=se.id
          where se.academic_course_id=p_course and se.academic_term_id=p_term
            and se.teaching_group_id is null
            and upper(btrim(atd.student_id))=upper(btrim(r.student_id))
            and lower(btrim(atd.status)) in ('verified','present','late')
        )/nullif(v_attendance_sessions,0),2) else null end attendance_score
      from public.course_assessments a
      left join public.course_assessment_scores s on s.assessment_id=a.id and s.student_user_id=r.user_id
      where a.course_id=p_course and a.academic_term_id=p_term and a.teaching_group_id is null
    ) x;
  else
    insert into public.course_result_entries(result_sheet_id,student_user_id,ca_score,attendance_score,exam_score,final_score)
    select v_sheet,r.user_id,round(x.ca_score,2),x.attendance_score,round(x.exam_score,2),
      round(x.ca_score*v_ca_effective_weight/100 + coalesce(x.attendance_score,0)*v_attendance_weight/100 + x.exam_score*v_exam_weight/100,2)
    from public.assessment_teaching_group_students(p_group) r
    cross join lateral (
      select
        coalesce(sum(case when a.assessment_type='ca' then s.score/a.max_score*a.weight_percent else 0 end),0) ca_score,
        coalesce(sum(case when a.assessment_type='exam' then s.score/a.max_score*a.weight_percent else 0 end),0) exam_score,
        case when v_attendance_enabled and v_attendance_weight>0 then round(100*(
          select count(distinct se.id)::numeric from public.sessions se
          join public.attendance atd on atd.session_id=se.id
          where se.academic_course_id=p_course and se.academic_term_id=p_term
            and se.teaching_group_id=p_group
            and upper(btrim(atd.student_id))=upper(btrim(r.student_id))
            and lower(btrim(atd.status)) in ('verified','present','late')
        )/nullif(v_attendance_sessions,0),2) else null end attendance_score
      from public.course_assessments a
      left join public.course_assessment_scores s on s.assessment_id=a.id and s.student_user_id=r.user_id
      where a.course_id=p_course and a.academic_term_id=p_term and a.teaching_group_id=p_group
    ) x;
  end if;
  perform public._campussign_write_audit('academic.course_results_submitted','course_result_sheet',v_sheet::text,null,
    jsonb_build_object('course_id',p_course,'term_id',p_term,'teaching_group_id',p_group,'student_count',v_count,
      'attendance_enabled',v_attendance_enabled,'attendance_weight_percent',v_attendance_weight));
  return v_sheet;
end;
$$;

drop function if exists public.get_course_result_sheet_entries(uuid);
create function public.get_course_result_sheet_entries(p_sheet uuid)
returns table(student_id text,full_name text,ca_score numeric,attendance_score numeric,exam_score numeric,final_score numeric)
language plpgsql security definer set search_path=public,auth,pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_access_required'; end if;
  if not exists(select 1 from public.course_result_sheets where id=p_sheet) then raise exception 'result_sheet_not_found'; end if;
  return query select sa.student_id,sa.full_name,e.ca_score,e.attendance_score,e.exam_score,e.final_score
    from public.course_result_entries e join public.student_accounts sa on sa.user_id=e.student_user_id
    where e.result_sheet_id=p_sheet order by sa.full_name,sa.student_id;
end;
$$;

drop function if exists public.get_my_published_course_results();
create function public.get_my_published_course_results()
returns table(course_code text,course_title text,term_name text,teaching_group_name text,
  ca_score numeric,attendance_score numeric,exam_score numeric,final_score numeric,published_at timestamptz)
language plpgsql security definer set search_path=public,auth,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  return query select c.code,c.title,t.name,g.name,e.ca_score,e.attendance_score,e.exam_score,e.final_score,s.published_at
    from public.course_result_entries e
    join public.course_result_sheets s on s.id=e.result_sheet_id and s.status='published'
    join public.academic_courses c on c.id=s.course_id
    join public.academic_terms t on t.id=s.academic_term_id
    left join public.course_teaching_groups g on g.id=s.teaching_group_id
    where e.student_user_id=auth.uid() order by s.published_at desc,c.code;
end;
$$;
revoke all on function public.submit_course_results(uuid,uuid,uuid) from public,anon;
grant execute on function public.submit_course_results(uuid,uuid,uuid) to authenticated;
revoke all on function public.get_course_result_sheet_entries(uuid) from public,anon;
grant execute on function public.get_course_result_sheet_entries(uuid) to authenticated;
revoke all on function public.get_my_published_course_results() from public,anon;
grant execute on function public.get_my_published_course_results() to authenticated;
