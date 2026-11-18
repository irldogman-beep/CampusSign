-- CampusSign Step 28: course result submission, review and publication
-- Additive only. Existing assessment marks and academic history are preserved.

create table if not exists public.course_result_sheets (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academic_courses(id) on delete restrict,
  academic_term_id uuid not null references public.academic_terms(id) on delete restrict,
  teaching_group_id uuid references public.course_teaching_groups(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','submitted','approved','rejected','published')),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists course_result_sheets_scope_uidx
  on public.course_result_sheets(course_id, academic_term_id, coalesce(teaching_group_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists course_result_sheets_status_idx
  on public.course_result_sheets(status, submitted_at desc);

create table if not exists public.course_result_entries (
  id uuid primary key default gen_random_uuid(),
  result_sheet_id uuid not null references public.course_result_sheets(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete restrict,
  ca_score numeric(6,2) not null check (ca_score between 0 and 100),
  exam_score numeric(6,2) not null check (exam_score between 0 and 100),
  final_score numeric(6,2) not null check (final_score between 0 and 100),
  created_at timestamptz not null default now(),
  unique(result_sheet_id, student_user_id)
);

create index if not exists course_result_entries_student_idx
  on public.course_result_entries(student_user_id, result_sheet_id);

alter table public.course_result_sheets enable row level security;
alter table public.course_result_entries enable row level security;
revoke all on public.course_result_sheets, public.course_result_entries from anon, authenticated;

-- Keep unpublished component marks private from students as well as hidden in the UI.
create or replace function public.can_read_assessment_score(p_assessment uuid,p_student uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then return false; end if;
  if public.is_admin() then return true; end if;
  if exists (
    select 1 from public.course_assessments a
    join public.lecturer_course_assignments lca on lca.course_id=a.course_id
    join public.lecturers l on l.id=lca.lecturer_id
    where a.id=p_assessment and l.id=auth.uid() and l.role='lecturer' and l.is_verified
  ) then return true; end if;
  return p_student=auth.uid() and exists (
    select 1
    from public.course_assessments a
    join public.course_result_sheets rs
      on rs.course_id=a.course_id and rs.academic_term_id=a.academic_term_id
     and rs.teaching_group_id is not distinct from a.teaching_group_id
     and rs.status='published'
    join public.course_result_entries re on re.result_sheet_id=rs.id
    where a.id=p_assessment and re.student_user_id=auth.uid()
      and re.student_user_id=p_student
  );
end;
$$;
revoke all on function public.can_read_assessment_score(uuid,uuid) from public,anon;
grant execute on function public.can_read_assessment_score(uuid,uuid) to authenticated;

drop policy if exists course_assessment_scores_read_scoped on public.course_assessment_scores;
create policy course_assessment_scores_read_scoped
on public.course_assessment_scores for select to authenticated
using (public.can_read_assessment_score(assessment_id,student_user_id));

create or replace function public.submit_course_results(
  p_course uuid, p_term uuid, p_group uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_sheet uuid;
  v_ca_weight numeric := 40;
  v_exam_weight numeric := 60;
  v_ca_components numeric := 0;
  v_exam_components numeric := 0;
  v_count integer := 0;
  v_status text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.lecturers l
    join public.lecturer_course_assignments a on a.lecturer_id=l.id
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

  select ca_weight_percent, exam_weight_percent into v_ca_weight, v_exam_weight
  from public.course_assessment_policies
  where course_id=p_course and academic_term_id=p_term;
  if exists (select 1 from public.course_assessment_policies where course_id=p_course and academic_term_id=p_term and attendance_enabled) then
    raise exception 'attendance_result_component_not_yet_configured';
  end if;
  v_ca_weight := coalesce(v_ca_weight,40);
  v_exam_weight := coalesce(v_exam_weight,60);

  select coalesce(sum(weight_percent) filter (where assessment_type='ca'),0),
         coalesce(sum(weight_percent) filter (where assessment_type='exam'),0)
    into v_ca_components,v_exam_components
  from public.course_assessments
  where course_id=p_course and academic_term_id=p_term
    and teaching_group_id is not distinct from p_group;

  if v_ca_weight > 0 and abs(v_ca_components-100) > 0.01 then
    raise exception 'ca_components_must_total_100';
  end if;
  if v_exam_weight > 0 and abs(v_exam_components-100) > 0.01 then
    raise exception 'exam_components_must_total_100';
  end if;
  if v_ca_weight > 0 and v_ca_components=0 then raise exception 'ca_assessments_missing'; end if;
  if v_exam_weight > 0 and v_exam_components=0 then raise exception 'exam_assessments_missing'; end if;

  if p_group is null then
    select count(*) into v_count from public.assessment_course_students(p_course);
    if exists (
      select 1 from public.assessment_course_students(p_course) r
      cross join public.course_assessments a
      left join public.course_assessment_scores s
        on s.assessment_id=a.id and s.student_user_id=r.user_id
      where a.course_id=p_course and a.academic_term_id=p_term
        and a.teaching_group_id is null and s.id is null
    ) then raise exception 'assessment_marks_incomplete'; end if;
  else
    select count(*) into v_count from public.assessment_teaching_group_students(p_group);
    if exists (
      select 1 from public.assessment_teaching_group_students(p_group) r
      cross join public.course_assessments a
      left join public.course_assessment_scores s
        on s.assessment_id=a.id and s.student_user_id=r.user_id
      where a.course_id=p_course and a.academic_term_id=p_term
        and a.teaching_group_id=p_group and s.id is null
    ) then raise exception 'assessment_marks_incomplete'; end if;
  end if;
  if v_count=0 then raise exception 'result_roster_empty'; end if;

  insert into public.course_result_sheets(course_id,academic_term_id,teaching_group_id,status,submitted_by,submitted_at,reviewed_by,reviewed_at,review_note,published_at,updated_at)
  values(p_course,p_term,p_group,'submitted',auth.uid(),now(),null,null,null,null,now())
  on conflict (course_id,academic_term_id,(coalesce(teaching_group_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do update set status='submitted',submitted_by=auth.uid(),submitted_at=now(),
    reviewed_by=null,reviewed_at=null,review_note=null,published_at=null,updated_at=now()
  where public.course_result_sheets.status in ('draft','rejected')
  returning id,status into v_sheet,v_status;
  if v_sheet is null then raise exception 'result_sheet_already_under_review_or_published'; end if;

  delete from public.course_result_entries where result_sheet_id=v_sheet;
  if p_group is null then
    insert into public.course_result_entries(result_sheet_id,student_user_id,ca_score,exam_score,final_score)
    select v_sheet,r.user_id,round(x.ca_score,2),round(x.exam_score,2),
      round(x.ca_score*v_ca_weight/100 + x.exam_score*v_exam_weight/100,2)
    from public.assessment_course_students(p_course) r
    cross join lateral (
      select coalesce(sum(case when a.assessment_type='ca' then s.score/a.max_score*a.weight_percent else 0 end),0) ca_score,
             coalesce(sum(case when a.assessment_type='exam' then s.score/a.max_score*a.weight_percent else 0 end),0) exam_score
      from public.course_assessments a
      join public.course_assessment_scores s on s.assessment_id=a.id and s.student_user_id=r.user_id
      where a.course_id=p_course and a.academic_term_id=p_term and a.teaching_group_id is null
    ) x;
  else
    insert into public.course_result_entries(result_sheet_id,student_user_id,ca_score,exam_score,final_score)
    select v_sheet,r.user_id,round(x.ca_score,2),round(x.exam_score,2),
      round(x.ca_score*v_ca_weight/100 + x.exam_score*v_exam_weight/100,2)
    from public.assessment_teaching_group_students(p_group) r
    cross join lateral (
      select coalesce(sum(case when a.assessment_type='ca' then s.score/a.max_score*a.weight_percent else 0 end),0) ca_score,
             coalesce(sum(case when a.assessment_type='exam' then s.score/a.max_score*a.weight_percent else 0 end),0) exam_score
      from public.course_assessments a
      join public.course_assessment_scores s on s.assessment_id=a.id and s.student_user_id=r.user_id
      where a.course_id=p_course and a.academic_term_id=p_term and a.teaching_group_id=p_group
    ) x;
  end if;

  perform public._campussign_write_audit('academic.course_results_submitted','course_result_sheet',v_sheet::text,null,
    jsonb_build_object('course_id',p_course,'term_id',p_term,'teaching_group_id',p_group,'student_count',v_count));
  return v_sheet;
end;
$$;

create or replace function public.review_course_result_sheet(
  p_sheet uuid, p_action text, p_note text default null
) returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare v_status text; v_course uuid; v_term uuid; v_group uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_access_required'; end if;
  if p_action not in ('approve','reject','publish') then raise exception 'result_action_invalid'; end if;
  select status,course_id,academic_term_id,teaching_group_id
    into v_status,v_course,v_term,v_group
  from public.course_result_sheets where id=p_sheet for update;
  if not found then raise exception 'result_sheet_not_found'; end if;
  if p_action='approve' and v_status<>'submitted' then raise exception 'only_submitted_results_can_be_approved'; end if;
  if p_action='reject' and v_status<>'submitted' then raise exception 'only_submitted_results_can_be_rejected'; end if;
  if p_action='publish' and v_status<>'approved' then raise exception 'only_approved_results_can_be_published'; end if;

  update public.course_result_sheets
  set status=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'published' end,
      reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(btrim(coalesce(p_note,'')),''),
      published_at=case when p_action='publish' then now() else null end,updated_at=now()
  where id=p_sheet;
  perform public._campussign_write_audit('academic.course_results_'||p_action,'course_result_sheet',p_sheet::text,null,
    jsonb_build_object('course_id',v_course,'term_id',v_term,'teaching_group_id',v_group,'note',p_note));
end;
$$;

create or replace function public.list_course_result_sheets()
returns table(id uuid,course_id uuid,course_code text,course_title text,academic_term_id uuid,term_name text,
  teaching_group_id uuid,teaching_group_name text,status text,student_count bigint,submitted_at timestamptz,reviewed_at timestamptz,
  review_note text,published_at timestamptz)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_access_required'; end if;
  return query
  select s.id,s.course_id,c.code,c.title,s.academic_term_id,t.name,s.teaching_group_id,g.name,s.status,
    count(e.id),s.submitted_at,s.reviewed_at,s.review_note,s.published_at
  from public.course_result_sheets s
  join public.academic_courses c on c.id=s.course_id
  join public.academic_terms t on t.id=s.academic_term_id
  left join public.course_teaching_groups g on g.id=s.teaching_group_id
  left join public.course_result_entries e on e.result_sheet_id=s.id
  group by s.id,c.code,c.title,t.name,g.name
  order by case s.status when 'submitted' then 0 when 'approved' then 1 else 2 end,s.submitted_at desc;
end;
$$;

create or replace function public.get_course_result_sheet_entries(p_sheet uuid)
returns table(student_id text,full_name text,ca_score numeric,exam_score numeric,final_score numeric)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_access_required'; end if;
  if not exists(select 1 from public.course_result_sheets where id=p_sheet) then
    raise exception 'result_sheet_not_found';
  end if;
  return query
  select sa.student_id,sa.full_name,e.ca_score,e.exam_score,e.final_score
  from public.course_result_entries e
  join public.student_accounts sa on sa.user_id=e.student_user_id
  where e.result_sheet_id=p_sheet
  order by sa.full_name,sa.student_id;
end;
$$;
create or replace function public.get_my_published_course_results()
returns table(course_code text,course_title text,term_name text,teaching_group_name text,
  ca_score numeric,exam_score numeric,final_score numeric,published_at timestamptz)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  return query
  select c.code,c.title,t.name,g.name,e.ca_score,e.exam_score,e.final_score,s.published_at
  from public.course_result_entries e
  join public.course_result_sheets s on s.id=e.result_sheet_id and s.status='published'
  join public.academic_courses c on c.id=s.course_id
  join public.academic_terms t on t.id=s.academic_term_id
  left join public.course_teaching_groups g on g.id=s.teaching_group_id
  where e.student_user_id=auth.uid()
  order by s.published_at desc,c.code;
end;
$$;

revoke all on function public.submit_course_results(uuid,uuid,uuid) from public,anon;
revoke all on function public.review_course_result_sheet(uuid,text,text) from public,anon;
revoke all on function public.list_course_result_sheets() from public,anon;
revoke all on function public.get_my_published_course_results() from public,anon;
revoke all on function public.get_course_result_sheet_entries(uuid) from public,anon;
grant execute on function public.submit_course_results(uuid,uuid,uuid) to authenticated;
grant execute on function public.review_course_result_sheet(uuid,text,text) to authenticated;
grant execute on function public.list_course_result_sheets() to authenticated;
grant execute on function public.get_my_published_course_results() to authenticated;
grant execute on function public.get_course_result_sheet_entries(uuid) to authenticated;
