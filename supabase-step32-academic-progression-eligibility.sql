-- CampusSign Step 32: configurable academic progression eligibility and audited decisions
-- Additive only. No existing academic history or student records are deleted.

create table if not exists public.academic_progression_policies (
  id smallint primary key default 1 check (id = 1),
  minimum_cgpa numeric(6,3),
  maximum_carryovers integer,
  minimum_earned_credits numeric(8,2),
  probation_minimum_cgpa numeric(6,3),
  probation_maximum_carryovers integer,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint academic_progression_policy_cgpa_check check (minimum_cgpa is null or minimum_cgpa >= 0),
  constraint academic_progression_policy_carryovers_check check (maximum_carryovers is null or maximum_carryovers between 0 and 50),
  constraint academic_progression_policy_credits_check check (minimum_earned_credits is null or minimum_earned_credits between 0 and 10000),
  constraint academic_progression_policy_probation_cgpa_check check (probation_minimum_cgpa is null or probation_minimum_cgpa >= 0),
  constraint academic_progression_policy_probation_carryovers_check check (probation_maximum_carryovers is null or probation_maximum_carryovers between 0 and 50)
);
insert into public.academic_progression_policies (id) values (1) on conflict (id) do nothing;

create table if not exists public.academic_progression_reviews (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.student_accounts(user_id) on delete restrict,
  academic_period_id uuid not null references public.academic_periods(id) on delete restrict,
  from_level_id uuid references public.academic_levels(id) on delete restrict,
  proposed_level_id uuid references public.academic_levels(id) on delete restrict,
  eligibility_status text not null check (eligibility_status in ('eligible','probation','ineligible','needs_data','completion_review')),
  metrics jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  decision_status text not null default 'pending' check (decision_status in ('pending','promoted','promoted_on_probation','repeated','held','denied','graduated')),
  decision_note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_progression_reviews_student_period_key unique (student_user_id, academic_period_id)
);
create index if not exists academic_progression_reviews_period_status_idx on public.academic_progression_reviews (academic_period_id, decision_status, eligibility_status);
create index if not exists academic_progression_reviews_student_idx on public.academic_progression_reviews (student_user_id, created_at desc);
create index if not exists academic_progression_reviews_from_level_idx on public.academic_progression_reviews (from_level_id);
create index if not exists academic_progression_reviews_proposed_level_idx on public.academic_progression_reviews (proposed_level_id);
create index if not exists academic_progression_reviews_decided_by_idx on public.academic_progression_reviews (decided_by);
create index if not exists academic_progression_policies_updated_by_idx on public.academic_progression_policies (updated_by);
create index if not exists academic_grading_settings_updated_by_idx on public.academic_grading_settings (updated_by);

alter table public.academic_progression_policies enable row level security;
alter table public.academic_progression_reviews enable row level security;
revoke all on public.academic_progression_policies from anon, authenticated;
revoke all on public.academic_progression_reviews from anon, authenticated;

alter table public.student_academic_profiles drop constraint if exists student_academic_profiles_academic_status_check;
alter table public.student_academic_profiles add constraint student_academic_profiles_academic_status_check
  check (academic_status in ('active','probation','inactive','withdrawn','expelled','graduating','graduated'));
alter table public.student_progression_events drop constraint if exists student_progression_events_event_type_check;
alter table public.student_progression_events add constraint student_progression_events_event_type_check
  check (event_type in ('promoted','promoted_on_probation','repeated','transferred','returned','status_changed','initial_assignment'));

create or replace function public.admin_get_progression_policy()
returns jsonb language plpgsql security definer set search_path to 'public','auth','pg_temp'
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required'; end if;
  select to_jsonb(p) into v_result from public.academic_progression_policies p where p.id=1;
  return coalesce(v_result, jsonb_build_object('id',1));
end;
$function$;

create or replace function public.admin_save_progression_policy(
  p_minimum_cgpa numeric default null,
  p_maximum_carryovers integer default null,
  p_minimum_earned_credits numeric default null,
  p_probation_minimum_cgpa numeric default null,
  p_probation_maximum_carryovers integer default null
)
returns jsonb language plpgsql security definer set search_path to 'public','auth','pg_temp'
as $function$
declare v_max numeric;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required'; end if;
  if p_minimum_cgpa is null and p_maximum_carryovers is null and p_minimum_earned_credits is null then raise exception 'progression_rule_required'; end if;
  if p_minimum_cgpa is not null and p_minimum_cgpa < 0 then raise exception 'invalid_minimum_cgpa'; end if;
  if p_maximum_carryovers is not null and p_maximum_carryovers not between 0 and 50 then raise exception 'invalid_maximum_carryovers'; end if;
  if p_minimum_earned_credits is not null and p_minimum_earned_credits not between 0 and 10000 then raise exception 'invalid_minimum_credits'; end if;
  if p_probation_minimum_cgpa is not null and (p_probation_minimum_cgpa < 0 or (p_minimum_cgpa is not null and p_probation_minimum_cgpa > p_minimum_cgpa)) then raise exception 'invalid_probation_cgpa'; end if;
  if p_probation_maximum_carryovers is not null and (p_probation_maximum_carryovers not between 0 and 50 or (p_maximum_carryovers is not null and p_probation_maximum_carryovers < p_maximum_carryovers)) then raise exception 'invalid_probation_carryovers'; end if;
  select maximum_grade_point into v_max from public.academic_grading_settings where id=1;
  if p_minimum_cgpa is not null and v_max is not null and p_minimum_cgpa > v_max then raise exception 'minimum_cgpa_exceeds_scale'; end if;
  if p_probation_minimum_cgpa is not null and v_max is not null and p_probation_minimum_cgpa > v_max then raise exception 'probation_cgpa_exceeds_scale'; end if;
  insert into public.academic_progression_policies (id,minimum_cgpa,maximum_carryovers,minimum_earned_credits,probation_minimum_cgpa,probation_maximum_carryovers,updated_by,updated_at)
  values (1,p_minimum_cgpa,p_maximum_carryovers,p_minimum_earned_credits,p_probation_minimum_cgpa,p_probation_maximum_carryovers,auth.uid(),now())
  on conflict (id) do update set minimum_cgpa=excluded.minimum_cgpa, maximum_carryovers=excluded.maximum_carryovers,
    minimum_earned_credits=excluded.minimum_earned_credits, probation_minimum_cgpa=excluded.probation_minimum_cgpa,
    probation_maximum_carryovers=excluded.probation_maximum_carryovers, updated_by=auth.uid(), updated_at=now();
  return public.admin_get_progression_policy();
end;
$function$;

create or replace function public.admin_generate_progression_reviews(p_academic_period_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_policy public.academic_progression_policies%rowtype;
  v_maximum_grade_point numeric;
  v_repeat_policy text;
  v_row record;
  v_eligibility text;
  v_reasons jsonb;
  v_metrics jsonb;
  v_failed boolean;
  v_probation_ok boolean;
  v_has_probation_rule boolean;
  v_rows_refreshed integer := 0;
  v_affected integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required'; end if;
  if not exists (select 1 from public.academic_periods where id=p_academic_period_id) then raise exception 'academic_period_not_found'; end if;
  if not exists (select 1 from public.academic_terms where academic_period_id=p_academic_period_id) then raise exception 'academic_period_has_no_terms'; end if;
  select * into v_policy from public.academic_progression_policies where id=1;
  if not found or (v_policy.minimum_cgpa is null and v_policy.maximum_carryovers is null and v_policy.minimum_earned_credits is null) then raise exception 'progression_rules_not_configured'; end if;
  select maximum_grade_point,repeat_policy into v_maximum_grade_point,v_repeat_policy from public.academic_grading_settings where id=1;
  if not exists (select 1 from public.academic_grade_bands where is_active) then raise exception 'grading_scale_not_configured'; end if;

  for v_row in
    with student_base as (
      select sa.user_id,sa.full_name,sa.student_id,sap.current_level_id,sap.academic_status,
        current_level.sequence as current_level_sequence,next_level.id as next_level_id
      from public.student_accounts sa
      left join public.student_academic_profiles sap on sap.student_user_id=sa.user_id
      left join public.academic_levels current_level on current_level.id=sap.current_level_id
      left join lateral (
        select l.id from public.academic_levels l where l.is_active and l.sequence>coalesce(current_level.sequence,0) order by l.sequence limit 1
      ) next_level on true
      where sa.status='approved'
    ),
    attempt_base as (
      select a.student_user_id,a.course_id,a.attempt_number,a.status,a.grade_point,
        coalesce(a.credit_units,c.credit_units,0)::numeric as credit_units,a.created_at,t.academic_period_id
      from public.student_course_attempts a join public.academic_courses c on c.id=a.course_id
      join public.academic_terms t on t.id=a.academic_term_id
    ),
    ranked as (
      select ab.*,
        row_number() over (partition by ab.student_user_id,ab.course_id order by ab.attempt_number desc,ab.created_at desc) as latest_rank,
        row_number() over (partition by ab.student_user_id,ab.course_id order by ab.grade_point desc nulls last,ab.attempt_number desc,ab.created_at desc) as highest_rank
      from attempt_base ab
    ),
    gpa_rows as (
      select * from ranked where grade_point is not null and credit_units>0
        and (v_repeat_policy='all_attempts' or (v_repeat_policy='latest_attempt' and latest_rank=1) or (v_repeat_policy='highest_grade' and highest_rank=1))
    ),
    gpa_metrics as (
      select student_user_id,sum(grade_point*credit_units)/nullif(sum(credit_units),0) as cgpa from gpa_rows group by student_user_id
    ),
    earned_metrics as (
      select student_user_id,sum(credit_units) as earned_credits from (
        select distinct on (student_user_id,course_id) student_user_id,course_id,credit_units
        from gpa_rows where status='passed' order by student_user_id,course_id,attempt_number desc,created_at desc
      ) earned_courses group by student_user_id
    ),
    carryover_metrics as (
      select student_user_id,count(*)::integer as outstanding_carryovers from ranked where latest_rank=1 and status='failed' group by student_user_id
    ),
    period_metrics as (
      select student_user_id,count(*)::integer as period_attempts from attempt_base where academic_period_id=p_academic_period_id group by student_user_id
    )
    select sb.*,gm.cgpa,coalesce(em.earned_credits,0)::numeric as earned_credits,
      coalesce(cm.outstanding_carryovers,0)::integer as outstanding_carryovers,coalesce(pm.period_attempts,0)::integer as period_attempts
    from student_base sb left join gpa_metrics gm on gm.student_user_id=sb.user_id
    left join earned_metrics em on em.student_user_id=sb.user_id
    left join carryover_metrics cm on cm.student_user_id=sb.user_id
    left join period_metrics pm on pm.student_user_id=sb.user_id
  loop
    v_eligibility:='eligible'; v_reasons:='[]'::jsonb; v_failed:=false; v_probation_ok:=true; v_has_probation_rule:=false;
    if v_row.current_level_id is null then
      v_eligibility:='needs_data'; v_reasons:=v_reasons||jsonb_build_array('Assign the student a current academic level first.');
    elsif v_row.academic_status not in ('active','probation','graduating') then
      v_eligibility:='ineligible'; v_reasons:=v_reasons||jsonb_build_array('The student is not currently active.');
    elsif v_row.academic_status='graduating' and v_row.next_level_id is not null then
      v_eligibility:='ineligible'; v_reasons:=v_reasons||jsonb_build_array('A student marked as graduating must be at the highest configured level.');
    elsif v_row.period_attempts=0 or v_row.cgpa is null then
      v_eligibility:='needs_data';
      if v_row.period_attempts=0 then v_reasons:=v_reasons||jsonb_build_array('No course attempts are recorded for this academic period.'); end if;
      if v_row.cgpa is null then v_reasons:=v_reasons||jsonb_build_array('Published graded results and course credit units are needed to calculate CGPA.'); end if;
    else
      if v_policy.minimum_cgpa is not null and v_row.cgpa<v_policy.minimum_cgpa then
        v_failed:=true; v_reasons:=v_reasons||jsonb_build_array('CGPA '||round(v_row.cgpa,2)::text||' is below the required '||round(v_policy.minimum_cgpa,2)::text||'.');
        if v_policy.probation_minimum_cgpa is not null then v_has_probation_rule:=true; if v_row.cgpa<v_policy.probation_minimum_cgpa then v_probation_ok:=false; end if;
        else v_probation_ok:=false; end if;
      end if;
      if v_policy.maximum_carryovers is not null and v_row.outstanding_carryovers>v_policy.maximum_carryovers then
        v_failed:=true; v_reasons:=v_reasons||jsonb_build_array(format('%s outstanding carryover(s) exceed the limit of %s.',v_row.outstanding_carryovers,v_policy.maximum_carryovers));
        if v_policy.probation_maximum_carryovers is not null then v_has_probation_rule:=true; if v_row.outstanding_carryovers>v_policy.probation_maximum_carryovers then v_probation_ok:=false; end if;
        else v_probation_ok:=false; end if;
      end if;
      if v_policy.minimum_earned_credits is not null and v_row.earned_credits<v_policy.minimum_earned_credits then
        v_failed:=true; v_probation_ok:=false; v_reasons:=v_reasons||jsonb_build_array(round(v_row.earned_credits,2)::text||' earned credits are below the required '||round(v_policy.minimum_earned_credits,2)::text||'.');
      end if;
      if v_failed then v_eligibility:=case when v_probation_ok and v_has_probation_rule then 'probation' else 'ineligible' end;
      elsif v_row.next_level_id is null then
        v_eligibility:='completion_review'; v_reasons:=v_reasons||jsonb_build_array('The student is at the highest configured level and needs a graduation or completion review.');
      end if;
    end if;
    v_metrics:=jsonb_build_object('cgpa',v_row.cgpa,'maximum_grade_point',v_maximum_grade_point,'earned_credits',v_row.earned_credits,
      'outstanding_carryovers',v_row.outstanding_carryovers,'period_attempts',v_row.period_attempts,'repeat_policy',v_repeat_policy,
      'academic_status',v_row.academic_status,'minimum_cgpa',v_policy.minimum_cgpa,'maximum_carryovers',v_policy.maximum_carryovers,
      'minimum_earned_credits',v_policy.minimum_earned_credits,'probation_minimum_cgpa',v_policy.probation_minimum_cgpa,
      'probation_maximum_carryovers',v_policy.probation_maximum_carryovers);
    insert into public.academic_progression_reviews (student_user_id,academic_period_id,from_level_id,proposed_level_id,eligibility_status,metrics,reasons,decision_status,updated_at)
    values (v_row.user_id,p_academic_period_id,v_row.current_level_id,v_row.next_level_id,v_eligibility,v_metrics,v_reasons,'pending',now())
    on conflict (student_user_id,academic_period_id) do update set from_level_id=excluded.from_level_id,proposed_level_id=excluded.proposed_level_id,
      eligibility_status=excluded.eligibility_status,metrics=excluded.metrics,reasons=excluded.reasons,updated_at=now()
    where public.academic_progression_reviews.decision_status='pending';
    get diagnostics v_affected=row_count; v_rows_refreshed:=v_rows_refreshed+v_affected;
  end loop;
  return jsonb_build_object('refreshed',v_rows_refreshed,'academic_period_id',p_academic_period_id);
end;
$function$;

create or replace function public.admin_list_progression_reviews(p_academic_period_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','auth','pg_temp'
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'student_user_id',r.student_user_id,'student_name',sa.full_name,'student_id',sa.student_id,
    'from_level_id',r.from_level_id,'from_level',fl.name,'proposed_level_id',r.proposed_level_id,'proposed_level',tl.name,
    'eligibility_status',r.eligibility_status,'metrics',r.metrics,'reasons',r.reasons,'decision_status',r.decision_status,
    'decision_note',r.decision_note,'decided_at',r.decided_at,'created_at',r.created_at)
    order by case r.eligibility_status when 'needs_data' then 1 when 'ineligible' then 2 when 'probation' then 3 when 'eligible' then 4 else 5 end,sa.full_name),'[]'::jsonb)
  into v_result from public.academic_progression_reviews r join public.student_accounts sa on sa.user_id=r.student_user_id
  left join public.academic_levels fl on fl.id=r.from_level_id left join public.academic_levels tl on tl.id=r.proposed_level_id
  where r.academic_period_id=p_academic_period_id;
  return coalesce(v_result,'[]'::jsonb);
end;
$function$;

create or replace function public.admin_decide_progression_review(p_review_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_review public.academic_progression_reviews%rowtype;
  v_profile public.student_academic_profiles%rowtype;
  v_next_status text;
  v_event_type text;
  v_to_level uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required'; end if;
  if p_decision is null or p_decision not in ('promote','repeat','hold','deny','graduate') then raise exception 'invalid_progression_decision'; end if;
  if p_decision in ('repeat','hold','deny','graduate') and length(btrim(coalesce(p_note,'')))<5 then raise exception 'decision_note_required'; end if;
  select * into v_review from public.academic_progression_reviews where id=p_review_id for update;
  if not found then raise exception 'progression_review_not_found'; end if;
  if v_review.decision_status<>'pending' then raise exception 'progression_review_already_decided'; end if;
  select * into v_profile from public.student_academic_profiles where student_user_id=v_review.student_user_id;
  if not found and p_decision in ('promote','repeat','graduate') then raise exception 'student_academic_profile_required'; end if;
  if p_decision='promote' then
    if v_review.eligibility_status not in ('eligible','probation') or v_review.proposed_level_id is null then raise exception 'student_not_eligible_for_promotion'; end if;
    v_next_status:=case when v_review.eligibility_status='probation' then 'promoted_on_probation' else 'promoted' end;
    v_event_type:=case when v_review.eligibility_status='probation' then 'promoted_on_probation' else 'promoted' end;
    v_to_level:=v_review.proposed_level_id;
    update public.student_academic_profiles set current_level_id=v_review.proposed_level_id,
      academic_status=case when v_review.eligibility_status='probation' then 'probation' else 'active' end,
      status_reason=case when v_review.eligibility_status='probation' then coalesce(nullif(btrim(p_note),''),'Promoted on academic probation.') else null end,
      updated_at=now() where student_user_id=v_review.student_user_id;
  elsif p_decision='repeat' then
    if v_review.from_level_id is null or v_review.metrics->>'academic_status' not in ('active','probation','graduating') then raise exception 'student_cannot_repeat_level'; end if;
    v_next_status:='repeated'; v_event_type:='repeated'; v_to_level:=v_review.from_level_id;
    update public.student_academic_profiles set academic_status='active',status_reason=null,updated_at=now()
      where student_user_id=v_review.student_user_id;
  elsif p_decision='graduate' then
    if v_review.eligibility_status<>'completion_review' then raise exception 'student_not_ready_for_completion_review'; end if;
    v_next_status:='graduated'; v_event_type:='status_changed'; v_to_level:=v_review.from_level_id;
    update public.student_academic_profiles set academic_status='graduated',status_reason=nullif(btrim(p_note),''),updated_at=now()
      where student_user_id=v_review.student_user_id;
  elsif p_decision='hold' then v_next_status:='held';
  else v_next_status:='denied';
  end if;
  if v_event_type is not null then
    insert into public.student_progression_events (student_user_id,from_level_id,to_level_id,event_type,effective_on,note,actor_id)
    values (v_review.student_user_id,v_review.from_level_id,v_to_level,v_event_type,current_date,nullif(btrim(p_note),''),auth.uid());
  end if;
  update public.academic_progression_reviews set decision_status=v_next_status,decision_note=nullif(btrim(p_note),''),decided_by=auth.uid(),decided_at=now(),updated_at=now()
    where id=p_review_id;
  return jsonb_build_object('review_id',p_review_id,'decision_status',v_next_status);
end;
$function$;

revoke all on function public.admin_get_progression_policy() from public,anon;
revoke all on function public.admin_save_progression_policy(numeric,integer,numeric,numeric,integer) from public,anon;
revoke all on function public.admin_generate_progression_reviews(uuid) from public,anon;
revoke all on function public.admin_list_progression_reviews(uuid) from public,anon;
revoke all on function public.admin_decide_progression_review(uuid,text,text) from public,anon;
grant execute on function public.admin_get_progression_policy() to authenticated;
grant execute on function public.admin_save_progression_policy(numeric,integer,numeric,numeric,integer) to authenticated;
grant execute on function public.admin_generate_progression_reviews(uuid) to authenticated;
grant execute on function public.admin_list_progression_reviews(uuid) to authenticated;
grant execute on function public.admin_decide_progression_review(uuid,text,text) to authenticated;
