-- CampusSign Step 29: published results automatically update course-attempt history
-- Additive only. Failed attempts remain in history; later passing attempts clear the outstanding course.
alter table public.academic_structure_settings
  add column if not exists pass_mark numeric(5,2) not null default 40
  check (pass_mark between 0 and 100);

alter table public.student_course_attempts
  add column if not exists result_sheet_id uuid references public.course_result_sheets(id) on delete restrict,
  add column if not exists final_score numeric(6,2);

alter table public.student_course_attempts
  drop constraint if exists student_course_attempts_final_score_check;
alter table public.student_course_attempts
  add constraint student_course_attempts_final_score_check
  check (final_score is null or final_score between 0 and 100);
create unique index if not exists student_course_attempts_result_entry_uidx
  on public.student_course_attempts(result_sheet_id, student_user_id)
  where result_sheet_id is not null;
create index if not exists student_course_attempts_result_course_idx
  on public.student_course_attempts(student_user_id, course_id, academic_term_id);

create or replace function public.sync_published_result_to_course_attempts(p_sheet uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_course uuid;
  v_term uuid;
  v_status text;
  v_pass_mark numeric := 40;
  v_attempt_id uuid;
  v_attempt_number smallint;
  v_written integer := 0;
  v_entry record;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_access_required'; end if;
  select course_id, academic_term_id, status into v_course, v_term, v_status
  from public.course_result_sheets where id=p_sheet;
  if not found then raise exception 'result_sheet_not_found'; end if;
  if v_status <> 'published' then raise exception 'result_sheet_not_published'; end if;
  select pass_mark into v_pass_mark from public.academic_structure_settings where id=1;
  v_pass_mark := coalesce(v_pass_mark,40);

  for v_entry in
    select student_user_id, final_score from public.course_result_entries where result_sheet_id=p_sheet
  loop
    if exists (
      select 1 from public.student_course_attempts
      where student_user_id=v_entry.student_user_id and course_id=v_course and academic_term_id=v_term
        and result_sheet_id is not null and result_sheet_id<>p_sheet
    ) then raise exception 'student_has_multiple_result_sheets_for_course_term'; end if;

    select id, attempt_number into v_attempt_id, v_attempt_number
    from public.student_course_attempts
    where student_user_id=v_entry.student_user_id and course_id=v_course and academic_term_id=v_term
    order by attempt_number desc limit 1;

    if found then
      update public.student_course_attempts
      set result_sheet_id=p_sheet, final_score=v_entry.final_score,
          status=case when v_entry.final_score>=v_pass_mark then 'passed' else 'failed' end,
          grade=case when v_entry.final_score>=v_pass_mark then 'PASS' else 'FAIL' end,
          result_note='Automatically recorded from published course results',
          recorded_by=auth.uid(), updated_at=now()
      where id=v_attempt_id;
    else
      select (coalesce(max(attempt_number),0)+1)::smallint into v_attempt_number
      from public.student_course_attempts
      where student_user_id=v_entry.student_user_id and course_id=v_course;
      if v_attempt_number>20 then raise exception 'course_attempt_limit_reached'; end if;
      insert into public.student_course_attempts(
        student_user_id,course_id,academic_term_id,attempt_number,status,grade,result_note,recorded_by,result_sheet_id,final_score
      ) values (
        v_entry.student_user_id,v_course,v_term,v_attempt_number,
        case when v_entry.final_score>=v_pass_mark then 'passed' else 'failed' end,
        case when v_entry.final_score>=v_pass_mark then 'PASS' else 'FAIL' end,
        'Automatically recorded from published course results',auth.uid(),p_sheet,v_entry.final_score
      );
    end if;
    v_written := v_written+1;
  end loop;

  perform public._campussign_write_audit('academic.course_attempts_synced','course_result_sheet',p_sheet::text,null,
    jsonb_build_object('course_id',v_course,'term_id',v_term,'student_count',v_written,'pass_mark',v_pass_mark));
  return v_written;
end;
$$;

create or replace function public.review_course_result_sheet(
  p_sheet uuid, p_action text, p_note text default null
) returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare v_status text; v_course uuid; v_term uuid; v_group uuid; v_count integer;
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
  if p_action='publish' then
    v_count := public.sync_published_result_to_course_attempts(p_sheet);
  end if;
  perform public._campussign_write_audit('academic.course_results_'||p_action,'course_result_sheet',p_sheet::text,null,
    jsonb_build_object('course_id',v_course,'term_id',v_term,'teaching_group_id',v_group,'note',p_note,'attempts_synced',v_count));
end;
$$;

revoke all on function public.sync_published_result_to_course_attempts(uuid) from public,anon,authenticated;
grant execute on function public.review_course_result_sheet(uuid,text,text) to authenticated;
