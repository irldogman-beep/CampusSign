-- CampusSign Step 14: administrator-first student approval
-- Applied to Supabase project fmfvuljxmtijtgvflojg.
-- No existing roster, face-template, attendance or student-account rows are modified.

do $migration$
declare
  v text;
  old_text text;
begin
  -- Student submission is allowed only for the signed-in, administrator-approved account.
  v := pg_get_functiondef('public.submit_student_enrollment(text,text,text,text,text[],jsonb)'::regprocedure);
  old_text := $old$  nm text := trim(coalesce(p_name, ''));
  cr text;$old$;
  if position(old_text in v)=0 then raise exception 'submit declaration anchor missing'; end if;
  v := replace(v, old_text, $new$  nm text := trim(coalesce(p_name, ''));
  v_account public.student_accounts;
  cr text;$new$);
  old_text := $old$begin
  if length(sid) < 3 or length(sid) > 40 then raise exception 'invalid_student_id'; end if;$old$;
  if position(old_text in v)=0 then raise exception 'submit validation anchor missing'; end if;
  v := replace(v, old_text, $new$begin
  if auth.uid() is null then raise exception 'student_account_required'; end if;
  select * into v_account from public.student_accounts where user_id=auth.uid();
  if not found then raise exception 'student_account_required'; end if;
  if v_account.status <> 'approved' then raise exception 'student_account_not_approved'; end if;
  if upper(btrim(v_account.student_id)) <> sid
     or lower(btrim(v_account.full_name)) <> lower(nm)
     or lower(btrim(v_account.department)) <> lower(btrim(coalesce(p_dept,'')))
     or btrim(v_account.level) <> btrim(coalesce(p_level,'')) then
    raise exception 'student_account_details_mismatch';
  end if;
  if length(sid) < 3 or length(sid) > 40 then raise exception 'invalid_student_id'; end if;$new$);
  execute v;

  -- Lecturer queues only return requests with an approved, matching student account.
  v := pg_get_functiondef('public.list_my_enrollment_requests()'::regprocedure);
  old_text := $old$where r.lecturer_id = auth.uid() and r.status = 'pending'$old$;
  if position(old_text in v)=0 then raise exception 'lecturer list anchor missing'; end if;
  v := replace(v, old_text, $new$where r.lecturer_id = auth.uid() and r.status = 'pending'
      and exists (
        select 1 from public.student_accounts sa
        where sa.status='approved'
          and upper(btrim(sa.student_id))=upper(btrim(r.student_id))
          and lower(btrim(sa.full_name))=lower(btrim(r.student_name))
          and lower(btrim(sa.department))=lower(btrim(r.dept))
          and btrim(sa.level)=btrim(r.level)
      )$new$);
  execute v;

  -- Direct lecturer review calls are guarded independently of the list function.
  v := pg_get_functiondef('public.review_student_enrollment(uuid,text,boolean,text)'::regprocedure);
  old_text := $old$  if req.status <> 'pending' then raise exception 'request_already_reviewed'; end if;$old$;
  if position(old_text in v)=0 then raise exception 'lecturer review anchor missing'; end if;
  v := replace(v, old_text, $new$  if req.status <> 'pending' then raise exception 'request_already_reviewed'; end if;
  if not exists (
    select 1 from public.student_accounts sa
    where sa.status='approved'
      and upper(btrim(sa.student_id))=upper(btrim(req.student_id))
      and lower(btrim(sa.full_name))=lower(btrim(req.student_name))
      and lower(btrim(sa.department))=lower(btrim(req.dept))
      and btrim(sa.level)=btrim(req.level)
  ) then raise exception 'student_account_not_approved'; end if;$new$);
  execute v;
end
$migration$;

-- Administrator approval is the first gate. It deliberately does not require a
-- lecturer-created roster row, since lecturers must not see the request until
-- after this approval.
create or replace function public.admin_review_student_account(p_user_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_account public.student_accounts;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required'; end if;
  if p_decision is null or p_decision not in ('approve','reject') then raise exception 'invalid_decision'; end if;
  select * into v_account from public.student_accounts where user_id=p_user_id for update;
  if not found then raise exception 'student_account_not_found'; end if;
  if v_account.status <> 'pending' then raise exception 'student_account_already_reviewed'; end if;

  update public.student_accounts
     set status=case when p_decision='approve' then 'approved' else 'rejected' end,
         reviewed_at=now(), reviewed_by=auth.uid()
   where user_id=p_user_id;

  insert into public.audit_events(actor_id,actor_email,action,entity_type,entity_id,details)
  values(auth.uid(),auth.jwt()->>'email','student_account.'||p_decision,
         'student_account',p_user_id::text,
         jsonb_build_object('student_id',v_account.student_id,'name',v_account.full_name));

  return jsonb_build_object('status',case when p_decision='approve' then 'approved' else 'rejected' end);
end;
$function$;

-- The enrollment RPC is now authenticated-only. It also verifies the caller's
-- own approved student account before accepting course/face registration.
revoke all on function public.submit_student_enrollment(text,text,text,text,text[],jsonb) from PUBLIC, anon;
grant execute on function public.submit_student_enrollment(text,text,text,text,text[],jsonb) to authenticated;
