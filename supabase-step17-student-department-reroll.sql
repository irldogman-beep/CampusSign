-- CampusSign Step 17: Admin-approved student department reroll
-- Applied to the connected CampusSign Supabase project.
-- A reroll changes the department only after admin approval and student confirmation.
-- Existing course requests, lecturer roster rows and face templates are cleared on apply.
-- Historical attendance rows are intentionally retained.

create table if not exists public.student_department_reroll_requests (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references auth.users(id) on delete cascade,
  current_department text not null,
  requested_department text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','applied')),
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  applied_at timestamptz,
  constraint student_department_reroll_reason_length check (char_length(btrim(reason)) between 10 and 500),
  constraint student_department_reroll_departments_differ check (lower(btrim(current_department)) <> lower(btrim(requested_department)))
);
create index if not exists student_department_reroll_status_created_idx on public.student_department_reroll_requests(status, created_at desc);
create index if not exists student_department_reroll_user_created_idx on public.student_department_reroll_requests(student_user_id, created_at desc);
alter table public.student_department_reroll_requests enable row level security;
revoke all on table public.student_department_reroll_requests from public, anon, authenticated;

create or replace function public.student_request_department_reroll(p_department text, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public','auth','pg_temp'
as $function$
declare v_account public.student_accounts; v_department text; v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_account from public.student_accounts where user_id=auth.uid() for update;
  if not found then raise exception 'student_account_not_found'; end if;
  if v_account.status <> 'approved' then raise exception 'student_account_not_approved'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 10 or char_length(btrim(p_reason)) > 500 then raise exception 'reroll_reason_invalid'; end if;
  select d.name into v_department from public.academic_departments d where d.is_active and lower(d.name)=lower(btrim(coalesce(p_department,'')));
  if v_department is null then raise exception 'department_not_found'; end if;
  if lower(v_department)=lower(v_account.department) then raise exception 'same_department'; end if;
  if exists (select 1 from public.student_department_reroll_requests r where r.student_user_id=auth.uid() and r.status in ('pending','approved')) then raise exception 'reroll_request_already_active'; end if;
  insert into public.student_department_reroll_requests(student_user_id,current_department,requested_department,reason)
  values(auth.uid(),v_account.department,v_department,btrim(p_reason)) returning id into v_request_id;
  insert into public.audit_events(actor_id,actor_email,action,entity_type,entity_id,details)
  values(auth.uid(),auth.jwt()->>'email','student.department_reroll_requested','student_account',auth.uid()::text,
    jsonb_build_object('request_id',v_request_id,'from',v_account.department,'to',v_department));
  return jsonb_build_object('request_id',v_request_id,'status','pending');
end;
$function$;

create or replace function public.student_get_department_reroll_status()
returns jsonb language plpgsql stable security definer set search_path to 'public','auth','pg_temp'
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select jsonb_build_object('id',r.id,'current_department',r.current_department,'requested_department',r.requested_department,
    'reason',r.reason,'status',r.status,'admin_note',r.admin_note,'created_at',r.created_at,
    'reviewed_at',r.reviewed_at,'applied_at',r.applied_at)
  into v_result from public.student_department_reroll_requests r
  where r.student_user_id=auth.uid() order by r.created_at desc limit 1;
  return v_result;
end;
$function$;

create or replace function public.admin_list_department_rerolls()
returns table(request_id uuid,student_user_id uuid,student_id text,full_name text,email text,
  current_department text,requested_department text,reason text,status text,admin_note text,
  created_at timestamptz,reviewed_at timestamptz)
language plpgsql security definer set search_path to 'public','auth','pg_temp'
as $function$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required'; end if;
  return query select r.id,r.student_user_id,sa.student_id,sa.full_name,u.email::text,
    r.current_department,r.requested_department,r.reason,r.status,r.admin_note,r.created_at,r.reviewed_at
  from public.student_department_reroll_requests r
  join public.student_accounts sa on sa.user_id=r.student_user_id
  join auth.users u on u.id=r.student_user_id
  order by case r.status when 'pending' then 0 when 'approved' then 1 else 2 end,r.created_at desc;
end;
$function$;

create or replace function public.admin_review_department_reroll(p_request_id uuid,p_decision text,p_admin_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public','auth','pg_temp'
as $function$
declare v_request public.student_department_reroll_requests;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required'; end if;
  if p_decision not in ('approve','reject') then raise exception 'invalid_decision'; end if;
  select * into v_request from public.student_department_reroll_requests where id=p_request_id for update;
  if not found then raise exception 'reroll_request_not_found'; end if;
  if v_request.status <> 'pending' then raise exception 'reroll_request_already_reviewed'; end if;
  update public.student_department_reroll_requests set status=case when p_decision='approve' then 'approved' else 'rejected' end,
    admin_note=nullif(btrim(coalesce(p_admin_note,'')),''),reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id;
  insert into public.audit_events(actor_id,actor_email,action,entity_type,entity_id,details)
  values(auth.uid(),auth.jwt()->>'email','student.department_reroll_'||p_decision,'student_account',v_request.student_user_id::text,
    jsonb_build_object('request_id',p_request_id,'from',v_request.current_department,'to',v_request.requested_department,
      'admin_note',nullif(btrim(coalesce(p_admin_note,'')),'')));
  return jsonb_build_object('status',case when p_decision='approve' then 'approved' else 'rejected' end);
end;
$function$;

create or replace function public.student_apply_department_reroll()
returns jsonb language plpgsql security definer set search_path to 'public','auth','pg_temp'
as $function$
declare v_account public.student_accounts; v_request public.student_department_reroll_requests;
  v_requests_deleted integer:=0; v_roster_deleted integer:=0;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_account from public.student_accounts where user_id=auth.uid() for update;
  if not found then raise exception 'student_account_not_found'; end if;
  if v_account.status <> 'approved' then raise exception 'student_account_not_approved'; end if;
  select * into v_request from public.student_department_reroll_requests
  where student_user_id=auth.uid() and status='approved' order by reviewed_at desc limit 1 for update;
  if not found then raise exception 'reroll_not_approved'; end if;
  if lower(v_account.department) <> lower(v_request.current_department) then raise exception 'reroll_account_department_changed'; end if;
  if not exists(select 1 from public.academic_departments d where d.is_active and lower(d.name)=lower(v_request.requested_department)) then raise exception 'department_not_found'; end if;
  update public.student_accounts set department=v_request.requested_department where user_id=auth.uid();
  delete from public.app_notifications n using public.student_enrollment_requests r
  where n.notification_type='enrollment_request' and n.entity_type='enrollment_request' and n.entity_id=r.id::text
    and upper(btrim(r.student_id))=upper(btrim(v_account.student_id));
  delete from public.student_enrollment_requests where upper(btrim(student_id))=upper(btrim(v_account.student_id));
  get diagnostics v_requests_deleted=row_count;
  delete from public.students where upper(btrim(student_id))=upper(btrim(v_account.student_id));
  get diagnostics v_roster_deleted=row_count;
  update public.student_department_reroll_requests set status='applied',applied_at=now() where id=v_request.id;
  insert into public.audit_events(actor_id,actor_email,action,entity_type,entity_id,details)
  values(auth.uid(),auth.jwt()->>'email','student.department_reroll_applied','student_account',auth.uid()::text,
    jsonb_build_object('student_id',v_account.student_id,'from',v_account.department,'to',v_request.requested_department,
      'enrolment_requests_deleted',v_requests_deleted,'roster_rows_deleted',v_roster_deleted,'historical_attendance_preserved',true));
  insert into public.app_notifications(recipient_id,notification_type,title,message,entity_type,entity_id)
  values(auth.uid(),'department_reroll','Department updated',
    'Your account is now in '||v_request.requested_department||'. Select your new courses and complete face registration.',
    'department_reroll',v_request.id::text);
  return jsonb_build_object('status','applied','department',v_request.requested_department,
    'enrollment_requests_deleted',v_requests_deleted,'roster_entries_deleted',v_roster_deleted,'historical_attendance_preserved',true);
end;
$function$;

revoke all on function public.student_request_department_reroll(text,text) from public,anon;
revoke all on function public.student_get_department_reroll_status() from public,anon;
revoke all on function public.admin_list_department_rerolls() from public,anon;
revoke all on function public.admin_review_department_reroll(uuid,text,text) from public,anon;
revoke all on function public.student_apply_department_reroll() from public,anon;
grant execute on function public.student_request_department_reroll(text,text) to authenticated;
grant execute on function public.student_get_department_reroll_status() to authenticated;
grant execute on function public.admin_list_department_rerolls() to authenticated;
grant execute on function public.admin_review_department_reroll(uuid,text,text) to authenticated;
grant execute on function public.student_apply_department_reroll() to authenticated;
