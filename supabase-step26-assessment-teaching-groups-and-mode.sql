-- CampusSign Step 26: university-first mode, lecturer-managed teaching groups and assessment policy
-- Additive migration. Existing student, attendance, assessment and academic history is preserved.

alter table public.academic_structure_settings
  add column if not exists secondary_mode_enabled boolean not null default false;

-- This installation is university-first. Secondary functionality remains explicitly disabled
-- until an administrator deliberately enables it in Academic structure.
update public.academic_structure_settings
set education_type = 'university',
    secondary_mode_enabled = false,
    updated_at = now()
where id = 1 and education_type = 'university';

create table if not exists public.course_teaching_groups (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academic_courses(id) on delete restrict,
  academic_term_id uuid not null references public.academic_terms(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, academic_term_id, name)
);

create table if not exists public.course_teaching_group_members (
  teaching_group_id uuid not null references public.course_teaching_groups(id) on delete cascade,
  student_user_id uuid not null references public.student_accounts(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (teaching_group_id, student_user_id)
);

create index if not exists course_teaching_groups_course_term_idx
  on public.course_teaching_groups(course_id, academic_term_id);
create index if not exists course_teaching_group_members_student_idx
  on public.course_teaching_group_members(student_user_id, teaching_group_id);

alter table public.course_assessments
  add column if not exists teaching_group_id uuid
  references public.course_teaching_groups(id) on delete restrict;

create index if not exists course_assessments_group_idx
  on public.course_assessments(teaching_group_id, academic_term_id);

create table if not exists public.course_assessment_policies (
  course_id uuid not null references public.academic_courses(id) on delete restrict,
  academic_term_id uuid not null references public.academic_terms(id) on delete restrict,
  ca_weight_percent numeric(5,2) not null default 40 check (ca_weight_percent between 0 and 100),
  exam_weight_percent numeric(5,2) not null default 60 check (exam_weight_percent between 0 and 100),
  attendance_enabled boolean not null default false,
  attendance_weight_percent numeric(5,2) not null default 0 check (attendance_weight_percent between 0 and 100),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(course_id, academic_term_id),
  check (ca_weight_percent + exam_weight_percent = 100),
  check ((attendance_enabled and attendance_weight_percent <= ca_weight_percent)
      or (not attendance_enabled and attendance_weight_percent = 0))
);

alter table public.course_teaching_groups enable row level security;
alter table public.course_teaching_group_members enable row level security;
alter table public.course_assessment_policies enable row level security;

drop policy if exists course_assessment_policies_read_scoped on public.course_assessment_policies;
create policy course_assessment_policies_read_scoped on public.course_assessment_policies
for select to authenticated using (
  (select public.is_admin())
  or exists (
    select 1 from public.lecturer_course_assignments lca
    join public.lecturers l on l.id = lca.lecturer_id
    where lca.course_id = course_assessment_policies.course_id
      and l.id = (select auth.uid()) and l.is_verified and l.role = 'lecturer'
  )
);

revoke all on public.course_teaching_groups, public.course_teaching_group_members, public.course_assessment_policies from anon, authenticated;
grant select on public.course_assessment_policies to authenticated;

create or replace function public.list_my_teaching_groups(p_course uuid, p_term uuid)
returns table(id uuid, course_id uuid, academic_term_id uuid, name text, student_count bigint, created_by uuid)
language plpgsql security definer set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not (public.is_admin() or exists (
    select 1 from public.lecturers l join public.lecturer_course_assignments a on a.lecturer_id=l.id
    where l.id=auth.uid() and l.role='lecturer' and l.is_verified and a.course_id=p_course
  )) then raise exception 'course_access_denied'; end if;
  return query
    select g.id,g.course_id,g.academic_term_id,g.name,count(m.student_user_id),g.created_by
    from public.course_teaching_groups g
    left join public.course_teaching_group_members m on m.teaching_group_id=g.id
    where g.course_id=p_course and g.academic_term_id=p_term
    group by g.id order by g.name;
end;
$$;

create or replace function public.save_teaching_group(
  p_id uuid, p_course uuid, p_term uuid, p_name text, p_student_users uuid[]
) returns uuid
language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name,'')); v_count integer;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.lecturers l join public.lecturer_course_assignments a on a.lecturer_id=l.id
    where l.id=auth.uid() and l.role='lecturer' and l.is_verified and a.course_id=p_course
  )) then raise exception 'course_access_denied'; end if;
  if length(v_name)<2 or length(v_name)>100 then raise exception 'teaching_group_name_invalid'; end if;
  if not exists(select 1 from public.academic_courses where id=p_course and is_active)
     or not exists(select 1 from public.academic_terms where id=p_term) then
    raise exception 'course_or_term_not_found';
  end if;
  if coalesce(cardinality(p_student_users),0)=0 then raise exception 'teaching_group_requires_students'; end if;
  select count(distinct x) into v_count from unnest(p_student_users) x;
  if v_count <> cardinality(p_student_users) then raise exception 'duplicate_student_in_group'; end if;
  if exists (
    select 1 from unnest(p_student_users) requested(user_id)
    where not exists (
      select 1 from public.assessment_course_students(p_course) eligible
      where eligible.user_id=requested.user_id
    )
  ) then raise exception 'student_not_registered_for_course'; end if;

  if p_id is null then
    insert into public.course_teaching_groups(course_id,academic_term_id,name,created_by)
    values(p_course,p_term,v_name,auth.uid()) returning id into v_id;
  else
    update public.course_teaching_groups
      set name=v_name,updated_at=now()
      where id=p_id and course_id=p_course and academic_term_id=p_term
        and (created_by=auth.uid() or public.is_admin())
      returning id into v_id;
    if v_id is null then raise exception 'teaching_group_not_found_or_not_owned'; end if;
  end if;

  delete from public.course_teaching_group_members
   where teaching_group_id=v_id and not (student_user_id = any(p_student_users));
  insert into public.course_teaching_group_members(teaching_group_id,student_user_id)
    select v_id, unnest(p_student_users)
    on conflict(teaching_group_id,student_user_id) do nothing;

  perform public._campussign_write_audit(
    case when p_id is null then 'academic.teaching_group_created' else 'academic.teaching_group_updated' end,
    'course_teaching_group',v_id::text,null,
    jsonb_build_object('course_id',p_course,'term_id',p_term,'name',v_name,'student_count',v_count)
  );
  return v_id;
end;
$$;

create or replace function public.assessment_teaching_group_students(p_group uuid)
returns table(user_id uuid, student_id text, full_name text, email text)
language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare v_course uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select g.course_id into v_course from public.course_teaching_groups g where g.id=p_group;
  if not found then raise exception 'teaching_group_not_found'; end if;
  if not (public.is_admin() or exists (
    select 1 from public.lecturers l join public.lecturer_course_assignments a on a.lecturer_id=l.id
    where l.id=auth.uid() and l.role='lecturer' and l.is_verified and a.course_id=v_course
  )) then raise exception 'course_access_denied'; end if;
  return query
    select sa.user_id,sa.student_id,sa.full_name,u.email::text
    from public.course_teaching_group_members m
    join public.student_accounts sa on sa.user_id=m.student_user_id and sa.status='approved'
    join auth.users u on u.id=sa.user_id
    where m.teaching_group_id=p_group
    order by sa.full_name;
end;
$$;

create or replace function public.save_course_assessment_for_group(
  p_id uuid, p_course uuid, p_term uuid, p_group uuid, p_title text, p_type text,
  p_max_score numeric, p_weight_percent numeric, p_due_on date default null
) returns uuid
language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare v_id uuid; v_used numeric := 0; v_title text := btrim(coalesce(p_title,''));
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.lecturers l join public.lecturer_course_assignments a on a.lecturer_id=l.id
    where l.id=auth.uid() and l.role='lecturer' and l.is_verified and a.course_id=p_course
  )) then raise exception 'course_access_denied'; end if;
  if length(v_title)<2 or length(v_title)>120 then raise exception 'assessment_title_invalid'; end if;
  if p_type not in ('ca','exam') then raise exception 'assessment_type_invalid'; end if;
  if p_max_score is null or p_max_score<=0 or p_max_score>10000 then raise exception 'assessment_max_score_invalid'; end if;
  if p_weight_percent is null or p_weight_percent<=0 or p_weight_percent>100 then raise exception 'assessment_weight_invalid'; end if;
  if not exists(select 1 from public.academic_courses where id=p_course and is_active)
     or not exists(select 1 from public.academic_terms where id=p_term) then raise exception 'course_or_term_not_found'; end if;
  if p_group is not null and not exists(
    select 1 from public.course_teaching_groups where id=p_group and course_id=p_course and academic_term_id=p_term
  ) then raise exception 'teaching_group_course_term_mismatch'; end if;
  if p_id is not null and not exists(
    select 1 from public.course_assessments where id=p_id and course_id=p_course
      and teaching_group_id is not distinct from p_group
  ) then raise exception 'assessment_not_found'; end if;
  if p_id is not null and exists(select 1 from public.course_assessment_scores where assessment_id=p_id and score>p_max_score)
    then raise exception 'assessment_max_below_existing_score'; end if;
  select coalesce(sum(weight_percent),0) into v_used from public.course_assessments
   where course_id=p_course and academic_term_id=p_term and assessment_type=p_type
     and teaching_group_id is not distinct from p_group and (p_id is null or id<>p_id);
  if v_used+p_weight_percent>100.01 then raise exception 'assessment_weight_exceeds_100'; end if;

  if p_id is null then
    insert into public.course_assessments(course_id,academic_term_id,teaching_group_id,title,assessment_type,max_score,weight_percent,due_on,created_by)
    values(p_course,p_term,p_group,v_title,p_type,p_max_score,p_weight_percent,p_due_on,auth.uid()) returning id into v_id;
  else
    update public.course_assessments set academic_term_id=p_term,teaching_group_id=p_group,title=v_title,
      assessment_type=p_type,max_score=p_max_score,weight_percent=p_weight_percent,due_on=p_due_on,updated_at=now()
    where id=p_id and course_id=p_course returning id into v_id;
  end if;
  perform public._campussign_write_audit(
    case when p_id is null then 'academic.assessment_created' else 'academic.assessment_updated' end,
    'course_assessment',v_id::text,null,
    jsonb_build_object('course_id',p_course,'term_id',p_term,'teaching_group_id',p_group,'title',v_title,'type',p_type,'weight_percent',p_weight_percent)
  );
  return v_id;
end;
$$;

create or replace function public.save_course_assessment_policy(
  p_course uuid, p_term uuid, p_ca_weight numeric, p_exam_weight numeric,
  p_attendance_enabled boolean, p_attendance_weight numeric
) returns void
language plpgsql security definer set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.lecturers l join public.lecturer_course_assignments a on a.lecturer_id=l.id
    where l.id=auth.uid() and l.role='lecturer' and l.is_verified and a.course_id=p_course
  )) then raise exception 'course_access_denied'; end if;
  if p_ca_weight is null or p_exam_weight is null or p_ca_weight<0 or p_exam_weight<0
     or round(p_ca_weight+p_exam_weight,2)<>100 then raise exception 'assessment_split_must_total_100';
  end if;
  if p_attendance_weight is null or p_attendance_weight<0 or p_attendance_weight>p_ca_weight
     or (coalesce(p_attendance_enabled,false)=false and p_attendance_weight<>0) then
    raise exception 'attendance_weight_invalid';
  end if;
  insert into public.course_assessment_policies(course_id,academic_term_id,ca_weight_percent,exam_weight_percent,attendance_enabled,attendance_weight_percent,updated_by,updated_at)
  values(p_course,p_term,p_ca_weight,p_exam_weight,coalesce(p_attendance_enabled,false),p_attendance_weight,auth.uid(),now())
  on conflict(course_id,academic_term_id) do update set
    ca_weight_percent=excluded.ca_weight_percent,exam_weight_percent=excluded.exam_weight_percent,
    attendance_enabled=excluded.attendance_enabled,attendance_weight_percent=excluded.attendance_weight_percent,
    updated_by=excluded.updated_by,updated_at=now();
  perform public._campussign_write_audit('academic.assessment_policy_updated','course_assessment_policy',p_course::text,null,
    jsonb_build_object('term_id',p_term,'ca_weight_percent',p_ca_weight,'exam_weight_percent',p_exam_weight,'attendance_enabled',p_attendance_enabled,'attendance_weight_percent',p_attendance_weight));
end;
$$;

create or replace function public.get_course_assessment_policy(p_course uuid,p_term uuid)
returns table(ca_weight_percent numeric,exam_weight_percent numeric,attendance_enabled boolean,attendance_weight_percent numeric)
language plpgsql security definer set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not (public.is_admin() or exists (
    select 1 from public.lecturers l join public.lecturer_course_assignments a on a.lecturer_id=l.id
    where l.id=auth.uid() and l.role='lecturer' and l.is_verified and a.course_id=p_course
  )) then raise exception 'course_access_denied'; end if;
  return query select p.ca_weight_percent,p.exam_weight_percent,p.attendance_enabled,p.attendance_weight_percent
    from public.course_assessment_policies p where p.course_id=p_course and p.academic_term_id=p_term;
  if not found then return query select 40::numeric,60::numeric,false,0::numeric; end if;
end;
$$;

-- Preserve the existing score-saving contract, adding group membership enforcement.
create or replace function public.save_course_assessment_score(
  p_assessment uuid, p_student_user_id uuid, p_score numeric, p_feedback text default null
) returns uuid
language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare v_course uuid; v_group uuid; v_max numeric; v_code text; v_title text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select a.course_id,a.teaching_group_id,a.max_score,c.code,c.title into v_course,v_group,v_max,v_code,v_title
  from public.course_assessments a join public.academic_courses c on c.id=a.course_id where a.id=p_assessment;
  if not found then raise exception 'assessment_not_found'; end if;
  if not exists (
    select 1 from public.lecturers l join public.lecturer_course_assignments a on a.lecturer_id=l.id
    where l.id=auth.uid() and l.role='lecturer' and l.is_verified and a.course_id=v_course
  )) then raise exception 'course_access_denied'; end if;
  if p_score is null or p_score<0 or p_score>v_max then raise exception 'score_out_of_range'; end if;
  if v_group is not null then
    if not exists(select 1 from public.course_teaching_group_members m where m.teaching_group_id=v_group and m.student_user_id=p_student_user_id) then
      raise exception 'student_not_in_teaching_group';
    end if;
  elsif not exists (
    select 1 from public.student_accounts sa join public.students st
      on upper(btrim(st.student_id))=upper(btrim(sa.student_id))
     and lower(btrim(st.name))=lower(btrim(sa.full_name))
    where sa.user_id=p_student_user_id and sa.status='approved'
      and upper(btrim(st.course)) in (upper(v_code),upper(v_title),upper(v_code || ' - ' || v_title))
  ) then raise exception 'student_not_in_course_roster'; end if;

  insert into public.course_assessment_scores(assessment_id,student_user_id,score,feedback,recorded_by)
  values(p_assessment,p_student_user_id,p_score,nullif(btrim(coalesce(p_feedback,'')),''),auth.uid())
  on conflict(assessment_id,student_user_id) do update set score=excluded.score,feedback=excluded.feedback,
    recorded_by=excluded.recorded_by,updated_at=now() returning id into v_id;
  perform public._campussign_write_audit('academic.assessment_score_saved','course_assessment_score',v_id::text,null,
    jsonb_build_object('assessment_id',p_assessment,'student_user_id',p_student_user_id,'score',p_score,'max_score',v_max,'teaching_group_id',v_group));
  return v_id;
end;
$$;

revoke all on function public.save_course_assessment(uuid,uuid,uuid,text,text,numeric,numeric,date) from public,anon,authenticated;
revoke all on function public.list_my_teaching_groups(uuid,uuid) from public,anon;
revoke all on function public.save_teaching_group(uuid,uuid,uuid,text,uuid[]) from public,anon;
revoke all on function public.assessment_teaching_group_students(uuid) from public,anon;
revoke all on function public.save_course_assessment_for_group(uuid,uuid,uuid,uuid,text,text,numeric,numeric,date) from public,anon;
revoke all on function public.save_course_assessment_policy(uuid,uuid,numeric,numeric,boolean,numeric) from public,anon;
revoke all on function public.get_course_assessment_policy(uuid,uuid) from public,anon;
revoke all on function public.save_course_assessment_score(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.list_my_teaching_groups(uuid,uuid) to authenticated;
grant execute on function public.save_teaching_group(uuid,uuid,uuid,text,uuid[]) to authenticated;
grant execute on function public.assessment_teaching_group_students(uuid) to authenticated;
grant execute on function public.save_course_assessment_for_group(uuid,uuid,uuid,uuid,text,text,numeric,numeric,date) to authenticated;
grant execute on function public.save_course_assessment_policy(uuid,uuid,numeric,numeric,boolean,numeric) to authenticated;
grant execute on function public.get_course_assessment_policy(uuid,uuid) to authenticated;
grant execute on function public.save_course_assessment_score(uuid,uuid,numeric,text) to authenticated;

grant select on public.course_assessments to authenticated;
