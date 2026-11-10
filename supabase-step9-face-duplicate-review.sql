-- CampusSign step 9: safer duplicate-face review and audited lecturer override.
-- Run AFTER steps 1–8. Safe to run repeatedly.
-- This does NOT disable duplicate screening. A potential match is surfaced for
-- human review instead of being silently/automatically rejected.

-- Store the closest same-course match for the lecturer's review queue.
alter table public.student_enrollment_requests
  add column if not exists duplicate_candidate_student_pk uuid references public.students(id) on delete set null,
  add column if not exists duplicate_candidate_student_id text,
  add column if not exists duplicate_candidate_name text,
  add column if not exists duplicate_distance double precision,
  add column if not exists duplicate_flagged_at timestamptz;

-- An immutable audit trail for an override after the lecturer verifies identity
-- in person. No biometric descriptors or photographs are copied into this log.
create table if not exists public.face_duplicate_review_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  lecturer_id uuid not null,
  course text not null,
  enrolling_student_id text not null,
  enrolling_student_name text not null,
  candidate_student_pk uuid references public.students(id) on delete set null,
  candidate_student_id text not null,
  candidate_student_name text not null,
  descriptor_distance double precision not null,
  override_reason text not null,
  reviewed_at timestamptz not null default now()
);

alter table public.face_duplicate_review_audit enable row level security;
revoke all on public.face_duplicate_review_audit from public, anon, authenticated;
create index if not exists face_duplicate_review_audit_lecturer_idx
  on public.face_duplicate_review_audit (lecturer_id, reviewed_at desc);

comment on table public.face_duplicate_review_audit is
  'Audit trail of lecturer-authorised approvals after a possible same-course face match. Stores no face descriptors or photographs.';

-- The lecturer's inbox returns candidate identity details, but never biometric data.
-- Drop first because PostgreSQL cannot change a table-returning function's return shape.
drop function if exists public.list_my_enrollment_requests();
create function public.list_my_enrollment_requests()
returns table (
  id uuid,
  course text,
  student_id text,
  student_name text,
  dept text,
  level text,
  status text,
  created_at timestamptz,
  duplicate_candidate_student_id text,
  duplicate_candidate_name text,
  duplicate_distance double precision,
  duplicate_flagged_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_verified() then raise exception 'not_verified'; end if;
  return query
    select r.id, r.course, r.student_id, r.student_name, r.dept, r.level,
      r.status, r.created_at, r.duplicate_candidate_student_id,
      r.duplicate_candidate_name, r.duplicate_distance, r.duplicate_flagged_at
    from public.student_enrollment_requests r
    where r.lecturer_id = auth.uid() and r.status = 'pending'
    order by r.created_at asc;
end;
$$;
revoke execute on function public.list_my_enrollment_requests() from public, anon;
grant execute on function public.list_my_enrollment_requests() to authenticated;

-- Replace the old two-argument RPC. When a possible match is found, it records
-- the candidate and returns status=possible_duplicate. The lecturer must verify
-- the student's institutional ID in person and give a reason before overriding.
drop function if exists public.review_student_enrollment(uuid, text);
drop function if exists public.review_student_enrollment(uuid, text, boolean, text);

create function public.review_student_enrollment(
  p_request uuid,
  p_decision text,
  p_override_duplicate boolean default false,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.student_enrollment_requests;
  st_id uuid;
  candidate record;
  has_candidate boolean := false;
  duplicate_overridden boolean := false;
  reason text := trim(coalesce(p_override_reason, ''));
begin
  if not public.is_verified() then raise exception 'not_verified'; end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then raise exception 'invalid_decision'; end if;

  select * into req
  from public.student_enrollment_requests
  where id = p_request and lecturer_id = auth.uid()
  for update;
  if not found then raise exception 'request_not_found'; end if;
  if req.status <> 'pending' then raise exception 'request_already_reviewed'; end if;

  if p_decision = 'reject' then
    update public.student_enrollment_requests
      set status = 'rejected', reviewed_at = now(), face_descriptors = null,
          duplicate_candidate_student_pk = null,
          duplicate_candidate_student_id = null,
          duplicate_candidate_name = null,
          duplicate_distance = null,
          duplicate_flagged_at = null
      where id = req.id;
    return jsonb_build_object('status', 'rejected');
  end if;

  if req.face_descriptors is null then raise exception 'missing_face_template'; end if;

  -- Find the closest enrolled face only within this lecturer's exact course.
  -- The descriptor score is treated as a review signal, not identity proof.
  select
    s.id as candidate_pk,
    s.student_id as candidate_student_id,
    s.name as candidate_name,
    public._face_distance(req.face_descriptors, t.descriptors) as distance
  into candidate
  from public.face_templates t
  join public.students s on s.id = t.student_pk
  where s.lecturer_id = auth.uid()
    and s.course = req.course
  order by 4 asc
  limit 1;
  has_candidate := found;

  if has_candidate and candidate.distance < 0.45 then
    if not p_override_duplicate then
      update public.student_enrollment_requests
        set duplicate_candidate_student_pk = candidate.candidate_pk,
            duplicate_candidate_student_id = candidate.candidate_student_id,
            duplicate_candidate_name = candidate.candidate_name,
            duplicate_distance = candidate.distance,
            duplicate_flagged_at = now()
      where id = req.id;

      return jsonb_build_object(
        'status', 'possible_duplicate',
        'candidate_student_id', candidate.candidate_student_id,
        'candidate_name', candidate.candidate_name,
        'distance', round(candidate.distance::numeric, 4)
      );
    end if;

    if length(reason) < 15 or length(reason) > 500 then
      raise exception 'duplicate_override_reason_required';
    end if;

    -- Record the override before creating the student's face-template row.
    insert into public.face_duplicate_review_audit (
      request_id, lecturer_id, course,
      enrolling_student_id, enrolling_student_name,
      candidate_student_pk, candidate_student_id, candidate_student_name,
      descriptor_distance, override_reason
    ) values (
      req.id, auth.uid(), req.course,
      req.student_id, req.student_name,
      candidate.candidate_pk, candidate.candidate_student_id, candidate.candidate_name,
      candidate.distance, reason
    );
    duplicate_overridden := true;
  elsif p_override_duplicate and length(reason) < 15 then
    raise exception 'duplicate_override_reason_required';
  end if;

  insert into public.students (lecturer_id, course, student_id, name, dept, level, face_enrolled)
    values (auth.uid(), req.course, req.student_id, req.student_name, req.dept, req.level, true)
    returning id into st_id;

  insert into public.face_templates (student_pk, descriptors)
    values (st_id, req.face_descriptors);

  update public.student_enrollment_requests
    set status = 'approved',
        reviewed_at = now(),
        face_descriptors = null
    where id = req.id;

  return jsonb_build_object('status', 'approved', 'student_row_id', st_id,
    'duplicate_override_recorded', duplicate_overridden);
exception
  when unique_violation then
    raise exception 'already_enrolled';
end;
$$;

revoke execute on function public.review_student_enrollment(uuid, text, boolean, text) from public, anon;
grant execute on function public.review_student_enrollment(uuid, text, boolean, text) to authenticated;

comment on column public.student_enrollment_requests.duplicate_distance is
  'Euclidean descriptor distance to the closest face template on this lecturer course. Lower values indicate closer descriptors; not identity proof.';
