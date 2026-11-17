-- CampusSign Step 22: tighten assessment edit scope and score integrity
-- Lecturers may edit assessments only within the course they already own.
-- Existing marks must remain within the assessment's updated maximum score.

create or replace function public.save_course_assessment(
  p_id uuid, p_course uuid, p_term uuid, p_title text, p_type text,
  p_max_score numeric, p_weight_percent numeric, p_due_on date default null
)
returns uuid language plpgsql security definer set search_path = public
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

  if p_id is not null and not exists (
    select 1 from public.course_assessments where id=p_id and course_id=p_course
  ) then raise exception 'assessment_not_found'; end if;

  if p_id is not null and exists (
    select 1 from public.course_assessment_scores where assessment_id=p_id and score > p_max_score
  ) then raise exception 'assessment_max_below_existing_score'; end if;

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
       set academic_term_id=p_term, title=v_title, assessment_type=p_type,
           max_score=p_max_score, weight_percent=p_weight_percent,
           due_on=p_due_on, updated_at=now()
     where id=p_id and course_id=p_course returning id into v_id;
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

revoke all on function public.save_course_assessment(uuid,uuid,uuid,text,text,numeric,numeric,date) from public, anon;
grant execute on function public.save_course_assessment(uuid,uuid,uuid,text,text,numeric,numeric,date) to authenticated;
