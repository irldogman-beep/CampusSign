-- CampusSign Step 27: preserve the legacy lecturer assessment RPC during frontend rollout.
-- The updated UI uses save_course_assessment_for_group; older deployed clients still call this signature.
create or replace function public.save_course_assessment(
  p_id uuid, p_course uuid, p_term uuid, p_title text, p_type text,
  p_max_score numeric, p_weight_percent numeric, p_due_on date default null
) returns uuid
language plpgsql security definer set search_path = public, auth, pg_temp
as $$
begin
  return public.save_course_assessment_for_group(
    p_id, p_course, p_term, null, p_title, p_type, p_max_score, p_weight_percent, p_due_on
  );
end;
$$;
revoke all on function public.save_course_assessment(uuid,uuid,uuid,text,text,numeric,numeric,date) from public, anon;
grant execute on function public.save_course_assessment(uuid,uuid,uuid,text,text,numeric,numeric,date) to authenticated;
