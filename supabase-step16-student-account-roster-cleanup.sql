create or replace function public.admin_delete_student_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_account public.student_accounts;
  v_requests integer := 0;
  v_roster_entries integer := 0;
  v_face_templates integer := 0;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin_required';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'student_account_not_found';
  end if;

  select * into v_account
    from public.student_accounts
   where user_id = p_user_id
   for update;
  if not found then
    raise exception 'student_account_not_found';
  end if;

  if exists (select 1 from public.lecturers where id = p_user_id) then
    raise exception 'student_account_not_found';
  end if;

  delete from public.app_notifications n
   using public.student_enrollment_requests r
   where n.notification_type = 'enrollment_request'
     and n.entity_type = 'enrollment_request'
     and n.entity_id = r.id::text
     and upper(btrim(r.student_id)) = upper(btrim(v_account.student_id))
     and lower(btrim(r.student_name)) = lower(btrim(v_account.full_name))
     and lower(btrim(r.dept)) = lower(btrim(v_account.department));

  delete from public.student_enrollment_requests
   where upper(btrim(student_id)) = upper(btrim(v_account.student_id))
     and lower(btrim(student_name)) = lower(btrim(v_account.full_name))
     and lower(btrim(dept)) = lower(btrim(v_account.department));
  get diagnostics v_requests = row_count;

  select count(*) into v_face_templates
    from public.face_templates ft
    join public.students st on st.id = ft.student_pk
   where upper(btrim(st.student_id)) = upper(btrim(v_account.student_id))
     and lower(btrim(st.name)) = lower(btrim(v_account.full_name))
     and lower(btrim(st.dept)) = lower(btrim(v_account.department));

  delete from public.students
   where upper(btrim(student_id)) = upper(btrim(v_account.student_id))
     and lower(btrim(name)) = lower(btrim(v_account.full_name))
     and lower(btrim(dept)) = lower(btrim(v_account.department));
  get diagnostics v_roster_entries = row_count;

  insert into public.audit_events(actor_id, actor_email, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    'admin.student_account_deleted',
    'student_account',
    p_user_id::text,
    jsonb_build_object(
      'student_id', v_account.student_id,
      'student_name', v_account.full_name,
      'enrollment_requests_deleted', v_requests,
      'roster_entries_deleted', v_roster_entries,
      'face_templates_deleted', v_face_templates,
      'historical_attendance_preserved', true
    )
  );

  delete from auth.users where id = p_user_id;
  if not found then
    raise exception 'student_account_not_found';
  end if;

  return jsonb_build_object(
    'deleted', true,
    'enrollment_requests_deleted', v_requests,
    'roster_entries_deleted', v_roster_entries,
    'face_templates_deleted', v_face_templates,
    'historical_attendance_preserved', true
  );
end;
$function$;