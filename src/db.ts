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
  department_not_found: 'Department was not found.',
  invalid_course: 'Enter a valid course code and title.',
  course_not_found: 'Course was not found.',
  admin_required: 'Administrator access required.',
  enrollment_rate_limited: 'Too many enrolment attempts. Please wait a few minutes before trying again.',
  announcement_title_invalid: 'Announcement title must be between 3 and 120 characters.',
  announcement_body_invalid: 'Announcement message must be between 3 and 5,000 characters.',
  announcement_audience_invalid: 'Choose a valid announcement audience.',
  announcement_department_required: 'Choose a department for this announcement.',
  announcement_course_required: 'Choose a course for this announcement.',
  announcement_student_required: 'Choose an active student account for this announcement.',
  announcement_not_found: 'This announcement no longer exists.',
  student_account_not_found: 'Student account could not be found. It may already have been deleted or may not be linked to this sign-in.',
  student_account_already_reviewed: 'This student account has already been reviewed.',
  student_roster_match_required: 'This account cannot be approved yet. The student must have at least one course enrolment approved by a lecturer, with matching name and department.',
  invalid_decision: 'Choose a valid review decision.',
};

export function friendly(e: any): string {
  const m = String(e?.message || '');
  if (MESSAGES[m]) return MESSAGES[m];
  if (m.includes('row-level security')) return 'Your account is awaiting verification by the administrator.';
  if (m.includes('duplicate key')) {
    if (m.includes('academic_departments_name_key')) return 'A department with this name already exists.';
    if (m.includes('academic_departments_code_key')) return 'A department with this code already exists.';
    if (m.includes('academic_courses_department_id_code_key')) return 'A course with this code already exists in this department.';
    return 'That Student ID is already on this roster.';
  }
  if (m.includes('academic_departments_code_format')) {
    return 'Department code must be 2 to 12 characters (uppercase letters, numbers, hyphens or underscores).';
  }
  if (m.includes('academic_courses_code_format')) {
    return 'Course code must be 2 to 20 characters (uppercase letters, numbers, hyphens or underscores).';
  }
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

export async function markNotificationUnread(id: string) {
  unwrap(await supabase.rpc('mark_notification_unread', { p_notification: id }));
}

export async function deleteNotification(id: string) {
  unwrap(await supabase.rpc('delete_notification', { p_notification: id }));
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
export async function loadCatalogFaculties(): Promise<any[]> {
  const { data, error } = await supabase.from('academic_faculties')
    .select('id,code,name,is_active').order('name');
  if (error) throw error;
  return data || [];
}
export async function saveCatalogFaculty(input: { id?: string | null; code: string; name: string; active: boolean }) {
  const payload = { code: input.code.trim().toUpperCase(), name: input.name.trim(), is_active: input.active, updated_at: new Date().toISOString() };
  if (input.id) {
    const { error } = await supabase.from('academic_faculties').update(payload).eq('id', input.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('academic_faculties').insert(payload);
    if (error) throw error;
  }
}
export async function assignDepartmentFaculty(departmentId: string, facultyId: string | null) {
  const { error } = await supabase.from('academic_departments')
    .update({ faculty_id: facultyId, updated_at: new Date().toISOString() }).eq('id', departmentId);
  if (error) throw error;
}

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
  return unwrap<void>(await supabase.rpc('admin_assign_lecturer_course', {
    p_lecturer: lecturerId, p_course: courseId, p_assigned: assigned, p_primary: primary,
  }));
}
export async function loadDepartmentCourses(departmentName: string): Promise<any[]> {
  return unwrap<any[]>(await supabase.rpc('list_department_courses', { p_department_name: departmentName }));
}
export async function loadMyAssignedCourses(): Promise<any[]> {
  return unwrap<any[]>(await supabase.rpc('my_assigned_courses'));
}

// ---- administrator monitoring and lecturer assignments ----
export async function loadAdminLecturerCourses(lecturerId: string): Promise<any[]> {
  return unwrap<any[]>(await supabase.rpc('admin_lecturer_courses', { p_lecturer: lecturerId }));
}
export async function loadAdminStudentEnrolments(limit = 100): Promise<any[]> {
  return unwrap<any[]>(await supabase.rpc('admin_list_student_enrolments', { p_limit: limit }));
}
export async function loadAdminRecentAttendance(limit = 100): Promise<any[]> {
  return unwrap<any[]>(await supabase.rpc('admin_recent_attendance', { p_limit: limit }));
}
export async function loadAdminRecentSessions(limit = 50): Promise<any[]> {
  return unwrap<any[]>(await supabase.rpc('admin_recent_sessions', { p_limit: limit }));
}


// ---- administrator destructive actions (all enforced by admin-only RPCs) ----
export async function adminDeleteAttendance(id: string) {
  return unwrap<any>(await supabase.rpc('admin_delete_attendance', { p_attendance: id }));
}
export async function adminDeleteSession(id: string) {
  return unwrap<any>(await supabase.rpc('admin_delete_session', { p_session: id }));
}
export async function adminDeleteStudent(id: string) {
  return unwrap<any>(await supabase.rpc('admin_delete_student', { p_student: id }));
}
export async function adminDeleteStudentAccount(userId: string) {
  return unwrap<any>(await supabase.rpc('admin_delete_student_account', { p_user_id: userId }));
}
export async function adminDeleteLecturer(id: string) {
  return unwrap<any>(await supabase.rpc('admin_delete_lecturer', { p_lecturer: id }));
}
export async function adminDeleteCourse(id: string) {
  return unwrap<any>(await supabase.rpc('admin_delete_course', { p_course: id }));
}
export async function adminDeleteDepartment(id: string) {
  return unwrap<any>(await supabase.rpc('admin_delete_department', { p_department: id }));
}
export async function loadAdminAttendanceTrends(days = 14) {
  return unwrap<any[]>(await supabase.rpc('admin_attendance_trends', { p_days: days }));
}
export async function loadAdminCourseActivity(days = 30) {
  return unwrap<any[]>(await supabase.rpc('admin_course_activity', { p_days: days }));
}


// ---- administrator announcements ----
export async function loadAdminAnnouncements() {
  return unwrap<any[]>(await supabase.rpc('admin_list_announcements'));
}
export async function saveAdminAnnouncement(input: {
  id?: string | null; title: string; body: string; audienceType: string;
  departmentId?: string | null; courseId?: string | null; studentUserId?: string | null; publish: boolean;
}) {
  return unwrap<any>(await supabase.rpc('admin_save_announcement', {
    p_id: input.id || null, p_title: input.title, p_body: input.body,
    p_audience_type: input.audienceType,
    p_department: input.departmentId || null, p_course: input.courseId || null,
    p_student_user: input.studentUserId || null, p_publish: input.publish,
  }));
}
export async function deleteAdminAnnouncement(id: string) {
  return unwrap<boolean>(await supabase.rpc('admin_delete_announcement', { p_id: id }));
}


// ---- student accounts and self-service dashboard ----
export async function loadStudentDashboard() {
  return unwrap<any>(await supabase.rpc('student_get_dashboard'));
}
export async function loadStudentEnrollmentRequests() {
  return unwrap<any[]>(await supabase.rpc('student_list_enrollment_requests'));
}
export async function loadAdminStudentAccounts() {
  return unwrap<any[]>(await supabase.rpc('admin_list_student_accounts'));
}
export async function reviewStudentAccount(userId: string, decision: 'approve' | 'reject') {
  return unwrap<any>(await supabase.rpc('admin_review_student_account', {
    p_user_id: userId, p_decision: decision,
  }));
}
export async function reopenStudentAccount(userId: string, reason: string) {
  return unwrap<any>(await supabase.rpc('admin_reopen_student_account', {
    p_user_id: userId, p_reason: reason,
  }));
}


// ---- department reroll workflow ----
export async function requestDepartmentReroll(department: string, reason: string) {
  return unwrap<any>(await supabase.rpc('student_request_department_reroll', {
    p_department: department, p_reason: reason,
  }));
}
export async function loadDepartmentRerollStatus() {
  return unwrap<any>(await supabase.rpc('student_get_department_reroll_status'));
}
export async function applyDepartmentReroll() {
  return unwrap<any>(await supabase.rpc('student_apply_department_reroll'));
}
export async function loadAdminDepartmentRerolls() {
  return unwrap<any[]>(await supabase.rpc('admin_list_department_rerolls'));
}
export async function reviewDepartmentReroll(requestId: string, decision: 'approve' | 'reject', note = '') {
  return unwrap<any>(await supabase.rpc('admin_review_department_reroll', {
    p_request_id: requestId, p_decision: decision, p_admin_note: note,
  }));
}


// ---- public campus branding (writes restricted by database RLS to verified admins) ----
// ---- configurable academic structure, cohorts and course attempts ----
export async function loadAcademicSettings(): Promise<any> {
  const { data, error } = await supabase.from('academic_structure_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data || { id: 1, education_type: 'university', secondary_mode_enabled: false, level_label: 'Level', period_label: 'Academic year', term_label: 'Semester', terms_per_period: 2, progression_mode: 'manual' };
}
export async function saveAcademicSettings(input: any) {
  const { error } = await supabase.from('academic_structure_settings').upsert({
    id: 1, education_type: input.secondary_mode_enabled ? 'secondary' : 'university', secondary_mode_enabled: !!input.secondary_mode_enabled, level_label: input.level_label.trim(),
    period_label: input.period_label.trim(), term_label: input.term_label.trim(),
    terms_per_period: Number(input.terms_per_period), progression_mode: input.progression_mode,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw error;
}
export async function loadAcademicLevels(): Promise<any[]> {
  const { data, error } = await supabase.from('academic_levels').select('*').order('sequence');
  if (error) throw error; return data || [];
}
export async function saveAcademicLevel(input: any) {
  const payload = { code: input.code.trim().toUpperCase(), name: input.name.trim(), sequence: Number(input.sequence), updated_at: new Date().toISOString() };
  const query = input.id ? supabase.from('academic_levels').update(payload).eq('id', input.id) : supabase.from('academic_levels').insert(payload);
  const { error } = await query; if (error) throw error;
}
export async function loadAcademicPeriods(): Promise<any[]> {
  const { data, error } = await supabase.from('academic_periods').select('*').order('starts_on', { ascending: false, nullsFirst: false }).order('name');
  if (error) throw error; return data || [];
}
export async function saveAcademicPeriod(input: any): Promise<string> {
  const payload = { name: input.name.trim(), starts_on: input.starts_on || null, ends_on: input.ends_on || null, is_current: input.id ? !!input.is_current : false, updated_at: new Date().toISOString() };
  if (input.id) { const { error } = await supabase.from('academic_periods').update(payload).eq('id', input.id); if (error) throw error; return input.id; }
  const { data, error } = await supabase.from('academic_periods').insert(payload).select('id').single();
  if (error) throw error; return data.id;
}
export async function setCurrentAcademicPeriod(id: string) {
  const { error: clearError } = await supabase.from('academic_periods').update({ is_current: false, updated_at: new Date().toISOString() }).eq('is_current', true);
  if (clearError) throw clearError;
  const { error } = await supabase.from('academic_periods').update({ is_current: true, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function loadAcademicTerms(): Promise<any[]> {
  const { data, error } = await supabase.from('academic_terms').select('*').order('sequence');
  if (error) throw error; return data || [];
}
export async function saveAcademicTerm(input: any): Promise<string> {
  const payload = { academic_period_id: input.academic_period_id, name: input.name.trim(), sequence: Number(input.sequence), starts_on: input.starts_on || null, ends_on: input.ends_on || null, is_current: false, updated_at: new Date().toISOString() };
  if (input.id) { const { error } = await supabase.from('academic_terms').update(payload).eq('id', input.id); if (error) throw error; return input.id; }
  const { data, error } = await supabase.from('academic_terms').insert(payload).select('id').single();
  if (error) throw error; return data.id;
}
export async function setCurrentAcademicTerm(id: string, periodId: string) {
  const { error: clearError } = await supabase.from('academic_terms').update({ is_current: false, updated_at: new Date().toISOString() }).eq('academic_period_id', periodId).eq('is_current', true);
  if (clearError) throw clearError;
  const { error } = await supabase.from('academic_terms').update({ is_current: true, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function loadAcademicCohorts(): Promise<any[]> {
  const { data, error } = await supabase.from('student_cohorts').select('*').order('admission_year', { ascending: false });
  if (error) throw error; return data || [];
}
export async function saveAcademicCohort(input: any) {
  const payload = { name: input.name.trim(), admission_year: input.admission_year.trim(), description: input.description.trim() || null, updated_at: new Date().toISOString() };
  const query = input.id ? supabase.from('student_cohorts').update(payload).eq('id', input.id) : supabase.from('student_cohorts').insert(payload);
  const { error } = await query; if (error) throw error;
}
export async function loadStudentAcademicProfiles(): Promise<any[]> {
  const { data, error } = await supabase.from('student_academic_profiles').select('*').order('updated_at', { ascending: false });
  if (error) throw error; return data || [];
}
export async function saveStudentAcademicProfile(input: any) {
  const { data: previous, error: previousError } = await supabase.from('student_academic_profiles').select('current_level_id,cohort_id,academic_status').eq('student_user_id', input.student_user_id).maybeSingle();
  if (previousError) throw previousError;
  const payload = { student_user_id: input.student_user_id, cohort_id: input.cohort_id || null, current_level_id: input.current_level_id || null, academic_status: input.academic_status || 'active', status_reason: input.status_reason?.trim() || null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('student_academic_profiles').upsert(payload, { onConflict: 'student_user_id' });
  if (error) throw error;
  if (!previous || previous.current_level_id !== payload.current_level_id || previous.cohort_id !== payload.cohort_id || previous.academic_status !== payload.academic_status) {
    const { data: actorData } = await supabase.auth.getUser();
    const { error: eventError } = await supabase.from('student_progression_events').insert({
      student_user_id: input.student_user_id, from_level_id: previous?.current_level_id || null,
      to_level_id: payload.current_level_id, event_type: previous && previous.academic_status !== payload.academic_status && previous.current_level_id === payload.current_level_id && previous.cohort_id === payload.cohort_id ? 'status_changed' : (input.event_type || 'initial_assignment'),
      effective_on: input.effective_on || new Date().toISOString().slice(0, 10), note: input.note?.trim() || null, actor_id: actorData.user?.id || null,
    });
    if (eventError) throw eventError;
  }
}
export async function loadStudentProgressionEvents(): Promise<any[]> {
  const { data, error } = await supabase.from('student_progression_events').select('*').order('created_at', { ascending: false }).limit(150);
  if (error) throw error; return data || [];
}
export async function loadStudentCourseAttempts(): Promise<any[]> {
  const { data, error } = await supabase.from('student_course_attempts').select('*').order('created_at', { ascending: false }).limit(250);
  if (error) throw error; return data || [];
}
export async function saveStudentCourseAttempt(input: any) {
  const payload: any = { student_user_id: input.student_user_id, course_id: input.course_id, academic_term_id: input.academic_term_id, attempt_number: Number(input.attempt_number), status: input.status, grade: input.grade?.trim() || null, result_note: input.result_note?.trim() || null, updated_at: new Date().toISOString() };
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.id) payload.recorded_by = authData.user.id;
  const { error } = await supabase.from('student_course_attempts').upsert(payload, { onConflict: 'student_user_id,course_id,attempt_number' });
  if (error) throw error;
}

export const DEFAULT_CAMPUS_BRANDING = {
  id: 1, brand_name: 'CampusSign', tagline: 'Attendance, clearly verified.', logo_url: null,
  primary_color: '#064E3B', accent_color: '#F59E0B', background_color: '#F8FAFC',
  student_app_name: 'CampusSign Student', staff_app_name: 'CampusSign Staff Workspace',
  student_welcome: 'Your classes, attendance and student services in one place.',
  staff_welcome: 'Attendance, academic records and campus operations in one workspace.',
  student_primary_color: '#064E3B', student_accent_color: '#F59E0B', student_background_color: '#F8FAFC', student_logo_url: null,
  staff_primary_color: '#064E3B', staff_accent_color: '#F59E0B', staff_background_color: '#F8FAFC', staff_logo_url: null,
  support_email: '',
};

export async function loadCampusBranding() {
  const { data, error } = await supabase.from('campus_branding_settings')
    .select('id,brand_name,tagline,logo_url,primary_color,accent_color,background_color,student_app_name,staff_app_name,student_welcome,staff_welcome,support_email,student_primary_color,student_accent_color,student_background_color,student_logo_url,staff_primary_color,staff_accent_color,staff_background_color,staff_logo_url,updated_at')
    .eq('id', 1).maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_CAMPUS_BRANDING, ...(data || {}) };
}

export async function saveCampusBranding(input: typeof DEFAULT_CAMPUS_BRANDING) {
  const requiredText = [
    ['Institution name', input.brand_name, 2, 48],
    ['Tagline', input.tagline, 2, 100],
    ['Student app name', input.student_app_name, 2, 48],
    ['Staff app name', input.staff_app_name, 2, 64],
    ['Student welcome message', input.student_welcome, 2, 180],
    ['Staff welcome message', input.staff_welcome, 2, 180],
  ] as const;
  for (const [label, value, min, max] of requiredText) {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
      throw new Error(`${label} must contain ${min}–${max} characters.`);
    }
  }
  const colorFields = [
    'primary_color','accent_color','background_color',
    'student_primary_color','student_accent_color','student_background_color',
    'staff_primary_color','staff_accent_color','staff_background_color'
  ] as const;
  for (const field of colorFields) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(String(input[field] || ''))) {
      throw new Error(`Please enter a valid 6-digit hex colour for ${field.replace(/_/g,' ')}.`);
    }
  }
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Your admin session has expired. Sign in again and retry.');
  const payload = {
    brand_name: input.brand_name.trim(), tagline: input.tagline.trim(), logo_url: input.logo_url || null,
    primary_color: input.primary_color, accent_color: input.accent_color, background_color: input.background_color,
    student_app_name: input.student_app_name.trim(), staff_app_name: input.staff_app_name.trim(),
    student_welcome: input.student_welcome.trim(), staff_welcome: input.staff_welcome.trim(),
    student_primary_color: input.student_primary_color, student_accent_color: input.student_accent_color,
    student_background_color: input.student_background_color, student_logo_url: input.student_logo_url || null,
    staff_primary_color: input.staff_primary_color, staff_accent_color: input.staff_accent_color,
    staff_background_color: input.staff_background_color, staff_logo_url: input.staff_logo_url || null,
    support_email: String(input.support_email || '').trim() || null, updated_at: new Date().toISOString(), updated_by: auth.user.id,
  };
  const { data, error } = await supabase.from('campus_branding_settings')
    .update(payload).eq('id', 1).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('The database did not save these changes. Check that this account has verified administrator permissions, then sign in again.');
  return await loadCampusBranding();
}

export async function uploadCampusLogo(file: File) {
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) throw new Error('Choose a PNG, JPG or WebP logo.');
  if (file.size > 2 * 1024 * 1024) throw new Error('Logo must be 2 MB or smaller.');
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `brand/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('campus-branding').upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
  if (error) throw error;
  return supabase.storage.from('campus-branding').getPublicUrl(path).data.publicUrl;
}
