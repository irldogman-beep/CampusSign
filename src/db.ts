import { supabase } from './supabase';
import type { Fix } from './geo';

const MESSAGES: Record<string, string> = {
  invalid_code: "This QR code isn't valid. Scan the code on the lecturer's screen.",
  expired_code: "This QR code has expired. Scan the fresh code on the lecturer's screen.",
  revoked: 'The lecturer has closed this session.',
  not_found: 'Student ID not found on the roster for this course.',
  already: 'Attendance was already recorded for this Student ID in this session.',
  locked: 'This Student ID is locked after 3 failed face checks. Please see the invigilator.',
  not_enrolled: 'No face is enrolled for this student yet. Ask the lecturer to enroll you first.',
  bad_descriptor: 'The face scan was unreadable. Please try again.',
  not_verified: 'Your account is awaiting verification by the administrator.',
  duplicate_face: 'This face may match another student on this course. The lecturer must review the possible match before approval.',
  duplicate_override_reason_required: 'Please enter at least 15 characters explaining how you verified that these are two different students.',
  invalid_student_id: 'Enter a valid student ID (at least 3 characters).',
  invalid_student_name: 'Enter your full registered name (at least 3 characters).',
  invalid_department: 'Enter your department.',
  select_at_least_one_course: 'Select at least one course.',
  duplicate_course: 'A course was selected more than once. Review your choices and try again.',
  course_unavailable: 'One of the selected courses is no longer available. Refresh the course list and try again.',
  already_enrolled: 'This student ID is already enrolled in one or more of the selected courses.',
  enrollment_request_exists: 'An enrolment request already exists for this student ID and course.',
  request_not_found: 'This enrolment request is no longer available.',
  request_already_reviewed: 'This enrolment request has already been reviewed.',
  missing_face_template: 'This request has no saved face template. Ask the student to enrol again.',
};

export function friendly(e: any): string {
  const m = String(e?.message || '');
  if (MESSAGES[m]) return MESSAGES[m];
  if (m.includes('row-level security')) return 'Your account is awaiting verification by the administrator.';
  if (m.includes('duplicate key')) return 'That Student ID is already on this roster.';
  if (m.includes('Failed to fetch')) return 'No connection to the server. Check your internet and try again.';
  return m || 'Something went wrong.';
}

function unwrap<T>(r: { data: T | null; error: any }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

// ---- lecturer side ----
export interface SessionOptions {
  course: string; title: string; venue: string; locationMode: string; radius: number;
  faceRequired: boolean; threshold: number; endsAt: number | null; qrIntervalSeconds: number;
}

export async function createSession(o: SessionOptions) {
  return unwrap<any>(await supabase.from('sessions').insert({
    course: o.course, title: o.title, venue: o.venue,
    location_mode: o.locationMode, radius_m: o.radius, face_required: o.faceRequired,
    face_threshold: o.threshold, ends_at: o.endsAt ? new Date(o.endsAt).toISOString() : null,
    qr_interval_seconds: o.qrIntervalSeconds,
  }).select('id, secret').single());
}

export async function loadSessions() {
  return unwrap<any[]>(
    await supabase.from('sessions').select('id, title, course, venue, created_at, revoked, ends_at')
      .order('created_at', { ascending: false }).limit(60)
  );
}

export async function latestSession(course: string) {
  return unwrap<any>(
    await supabase.from('sessions').select('*')
      .eq('course', course).order('created_at', { ascending: false }).limit(1).maybeSingle()
  );
}

export async function setAnchor(id: string, fix: Fix) {
  unwrap(await supabase.from('sessions').update({
    anchor_lat: fix.lat, anchor_lng: fix.lng, anchor_acc: fix.acc, anchor_set_at: new Date().toISOString(),
  }).eq('id', id).select('id'));
}

export async function setRevoked(id: string, revoked: boolean) {
  unwrap(await supabase.from('sessions').update({ revoked }).eq('id', id).select('id'));
}

export async function loadStudents() {
  const rows: any[] = unwrap(await supabase.from('students').select('*').order('created_at', { ascending: false }));
  return rows.map((r) => ({
    rowId: r.id, id: r.student_id, name: r.name, dept: r.dept, level: r.level,
    course: r.course, faceEnrolled: r.face_enrolled,
  }));
}

export async function addStudent(s: { course: string; id: string; name: string; dept: string; level: string }) {
  unwrap(await supabase.from('students').insert({
    course: s.course, student_id: s.id, name: s.name, dept: s.dept, level: s.level,
  }).select('id'));
}

export async function deleteStudent(rowId: string) {
  unwrap(await supabase.from('students').delete().eq('id', rowId).select('id'));
}

export async function enrollFace(rowId: string, descriptors: number[][]) {
  unwrap(await supabase.rpc('enroll_face', { p_student: rowId, p_descriptors: descriptors }));
}

export async function loadAttendance() {
  const rows: any[] = unwrap(
    await supabase.from('attendance').select('*').order('created_at', { ascending: false }).limit(1000)
  );
  return rows.map((r) => ({
    id: r.id, sessionId: r.session_id, course: r.course, studentId: r.student_id, registeredName: r.student_name,
    dept: r.dept, facePhoto: r.face_photo, time: new Date(r.created_at).toLocaleTimeString(),
    isoTime: r.created_at, status: r.status, receiptNo: r.receipt_no,
    locationStatus: r.location_status, distanceM: r.distance_m, faceScore: r.face_score,
  }));
}

// ---- student side (no login; every call is checked on the server) ----
export async function sessionInfo(code: { i: string; s: number; k: string }) {
  return unwrap<any>(await supabase.rpc('session_info', { p_session: code.i, p_slot: code.s, p_k: code.k }));
}

export async function lookupStudent(sessionId: string, t: { exp: number; sig: string }, studentId: string) {
  return unwrap<any>(await supabase.rpc('lookup_student', {
    p_session: sessionId, p_exp: t.exp, p_ticket: t.sig, p_student_id: studentId,
  }));
}

export async function checkIn(sessionId: string, t: { exp: number; sig: string }, studentId: string, descriptors: number[][] | null, photo: string | null, fix: Fix | null) {
  return unwrap<any>(await supabase.rpc('check_in', {
    p_session: sessionId, p_exp: t.exp, p_ticket: t.sig, p_student_id: studentId,
    p_descriptor: descriptors, p_photo: photo,
    p_lat: fix ? fix.lat : null, p_lng: fix ? fix.lng : null, p_acc: fix ? fix.acc : null,
  }));
}

// ---- student self-enrolment + lecturer review queue ----
export async function loadAvailableCourses(): Promise<string[]> {
  return unwrap<string[]>(await supabase.rpc('list_available_courses'));
}

export async function submitStudentEnrollment(input: {
  studentId: string; name: string; dept: string; level: string;
  courses: string[]; descriptors: number[][];
}) {
  return unwrap<any>(await supabase.rpc('submit_student_enrollment', {
    p_student_id: input.studentId,
    p_name: input.name,
    p_dept: input.dept,
    p_level: input.level,
    p_courses: input.courses,
    p_descriptors: input.descriptors,
  }));
}

export async function loadEnrollmentRequests() {
  return unwrap<any[]>(await supabase.rpc('list_my_enrollment_requests'));
}

export async function reviewEnrollmentRequest(
  requestId: string,
  decision: 'approve' | 'reject',
  overrideDuplicate = false,
  overrideReason = ''
) {
  return unwrap<any>(await supabase.rpc('review_student_enrollment', {
    p_request: requestId,
    p_decision: decision,
    p_override_duplicate: overrideDuplicate,
    p_override_reason: overrideReason,
  }));
}

export async function deleteAttendance(id: string) {
  unwrap(await supabase.from('attendance').delete().eq('id', id).select('id'));
}

// Delete a complete attendance session. Its attendance rows and check-in attempts
// are removed by the database's ON DELETE CASCADE constraints.
export async function deleteSession(id: string) {
  unwrap(await supabase.from('sessions').delete().eq('id', id).select('id').single());
}

export async function updateAttendance(id: string, patch: {
  studentName: string; dept: string; status: string;
}) {
  unwrap(await supabase.from('attendance').update({
    student_name: patch.studentName.trim(),
    dept: patch.dept.trim(),
    status: patch.status,
  }).eq('id', id).select('id'));
}


// ---- administrator workspace, notifications and audit history ----
export async function loadNotifications(limit = 20) {
  return unwrap<any[]>(await supabase
    .from('app_notifications')
    .select('id, notification_type, title, message, entity_type, entity_id, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(50, limit))));
}

export async function markNotificationRead(id: string) {
  unwrap(await supabase.rpc('mark_notification_read', { p_notification: id }));
}

export async function markAllNotificationsRead() {
  return unwrap<number>(await supabase.rpc('mark_all_notifications_read'));
}

export async function loadAdminOverview() {
  return unwrap<any>(await supabase.rpc('admin_overview'));
}

export async function loadAdminLecturers() {
  return unwrap<any[]>(await supabase.rpc('admin_list_lecturers'));
}

export async function setLecturerVerification(lecturerId: string, verified: boolean) {
  return unwrap<any>(await supabase.rpc('admin_set_lecturer_verification', {
    p_lecturer: lecturerId,
    p_verified: verified,
  }));
}

export async function loadAdminAudit(limit = 50) {
  return unwrap<any[]>(await supabase.rpc('admin_recent_audit', { p_limit: limit }));
}

// ---- centrally managed academic catalogue ----
export async function loadCatalogDepartments(): Promise<any[]> {
  return unwrap<any[]>(await supabase.rpc('catalog_departments'));
}
export async function loadCatalogCourses(departmentId: string | null = null): Promise<any[]> {
  return unwrap<any[]>(await supabase.rpc('catalog_courses', { p_department: departmentId }));
}
export async function saveCatalogDepartment(input: { id?: string | null; code: string; name: string; active: boolean }) {
  return unwrap<string>(await supabase.rpc('admin_save_department', {
    p_id: input.id || null, p_code: input.code, p_name: input.name, p_active: input.active,
  }));
}
export async function saveCatalogCourse(input: { id?: string | null; departmentId: string; code: string; title: string; level: string; active: boolean }) {
  return unwrap<string>(await supabase.rpc('admin_save_course', {
    p_id: input.id || null, p_department: input.departmentId, p_code: input.code,
    p_title: input.title, p_level: input.level, p_active: input.active,
  }));
}
export async function assignLecturerCourse(lecturerId: string, courseId: string, assigned: boolean, primary = false) {
  unwrap(await supabase.rpc('admin_assign_lecturer_course', {
    p_lecturer: lecturerId, p_course: courseId, p_assigned: assigned, p_primary: primary,
  }));
}
export async function loadDepartmentCourses(departmentName: string): Promise<any[]> {
  return unwrap<any[]>(await supabase.rpc('list_department_courses', { p_department_name: departmentName }));
}
export async function loadMyAssignedCourses(): Promise<any[]> {
  return unwrap<any[]>(await supabase.rpc('my_assigned_courses'));
}
