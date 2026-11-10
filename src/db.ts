import { supabase } from './supabase';

export async function createSession(
  course: string, 
  title: string, 
  venue: string,
  requireFace: boolean = true,
  requireLocation: boolean = true,
  radiusM: number = 15
) {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      course,
      title,
      venue,
      require_face: requireFace,
      require_location: requireLocation,
      radius_m: radiusM
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function loadStudents() {
  const { data, error } = await supabase.from('students').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((s: any) => ({
    rowId: s.id,
    id: s.student_id,
    name: s.name,
    dept: s.dept,
    level: s.level,
    course: s.course,
    faceEnrolled: s.face_enrolled
  }));
}

export async function addStudent(st: { course: string; id: string; name: string; dept: string; level: string }) {
  const { error } = await supabase.from('students').insert({
    course: st.course,
    student_id: st.id,
    name: st.name,
    dept: st.dept,
    level: st.level
  });
  if (error) throw error;
}

export async function deleteStudent(rowId: string) {
  const { error } = await supabase.from('students').delete().eq('id', rowId);
  if (error) throw error;
}

export async function enrollFace(studentPk: string, descriptors: number[][]) {
  const { error } = await supabase.rpc('enroll_face', {
    p_student: studentPk,
    p_descriptors: descriptors
  });
  if (error) throw error;
}

export async function latestSession(course: string) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('course', course)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setRevoked(sessionId: string, revoked: boolean) {
  const { error } = await supabase
    .from('sessions')
    .update({ revoked })
    .eq('id', sessionId);
  if (error) throw error;
}

export async function setAnchor(sessionId: string, fix: { lat: number; lng: number; acc: number }) {
  const { error } = await supabase
    .from('sessions')
    .update({
      anchor_lat: fix.lat,
      anchor_lng: fix.lng,
      anchor_acc: fix.acc,
      anchor_set_at: new Date().toISOString()
    })
    .eq('id', sessionId);
  if (error) throw error;
}

export async function sessionInfo(codeObj: { i: string; s: number; k: string }) {
  const { data, error } = await supabase.rpc('session_info', {
    p_session: codeObj.i,
    p_slot: codeObj.s,
    p_k: codeObj.k
  });
  if (error) throw error;
  return data;
}

export async function lookupStudent(sessionId: string, ticket: { exp: number; sig: string }, studentId: string) {
  const { data, error } = await supabase.rpc('lookup_student', {
    p_session: sessionId,
    p_exp: ticket.exp,
    p_ticket: ticket.sig,
    p_student_id: studentId
  });
  if (error) throw error;
  return data;
}

export async function checkIn(
  sessionId: string,
  ticket: { exp: number; sig: string },
  studentId: string,
  descriptor: number[] | null,
  photo: string | null,
  fix: { lat: number; lng: number; acc: number } | null
) {
  const { data, error } = await supabase.rpc('check_in', {
    p_session: sessionId,
    p_exp: ticket.exp,
    p_ticket: ticket.sig,
    p_student_id: studentId,
    p_descriptor: descriptor,
    p_photo: photo,
    p_lat: fix ? fix.lat : null,
    p_lng: fix ? fix.lng : null,
    p_acc: fix ? fix.acc : null
  });
  if (error) throw error;
  return data;
}

export async function loadAttendance() {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((a: any) => ({
    sessionId: a.session_id,
    course: a.course,
    studentId: a.student_id,
    registeredName: a.student_name,
    dept: a.dept,
    facePhoto: a.face_photo,
    receiptNo: a.receipt_no,
    status: a.status,
    locationStatus: a.location_status,
    distanceM: a.distance_m,
    time: new Date(a.created_at).toLocaleTimeString(),
    isoTime: a.created_at
  }));
}

export function friendly(err: any): string {
  const m = err?.message || String(err);
  if (m.includes('invalid_code') || m.includes('expired_code')) return 'This QR code has expired or is invalid. Scan the current one.';
  if (m.includes('revoked')) return 'This check-in session has been revoked by the lecturer.';
  if (m.includes('not_found')) return 'Student ID not found in this course roster.';
  if (m.includes('already')) return 'Attendance has already been checked in for this session.';
  if (m.includes('locked')) return 'Too many failed face matching attempts. Check-in is locked for this session.';
  if (m.includes('not_enrolled')) return 'Your face is not enrolled yet. Please contact your lecturer.';
  return m;
}
