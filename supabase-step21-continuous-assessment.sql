-- CampusSign Step 21: Continuous assessment and examination records
-- Additive only. Existing academic, attendance and student records are untouched.

create table if not exists public.course_assessments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academic_courses(id) on delete restrict,
  academic_term_id uuid not null references public.academic_terms(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  assessment_type text not null check (assessment_type in ('ca','exam')),
  max_score numeric(8,2) not null check (max_score > 0 and max_score <= 10000),
  weight_percent numeric(5,2) not null check (weight_percent > 0 and weight_percent <= 100),
  due_on date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_assessments_course_term_idx
  on public.course_assessments(course_id, academic_term_id, assessment_type);

create table if not exists public.course_assessment_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.course_assessments(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  score numeric(8,2) not null check (score >= 0),
  feedback text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, student_user_id)
);

create index if not exists course_assessment_scores_student_idx
  on public.course_assessment_scores(student_user_id, assessment_id);

alter table public.course_assessments enable row level security;
alter table public.course_assessment_scores enable row level security;

drop policy if exists course_assessments_read_authenticated on public.course_assessments;
create policy course_assessments_read_authenticated
  on public.course_assessments for select to authenticated
  using (auth.uid() is not null);

drop policy if exists course_assessment_scores_read_scoped on public.course_assessment_scores;
create policy course_assessment_scores_read_scoped
  on public.course_assessment_scores for select to authenticated
  using (
    student_user_id = (select auth.uid())
    or (select public.is_admin())
    or exists (
      select 1
      from public.course_assessments a
      join public.lecturer_course_assignments lca on lca.course_id = a.course_id
      join public.lecturers l on l.id = lca.lecturer_id
      where a.id = course_assessment_scores.assessment_id
        and l.id = (select auth.uid())
        and l.role = 'lecturer'
        and l.is_verified = true
    )
  );

revoke all on public.course_assessments from anon, authenticated;
revoke all on public.course_assessment_scores from anon, authenticated;
grant select on public.course_assessments, public.course_assessment_scores to authenticated;

create or replace function public.assessment_course_students(p_course uuid)
returns table(user_id uuid, student_id text, full_name text, email text)
language plpgsql
security definer
set search_path = public
as $$
declare v_code text; v_title text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not (
    public.is_admin()
    or exists (
      select 1 from public.lecturers l
      join public.lecturer_course_assignments a on a.lecturer_id = l.id
      where l.id = auth.uid() and l.role = 'lecturer' and l.is_verified and a.course_id = p_course
    )
  ) then raise exception 'course_access_denied'; end if;

  select c.code, c.title into v_code, v_title
  from public.academic_courses c where c.id = p_course and c.is_active;
  if not found then raise exception 'course_not_found'; end if;

  return query
  select distinct sa.user_id, sa.student_id, sa.full_name, u.email::text
  from public.student_accounts sa
  join auth.users u on u.id = sa.user_id
  join public.students st
    on upper(btrim(st.student_id)) = upper(btrim(sa.student_id))
   and lower(btrim(st.name)) = lower(btrim(sa.full_name))
  where sa.status = 'approved'
    and upper(btrim(st.course)) in (
      upper(v_code), upper(v_title), upper(v_code || ' - ' || v_title)
    )
  order by sa.full_name;
end;
$$;

create or replace function public.save_course_assessment(
  p_id uuid,
  p_course uuid,
  p_term uuid,
  p_title text,
  p_type text,
  p_max_score numeric,
  p_weight_percent numeric,
  p_due_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_used numeric := 0; v_title text := btrim(coalesce(p_title,''));
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not (
    public.is_admin()
    or exists (
      select 1 from public.lecturers l
      join public.lecturer_course_assignments a on a.lecturer_id = l.id
      where l.id = auth.uid() and l.role = 'lecturer' and l.is_verified and a.course_id = p_course
    )
  ) then raise exception 'course_access_denied'; end if;
  if length(v_title) < 2 or length(v_title) > 120 then raise exception 'assessment_title_invalid'; end if;
  if p_type not in ('ca','exam') then raise exception 'assessment_type_invalid'; end if;
  if p_max_score is null or p_max_score <= 0 or p_max_score > 10000 then raise exception 'assessment_max_score_invalid'; end if;
  if p_weight_percent is null or p_weight_percent <= 0 or p_weight_percent > 100 then raise exception 'assessment_weight_invalid'; end if;
  if not exists(select 1 from public.academic_courses where id=p_course and is_active) then raise exception 'course_not_found'; end if;
  if not exists(select 1 from public.academic_terms where id=p_term) then raise exception 'academic_term_not_found'; end if;

  select coalesce(sum(weight_percent),0) into v_used
  from public.course_assessments
  where course_id=p_course and academic_term_id=p_term and assessment_type=p_type
    and (p_id is null or id <> p_id);
  if v_used + p_weight_percent > 100.01 then
    raise exception 'assessment_weight_exceeds_100: current %, proposed %', v_used, p_weight_percent;
  end if;

  if p_id is null then
    insert into public.course_assessments(course_id,academic_term_id,title,assessment_type,max_score,weight_percent,due_on,created_by)
    values(p_course,p_term,v_title,p_type,p_max_score,p_weight_percent,p_due_on,auth.uid())
    returning id into v_id;
  else
    update public.course_assessments
       set course_id=p_course, academic_term_id=p_term, title=v_title,
           assessment_type=p_type, max_score=p_max_score,
           weight_percent=p_weight_percent, due_on=p_due_on, updated_at=now()
     where id=p_id returning id into v_id;
    if v_id is null then raise exception 'assessment_not_found'; end if;
  end if;
  perform public._campussign_write_audit(
    case when p_id is null then 'academic.assessment_created' else 'academic.assessment_updated' end,
    'course_assessment',v_id::text,null,
    jsonb_build_object('course_id',p_course,'term_id',p_term,'title',v_title,'type',p_type,'weight_percent',p_weight_percent)
  );
  return v_id;
end;
$$;

create or replace function public.save_course_assessment_score(
  p_assessment uuid,
  p_student_user_id uuid,
  p_score numeric,
  p_feedback text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_course uuid; v_max numeric; v_code text; v_title text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select a.course_id,a.max_score,c.code,c.title into v_course,v_max,v_code,v_title
  from public.course_assessments a
  join public.academic_courses c on c.id=a.course_id
  where a.id=p_assessment;
  if not found then raise exception 'assessment_not_found'; end if;
  if not (
    public.is_admin()
    or exists (
      select 1 from public.lecturers l
      join public.lecturer_course_assignments a on a.lecturer_id=l.id
      where l.id=auth.uid() and l.role='lecturer' and l.is_verified and a.course_id=v_course
    )
  ) then raise exception 'course_access_denied'; end if;
  if p_score is null or p_score < 0 or p_score > v_max then raise exception 'score_out_of_range'; end if;
  if not exists (
    select 1 from public.student_accounts sa
    join public.students st
      on upper(btrim(st.student_id))=upper(btrim(sa.student_id))
     and lower(btrim(st.name))=lower(btrim(sa.full_name))
    where sa.user_id=p_student_user_id and sa.status='approved'
      and upper(btrim(st.course)) in (upper(v_code),upper(v_title),upper(v_code || ' - ' || v_title))
  ) then raise exception 'student_not_in_course_roster'; end if;

  insert into public.course_assessment_scores(assessment_id,student_user_id,score,feedback,recorded_by)
  values(p_assessment,p_student_user_id,p_score,nullif(btrim(coalesce(p_feedback,'')),''),auth.uid())
  on conflict(assessment_id,student_user_id)
  do update set score=excluded.score,feedback=excluded.feedback,recorded_by=excluded.recorded_by,updated_at=now()
  returning id into v_id;

  perform public._campussign_write_audit('academic.assessment_score_saved','course_assessment_score',v_id::text,null,
    jsonb_build_object('assessment_id',p_assessment,'student_user_id',p_student_user_id,'score',p_score,'max_score',v_max));
  return v_id;
end;
$$;

revoke all on function public.assessment_course_students(uuid) from public, anon;
revoke all on function public.save_course_assessment(uuid,uuid,uuid,text,text,numeric,numeric,date) from public, anon;
revoke all on function public.save_course_assessment_score(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.assessment_course_students(uuid) to authenticated;
grant execute on function public.save_course_assessment(uuid,uuid,uuid,text,text,numeric,numeric,date) to authenticated;
grant execute on function public.save_course_assessment_score(uuid,uuid,numeric,text) to authenticated;
