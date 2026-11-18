-- CampusSign Step 31: configurable grading, course credits, GPA/CGPA transcript snapshots
-- Additive only. Published scores and existing academic attempts are preserved.

alter table public.academic_courses
  add column if not exists credit_units numeric(5,2) not null default 0;
alter table public.academic_courses drop constraint if exists academic_courses_credit_units_check;
alter table public.academic_courses add constraint academic_courses_credit_units_check
  check (credit_units between 0 and 30);

alter table public.course_result_entries
  add column if not exists grade_code text,
  add column if not exists grade_point numeric(6,3),
  add column if not exists credit_units numeric(5,2);
alter table public.course_result_entries drop constraint if exists course_result_entries_grade_point_check;
alter table public.course_result_entries add constraint course_result_entries_grade_point_check
  check (grade_point is null or grade_point between 0 and 20);
alter table public.course_result_entries drop constraint if exists course_result_entries_credit_units_check;
alter table public.course_result_entries add constraint course_result_entries_credit_units_check
  check (credit_units is null or credit_units between 0 and 30);

alter table public.student_course_attempts
  add column if not exists grade_code text,
  add column if not exists grade_point numeric(6,3),
  add column if not exists credit_units numeric(5,2);
alter table public.student_course_attempts drop constraint if exists student_course_attempts_grade_point_check;
alter table public.student_course_attempts add constraint student_course_attempts_grade_point_check
  check (grade_point is null or grade_point between 0 and 20);
alter table public.student_course_attempts drop constraint if exists student_course_attempts_credit_units_check;
alter table public.student_course_attempts add constraint student_course_attempts_credit_units_check
  check (credit_units is null or credit_units between 0 and 30);

create table if not exists public.academic_grading_settings (
  id smallint primary key check (id=1),
  scale_name text not null default 'Not configured' check (char_length(btrim(scale_name)) between 2 and 80),
  maximum_grade_point numeric(4,2) not null default 5.00 check (maximum_grade_point between 0.10 and 20),
  repeat_policy text not null default 'latest_attempt'
    check (repeat_policy in ('latest_attempt','highest_grade','all_attempts')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.academic_grading_settings(id,scale_name,maximum_grade_point,repeat_policy)
values(1,'Not configured',5.00,'latest_attempt') on conflict(id) do nothing;

create table if not exists public.academic_grade_bands (
  id uuid primary key default gen_random_uuid(),
  grade_code text not null check (grade_code ~ '^[A-Za-z0-9+_-]{1,10}$'),
  label text not null check (char_length(btrim(label)) between 2 and 80),
  min_score numeric(5,2) not null check (min_score between 0 and 100),
  max_score numeric(5,2) not null check (max_score between 0 and 100),
  grade_point numeric(6,3) not null check (grade_point between 0 and 20),
  classification text check (classification is null or char_length(classification)<=80),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_score<=max_score)
);
create unique index if not exists academic_grade_bands_code_uidx on public.academic_grade_bands(lower(grade_code));
create index if not exists academic_grade_bands_score_range_idx on public.academic_grade_bands(is_active,min_score,max_score);

alter table public.academic_grading_settings enable row level security;
alter table public.academic_grade_bands enable row level security;
revoke all on public.academic_grading_settings,public.academic_grade_bands from anon,authenticated;

-- Complete FK indexes for the academic session scope and attempt term lookups.
create index if not exists sessions_academic_term_fk_idx on public.sessions(academic_term_id);
create index if not exists sessions_teaching_group_fk_idx on public.sessions(teaching_group_id);
create index if not exists student_course_attempts_academic_term_fk_idx on public.student_course_attempts(academic_term_id);

create or replace function public.get_academic_grading_config()
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp
as $$
declare v_settings jsonb; v_bands jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_access_required'; end if;
  select to_jsonb(s) into v_settings from public.academic_grading_settings s where id=1;
  select coalesce(jsonb_agg(to_jsonb(b) order by b.sort_order,b.min_score,b.grade_code),'[]'::jsonb)
    into v_bands from public.academic_grade_bands b;
  return jsonb_build_object('settings',v_settings,'bands',v_bands);
end;
$$;

create or replace function public.admin_list_course_credit_units()
returns table(id uuid,code text,title text,department_name text,credit_units numeric)
language plpgsql security definer set search_path=public,auth,pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_access_required'; end if;
  return query select c.id,c.code,c.title,d.name,c.credit_units
    from public.academic_courses c join public.academic_departments d on d.id=c.department_id
    where c.is_active order by d.name,c.code;
end;
$$;

create or replace function public.save_academic_grading_settings(
  p_scale_name text,p_maximum_grade_point numeric,p_repeat_policy text
) returns void language plpgsql security definer set search_path=public,auth,pg_temp
as $$
declare v_name text:=btrim(coalesce(p_scale_name,'')); v_max numeric;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_access_required'; end if;
  if length(v_name)<2 or length(v_name)>80 then raise exception 'grading_scale_name_invalid'; end if;
  if p_maximum_grade_point is null or p_maximum_grade_point<0.1 or p_maximum_grade_point>20 then raise exception 'maximum_grade_point_invalid'; end if;
  if p_repeat_policy not in ('latest_attempt','highest_grade','all_attempts') then raise exception 'repeat_policy_invalid'; end if;
  select max(grade_point) into v_max from public.academic_grade_bands where is_active;
  if v_max is not null and v_max>p_maximum_grade_point then raise exception 'maximum_below_existing_grade_points'; end if;
  update public.academic_grading_settings set scale_name=v_name,maximum_grade_point=p_maximum_grade_point,
    repeat_policy=p_repeat_policy,updated_by=auth.uid(),updated_at=now() where id=1;
  perform public._campussign_write_audit('academic.grading_settings_updated','academic_grading_settings','1',null,
    jsonb_build_object('scale_name',v_name,'maximum_grade_point',p_maximum_grade_point,'repeat_policy',p_repeat_policy));
end;
$$;

create or replace function public.save_academic_grade_band(
  p_id uuid,p_grade_code text,p_label text,p_min_score numeric,p_max_score numeric,
  p_grade_point numeric,p_classification text,p_sort_order integer,p_is_active boolean
) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp
as $$
declare v_id uuid; v_code text:=upper(btrim(coalesce(p_grade_code,''))); v_label text:=btrim(coalesce(p_label,''));
  v_max_grade_point numeric;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_access_required'; end if;
  if v_code !~ '^[A-Z0-9+_-]{1,10}$' then raise exception 'grade_code_invalid'; end if;
  if length(v_label)<2 or length(v_label)>80 then raise exception 'grade_label_invalid'; end if;
  if p_min_score is null or p_max_score is null or p_min_score<0 or p_max_score>100 or p_min_score>p_max_score then
    raise exception 'grade_score_range_invalid';
  end if;
  if p_grade_point is null or p_grade_point<0 then raise exception 'grade_point_invalid'; end if;
  select maximum_grade_point into v_max_grade_point from public.academic_grading_settings where id=1;
  if p_grade_point>coalesce(v_max_grade_point,5) then raise exception 'grade_point_exceeds_scale'; end if;
  lock table public.academic_grade_bands in share row exclusive mode;
  if p_is_active and exists(
    select 1 from public.academic_grade_bands b
    where b.is_active and (p_id is null or b.id<>p_id)
      and lower(b.grade_code)<>lower(v_code)
      and p_min_score<=b.max_score and p_max_score>=b.min_score
  ) then raise exception 'grade_band_overlap'; end if;
  if p_id is null then
    insert into public.academic_grade_bands(grade_code,label,min_score,max_score,grade_point,classification,sort_order,is_active)
    values(v_code,v_label,p_min_score,p_max_score,p_grade_point,nullif(btrim(coalesce(p_classification,'')),''),
      coalesce(p_sort_order,0),coalesce(p_is_active,true)) returning id into v_id;
  else
    update public.academic_grade_bands set grade_code=v_code,label=v_label,min_score=p_min_score,max_score=p_max_score,
      grade_point=p_grade_point,classification=nullif(btrim(coalesce(p_classification,'')),''),
      sort_order=coalesce(p_sort_order,0),is_active=coalesce(p_is_active,true),updated_at=now()
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'grade_band_not_found'; end if;
  end if;
  perform public._campussign_write_audit('academic.grade_band_saved','academic_grade_band',v_id::text,null,
    jsonb_build_object('grade_code',v_code,'min_score',p_min_score,'max_score',p_max_score,
      'grade_point',p_grade_point,'is_active',p_is_active));
  return v_id;
end;
$$;

create or replace function public.admin_set_course_credit_units(p_course uuid,p_credit_units numeric)
returns void language plpgsql security definer set search_path=public,auth,pg_temp
as $$
declare v_code text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_access_required'; end if;
  if p_credit_units is null or p_credit_units<0 or p_credit_units>30 then raise exception 'course_credit_units_invalid'; end if;
  update public.academic_courses set credit_units=p_credit_units,updated_at=now() where id=p_course returning code into v_code;
  if v_code is null then raise exception 'course_not_found'; end if;
  perform public._campussign_write_audit('academic.course_credit_units_updated','academic_course',p_course::text,null,
    jsonb_build_object('course_code',v_code,'credit_units',p_credit_units));
end;
$$;

create or replace function public.sync_published_result_to_course_attempts(p_sheet uuid)
returns integer language plpgsql security definer set search_path=public,auth,pg_temp
as $$
declare v_course uuid; v_term uuid; v_status text; v_pass_mark numeric:=40;
  v_attempt_id uuid; v_attempt_number smallint; v_written integer:=0; v_entry record;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_access_required'; end if;
  select course_id,academic_term_id,status into v_course,v_term,v_status from public.course_result_sheets where id=p_sheet;
  if not found then raise exception 'result_sheet_not_found'; end if;
  if v_status<>'published' then raise exception 'result_sheet_not_published'; end if;
  select pass_mark into v_pass_mark from public.academic_structure_settings where id=1;
  v_pass_mark:=coalesce(v_pass_mark,40);
  for v_entry in select student_user_id,final_score,grade_code,grade_point,credit_units
    from public.course_result_entries where result_sheet_id=p_sheet
  loop
    if exists(select 1 from public.student_course_attempts where student_user_id=v_entry.student_user_id
      and course_id=v_course and academic_term_id=v_term and result_sheet_id is not null and result_sheet_id<>p_sheet)
    then raise exception 'student_has_multiple_result_sheets_for_course_term'; end if;
    select id,attempt_number into v_attempt_id,v_attempt_number from public.student_course_attempts
      where student_user_id=v_entry.student_user_id and course_id=v_course and academic_term_id=v_term
      order by attempt_number desc limit 1;
    if found then
      update public.student_course_attempts set result_sheet_id=p_sheet,final_score=v_entry.final_score,
        status=case when v_entry.final_score>=v_pass_mark then 'passed' else 'failed' end,
        grade=coalesce(v_entry.grade_code,case when v_entry.final_score>=v_pass_mark then 'PASS' else 'FAIL' end),
        grade_code=v_entry.grade_code,grade_point=v_entry.grade_point,credit_units=v_entry.credit_units,
        result_note='Automatically recorded from published course results',recorded_by=auth.uid(),updated_at=now()
      where id=v_attempt_id;
    else
      select (coalesce(max(attempt_number),0)+1)::smallint into v_attempt_number from public.student_course_attempts
        where student_user_id=v_entry.student_user_id and course_id=v_course;
      if v_attempt_number>20 then raise exception 'course_attempt_limit_reached'; end if;
      insert into public.student_course_attempts(student_user_id,course_id,academic_term_id,attempt_number,status,
        grade,grade_code,grade_point,credit_units,result_note,recorded_by,result_sheet_id,final_score)
      values(v_entry.student_user_id,v_course,v_term,v_attempt_number,
        case when v_entry.final_score>=v_pass_mark then 'passed' else 'failed' end,
        coalesce(v_entry.grade_code,case when v_entry.final_score>=v_pass_mark then 'PASS' else 'FAIL' end),
        v_entry.grade_code,v_entry.grade_point,v_entry.credit_units,
        'Automatically recorded from published course results',auth.uid(),p_sheet,v_entry.final_score);
    end if;
    v_written:=v_written+1;
  end loop;
  perform public._campussign_write_audit('academic.course_attempts_synced','course_result_sheet',p_sheet::text,null,
    jsonb_build_object('course_id',v_course,'term_id',v_term,'student_count',v_written,'pass_mark',v_pass_mark));
  return v_written;
end;
$$;

create or replace function public.review_course_result_sheet(p_sheet uuid,p_action text,p_note text default null)
returns void language plpgsql security definer set search_path=public,auth,pg_temp
as $$
declare v_status text; v_course uuid; v_term uuid; v_group uuid; v_count integer; v_band_count integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_access_required'; end if;
  if p_action not in ('approve','reject','publish') then raise exception 'result_action_invalid'; end if;
  select status,course_id,academic_term_id,teaching_group_id into v_status,v_course,v_term,v_group
    from public.course_result_sheets where id=p_sheet for update;
  if not found then raise exception 'result_sheet_not_found'; end if;
  if p_action='approve' and v_status<>'submitted' then raise exception 'only_submitted_results_can_be_approved'; end if;
  if p_action='reject' and v_status<>'submitted' then raise exception 'only_submitted_results_can_be_rejected'; end if;
  if p_action='publish' and v_status<>'approved' then raise exception 'only_approved_results_can_be_published'; end if;
  update public.course_result_sheets set status=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'published' end,
    reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(btrim(coalesce(p_note,'')),''),
    published_at=case when p_action='publish' then now() else null end,updated_at=now() where id=p_sheet;
  if p_action='publish' then
    select count(*) into v_band_count from public.academic_grade_bands where is_active;
    if v_band_count>0 and exists(
      select 1 from public.course_result_entries e where e.result_sheet_id=p_sheet and not exists(
        select 1 from public.academic_grade_bands b where b.is_active and e.final_score between b.min_score and b.max_score
      )
    ) then raise exception 'grade_band_missing_for_published_score'; end if;
    update public.course_result_entries e set
      grade_code=(select b.grade_code from public.academic_grade_bands b where b.is_active and e.final_score between b.min_score and b.max_score order by b.sort_order,b.min_score limit 1),
      grade_point=(select b.grade_point from public.academic_grade_bands b where b.is_active and e.final_score between b.min_score and b.max_score order by b.sort_order,b.min_score limit 1),
      credit_units=c.credit_units
    from public.course_result_sheets rs join public.academic_courses c on c.id=rs.course_id
    where rs.id=p_sheet and e.result_sheet_id=rs.id;
    v_count:=public.sync_published_result_to_course_attempts(p_sheet);
  end if;
  perform public._campussign_write_audit('academic.course_results_'||p_action,'course_result_sheet',p_sheet::text,null,
    jsonb_build_object('course_id',v_course,'term_id',v_term,'teaching_group_id',v_group,'note',p_note,'attempts_synced',v_count));
end;
$$;

create or replace function public.admin_regrade_published_results()
returns integer language plpgsql security definer set search_path=public,auth,pg_temp
as $$
declare v_band_count integer; v_count integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_access_required'; end if;
  select count(*) into v_band_count from public.academic_grade_bands where is_active;
  if v_band_count=0 then raise exception 'grade_scale_not_configured'; end if;
  if exists(
    select 1 from public.course_result_entries e join public.course_result_sheets s on s.id=e.result_sheet_id and s.status='published'
    where not exists(select 1 from public.academic_grade_bands b where b.is_active and e.final_score between b.min_score and b.max_score)
  ) then raise exception 'grade_band_missing_for_published_score'; end if;
  update public.course_result_entries e set
    grade_code=(select b.grade_code from public.academic_grade_bands b where b.is_active and e.final_score between b.min_score and b.max_score order by b.sort_order,b.min_score limit 1),
    grade_point=(select b.grade_point from public.academic_grade_bands b where b.is_active and e.final_score between b.min_score and b.max_score order by b.sort_order,b.min_score limit 1),
    credit_units=c.credit_units
  from public.course_result_sheets s join public.academic_courses c on c.id=s.course_id
  where s.id=e.result_sheet_id and s.status='published';
  update public.student_course_attempts a set
    grade=coalesce(e.grade_code,a.grade),grade_code=e.grade_code,grade_point=e.grade_point,credit_units=e.credit_units,updated_at=now()
  from public.course_result_entries e where a.result_sheet_id=e.result_sheet_id and a.student_user_id=e.student_user_id;
  get diagnostics v_count=row_count;
  perform public._campussign_write_audit('academic.published_results_regraded','academic_grade_bands','all',null,
    jsonb_build_object('result_entries_updated',(select count(*) from public.course_result_entries e join public.course_result_sheets s on s.id=e.result_sheet_id where s.status='published'),
      'attempt_rows_updated',v_count));
  return v_count;
end;
$$;

create or replace function public.get_my_academic_transcript()
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp
as $$
declare v_settings jsonb; v_rows jsonb; v_student uuid:=auth.uid();
begin
  if v_student is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from public.student_accounts where user_id=v_student and status='approved') then
    raise exception 'student_account_not_found';
  end if;
  select jsonb_build_object('scale_name',s.scale_name,'maximum_grade_point',s.maximum_grade_point,
    'repeat_policy',s.repeat_policy,'grade_bands_configured',exists(select 1 from public.academic_grade_bands where is_active))
    into v_settings from public.academic_grading_settings s where s.id=1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'course_id',a.course_id,'course_code',c.code,'course_title',c.title,
    'credit_units',coalesce(a.credit_units,c.credit_units,0),'final_score',a.final_score,
    'grade_code',coalesce(a.grade_code,nullif(a.grade,'PASS'),nullif(a.grade,'FAIL')),
    'grade_point',a.grade_point,'attempt_number',a.attempt_number,'status',a.status,
    'term_id',t.id,'term_name',t.name,'term_sequence',t.sequence,
    'period_id',p.id,'period_name',p.name,'period_starts_on',p.starts_on,
    'published_at',rs.published_at,'created_at',a.created_at,
    'is_current_carryover',(a.status='failed' and not exists(select 1 from public.student_course_attempts newer
      where newer.student_user_id=a.student_user_id and newer.course_id=a.course_id and newer.attempt_number>a.attempt_number))
  ) order by p.starts_on nulls last,t.sequence,c.code,a.attempt_number),'[]'::jsonb)
  into v_rows
  from public.student_course_attempts a
  join public.academic_courses c on c.id=a.course_id
  join public.academic_terms t on t.id=a.academic_term_id
  join public.academic_periods p on p.id=t.academic_period_id
  left join public.course_result_sheets rs on rs.id=a.result_sheet_id and rs.status='published'
  where a.student_user_id=v_student;
  return jsonb_build_object('settings',coalesce(v_settings,'{}'::jsonb),'rows',coalesce(v_rows,'[]'::jsonb));
end;
$$;

create or replace function public.student_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_account public.student_accounts;
  v_academic public.student_academic_profiles;
  v_courses jsonb;
  v_attendance jsonb;
  v_course_attempts jsonb;
  v_unread integer;
  v_cohort_name text;
  v_level_name text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_account from public.student_accounts where user_id=auth.uid();
  if not found then raise exception 'student_account_not_found'; end if;
  select * into v_academic from public.student_academic_profiles where student_user_id=auth.uid();
  if found then
    if v_academic.academic_status in ('inactive','withdrawn','expelled','graduated') then raise exception 'student_account_inactive'; end if;
    select name into v_cohort_name from public.student_cohorts where id=v_academic.cohort_id;
    select name into v_level_name from public.academic_levels where id=v_academic.current_level_id;
  end if;
  if v_account.status <> 'approved' then
    return jsonb_build_object('profile',jsonb_build_object('student_id',v_account.student_id,'full_name',v_account.full_name,
      'department',v_account.department,'level',v_account.level,'status',v_account.status,
      'academic_status',coalesce(v_academic.academic_status,'active'),'admission_set',v_cohort_name,'current_level',v_level_name),
      'courses','[]'::jsonb,'attendance','[]'::jsonb,'course_attempts','[]'::jsonb,'unread_notifications',0);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('course',s.course,'lecturer',coalesce(l.name,'Lecturer'),'face_enrolled',s.face_enrolled) order by s.course),'[]'::jsonb)
  into v_courses from public.students s left join public.lecturers l on l.id=s.lecturer_id
  where upper(btrim(s.student_id))=upper(btrim(v_account.student_id))
    and lower(btrim(s.name))=lower(btrim(v_account.full_name)) and lower(btrim(s.dept))=lower(btrim(v_account.department));
  select coalesce(jsonb_agg(jsonb_build_object('id',sca.id,'course_code',ac.code,'course_title',ac.title,
      'term',at.name,'academic_period',ap.name,'attempt_number',sca.attempt_number,
      'status',sca.status,'grade',sca.grade,'final_score',sca.final_score,
      'is_current_carryover',(sca.status='failed' and not exists (select 1 from public.student_course_attempts newer
        where newer.student_user_id=sca.student_user_id and newer.course_id=sca.course_id
          and newer.attempt_number>sca.attempt_number)),
      'result_note',sca.result_note,'created_at',sca.created_at)
      order by sca.created_at desc),'[]'::jsonb)
  into v_course_attempts from public.student_course_attempts sca
  join public.academic_courses ac on ac.id=sca.course_id
  join public.academic_terms at on at.id=sca.academic_term_id
  join public.academic_periods ap on ap.id=at.academic_period_id
  where sca.student_user_id=auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'course',a.course,'session_id',a.session_id,
      'status',a.status,'created_at',a.created_at,'receipt_no',a.receipt_no,'location_status',a.location_status)
      order by a.created_at desc),'[]'::jsonb)
  into v_attendance from public.students s join public.attendance a
    on a.lecturer_id=s.lecturer_id and a.course=s.course and upper(btrim(a.student_id))=upper(btrim(s.student_id))
  where upper(btrim(s.student_id))=upper(btrim(v_account.student_id))
    and lower(btrim(s.name))=lower(btrim(v_account.full_name)) and lower(btrim(s.dept))=lower(btrim(v_account.department));
  select count(*) into v_unread from public.app_notifications where recipient_id=auth.uid() and read_at is null;
  return jsonb_build_object('profile',jsonb_build_object('student_id',v_account.student_id,'full_name',v_account.full_name,
    'department',v_account.department,'level',v_account.level,'status',v_account.status,
    'academic_status',coalesce(v_academic.academic_status,'active'),'admission_set',v_cohort_name,'current_level',v_level_name),
    'courses',v_courses,'attendance',v_attendance,'course_attempts',coalesce(v_course_attempts,'[]'::jsonb),'unread_notifications',v_unread);
end;
$$;
revoke all on function public.get_academic_grading_config() from public,anon;
grant execute on function public.get_academic_grading_config() to authenticated;
revoke all on function public.admin_list_course_credit_units() from public,anon;
grant execute on function public.admin_list_course_credit_units() to authenticated;
revoke all on function public.save_academic_grading_settings(text,numeric,text) from public,anon;
grant execute on function public.save_academic_grading_settings(text,numeric,text) to authenticated;
revoke all on function public.save_academic_grade_band(uuid,text,text,numeric,numeric,numeric,text,integer,boolean) from public,anon;
grant execute on function public.save_academic_grade_band(uuid,text,text,numeric,numeric,numeric,text,integer,boolean) to authenticated;
revoke all on function public.admin_set_course_credit_units(uuid,numeric) from public,anon;
grant execute on function public.admin_set_course_credit_units(uuid,numeric) to authenticated;
revoke all on function public.sync_published_result_to_course_attempts(uuid) from public,anon,authenticated;
grant execute on function public.review_course_result_sheet(uuid,text,text) to authenticated;
revoke all on function public.admin_regrade_published_results() from public,anon;
grant execute on function public.admin_regrade_published_results() to authenticated;
revoke all on function public.get_my_academic_transcript() from public,anon;
grant execute on function public.get_my_academic_transcript() to authenticated;
