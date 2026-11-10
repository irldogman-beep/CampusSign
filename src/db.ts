import { supabase } from './supabase';

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
export async function createSession(course: string, title: string, venue: string) {
  return unwrap(await supabase.from('sessions').insert({ course, title, venue }).select('id, secret').single());
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
    sessionId: r.session_id, course: r.course, studentId: r.student_id, registeredName: r.student_name,
    dept: r.dept, facePhoto: r.face_photo, time: new Date(r.created_at).toLocaleTimeString(),
    isoTime: r.created_at, status: r.status, receiptNo: r.receipt_no,
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

export async function checkIn(sessionId: string, t: { exp: number; sig: string }, studentId: string, descriptors: number[][], photo: string) {
  return unwrap<any>(await supabase.rpc('check_in', {
    p_session: sessionId, p_exp: t.exp, p_ticket: t.sig, p_student_id: studentId,
    p_descriptor: descriptors, p_photo: photo,
  }));
}
