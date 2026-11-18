import React, { useEffect, useMemo, useState } from 'react';
import * as db from './db';
import { supabase } from './supabase';

const panel = 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-4';
const field = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs text-slate-900 dark:text-white';
const primary = 'rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-2.5 text-xs font-bold disabled:opacity-50';
const secondary = 'rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200';

type ScoreValue = { score: string; feedback: string; saved?: boolean };

export default function AssessmentManagement({ mode = 'admin' }: { mode?: 'admin' | 'lecturer' }) {
  const isAdmin = mode === 'admin';
  const [courses, setCourses] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [assignedLabels, setAssignedLabels] = useState<string[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [scores, setScores] = useState<Record<string, ScoreValue>>({});
  const [availableStudents, setAvailableStudents] = useState<any[]>([]);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [showGroupBuilder, setShowGroupBuilder] = useState(false);
  const [policy, setPolicy] = useState({ ca_weight_percent: '40', exam_weight_percent: '60', attendance_enabled: false, attendance_weight_percent: '0' });
  const [form, setForm] = useState({ id: '', title: '', assessment_type: 'ca', max_score: '20', weight_percent: '10', due_on: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const visibleCourses = useMemo(() => isAdmin ? courses : courses.filter(c => {
    const label = String(c.code + ' - ' + c.title).toLowerCase();
    return assignedLabels.some(x => {
      const v = x.toLowerCase().trim();
      return v === label || v === String(c.code).toLowerCase() || v === String(c.title).toLowerCase() || label.includes(v);
    });
  }), [courses, assignedLabels, isAdmin]);

  const loadGroups = async (courseId = selectedCourse, termId = selectedTerm) => {
    if (!courseId || !termId) { setGroups([]); return; }
    const { data, error: loadError } = await supabase.rpc('list_my_teaching_groups', { p_course: courseId, p_term: termId });
    if (loadError) throw loadError;
    setGroups(data || []);
    if (selectedGroup && !(data || []).some((g: any) => g.id === selectedGroup)) setSelectedGroup('');
  };

  const loadPolicy = async (courseId = selectedCourse, termId = selectedTerm) => {
    if (!courseId || !termId) return;
    const { data, error: loadError } = await supabase.rpc('get_course_assessment_policy', { p_course: courseId, p_term: termId });
    if (loadError) throw loadError;
    const row = Array.isArray(data) ? data[0] : data;
    if (row) setPolicy({
      ca_weight_percent: String(row.ca_weight_percent), exam_weight_percent: String(row.exam_weight_percent),
      attendance_enabled: !!row.attendance_enabled, attendance_weight_percent: String(row.attendance_weight_percent),
    });
  };

  const loadAssessments = async (courseId = selectedCourse, termId = selectedTerm, groupId = selectedGroup) => {
    if (!courseId || !termId) { setAssessments([]); return; }
    let query = supabase.from('course_assessments').select('*').eq('course_id', courseId).eq('academic_term_id', termId);
    query = groupId ? query.eq('teaching_group_id', groupId) : query.is('teaching_group_id', null);
    const { data, error: loadError } = await query.order('created_at', { ascending: false });
    if (loadError) throw loadError;
    setAssessments(data || []);
    if (selectedAssessment && !(data || []).some(a => a.id === selectedAssessment)) setSelectedAssessment('');
  };

  const loadScores = async (assessmentId: string) => {
    setSelectedAssessment(assessmentId);
    setStudents([]); setScores({});
    if (!assessmentId) return;
    const assessment = assessments.find(a => a.id === assessmentId);
    if (!assessment) return;
    const [studentResult, scoreResult] = await Promise.all([
      assessment.teaching_group_id
        ? supabase.rpc('assessment_teaching_group_students', { p_group: assessment.teaching_group_id })
        : supabase.rpc('assessment_course_students', { p_course: assessment.course_id }),
      supabase.from('course_assessment_scores').select('student_user_id,score,feedback').eq('assessment_id', assessmentId),
    ]);
    if (studentResult.error) throw studentResult.error;
    if (scoreResult.error) throw scoreResult.error;
    const scoreMap: Record<string, ScoreValue> = {};
    (scoreResult.data || []).forEach((row: any) => { scoreMap[row.student_user_id] = { score: String(row.score), feedback: row.feedback || '', saved: true }; });
    setStudents(studentResult.data || []);
    setScores(scoreMap);
  };

  useEffect(() => {
    (async () => {
      setLoading(true); setError('');
      try {
        const [courseRows, termRows, assignedRows] = await Promise.all([
          db.loadCatalogCourses(null), db.loadAcademicTerms(), isAdmin ? Promise.resolve([]) : db.loadMyAssignedCourses()
        ]);
        setCourses(courseRows || []);
        setTerms(termRows || []);
        setAssignedLabels((assignedRows || []).map((x: any) => String(x.course || '')));
      } catch (e) { setError(db.friendly(e)); }
      finally { setLoading(false); }
    })();
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedCourse || !selectedTerm) { setGroups([]); setAssessments([]); return; }
    setError('');
    Promise.all([loadGroups(selectedCourse, selectedTerm), loadPolicy(selectedCourse, selectedTerm), loadAssessments(selectedCourse, selectedTerm, selectedGroup)])
      .catch(e => setError(db.friendly(e)));
  }, [selectedCourse, selectedTerm]);

  useEffect(() => {
    if (!selectedCourse || !selectedTerm) return;
    void loadAssessments(selectedCourse, selectedTerm, selectedGroup).catch(e => setError(db.friendly(e)));
  }, [selectedGroup]);

  const openGroupBuilder = async () => {
    if (!selectedCourse) return;
    setError('');
    try {
      const { data, error: studentError } = await supabase.rpc('assessment_course_students', { p_course: selectedCourse });
      if (studentError) throw studentError;
      setAvailableStudents(data || []);
      setGroupMembers((data || []).map((s: any) => s.user_id));
      setGroupName('');
      setShowGroupBuilder(true);
    } catch (e) { setError(db.friendly(e)); }
  };

  const saveGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCourse || !selectedTerm || groupMembers.length === 0) { setError('Choose at least one registered student for this teaching group.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: saveError } = await supabase.rpc('save_teaching_group', {
        p_id: null, p_course: selectedCourse, p_term: selectedTerm, p_name: groupName.trim(), p_student_users: groupMembers,
      });
      if (saveError) throw saveError;
      setShowGroupBuilder(false);
      await loadGroups();
      setMessage('Teaching group created. Its roster is kept separate from other groups taking this course.');
    } catch (e) { setError(db.friendly(e)); }
    finally { setBusy(false); }
  };

  const savePolicy = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCourse || !selectedTerm) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: saveError } = await supabase.rpc('save_course_assessment_policy', {
        p_course: selectedCourse, p_term: selectedTerm,
        p_ca_weight: Number(policy.ca_weight_percent), p_exam_weight: Number(policy.exam_weight_percent),
        p_attendance_enabled: policy.attendance_enabled,
        p_attendance_weight: policy.attendance_enabled ? Number(policy.attendance_weight_percent) : 0,
      });
      if (saveError) throw saveError;
      setMessage('Assessment weighting saved for this course and academic term.');
    } catch (e) { setError(db.friendly(e)); }
    finally { setBusy(false); }
  };

  const saveAssessment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCourse || !selectedTerm) { setError('Choose a course and academic term first.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: saveError } = await supabase.rpc('save_course_assessment_for_group', {
        p_id: form.id || null, p_course: selectedCourse, p_term: selectedTerm, p_group: selectedGroup || null,
        p_title: form.title.trim(), p_type: form.assessment_type,
        p_max_score: Number(form.max_score), p_weight_percent: Number(form.weight_percent),
        p_due_on: form.due_on || null,
      });
      if (saveError) throw saveError;
      setForm({ id: '', title: '', assessment_type: 'ca', max_score: '20', weight_percent: '10', due_on: '' });
      setMessage('Assessment saved for the selected teaching group. Its marks remain separate from other groups.');
      await loadAssessments();
    } catch (e) { setError(db.friendly(e)); }
    finally { setBusy(false); }
  };

  const editAssessment = (a: any) => {
    setForm({ id: a.id, title: a.title, assessment_type: a.assessment_type, max_score: String(a.max_score), weight_percent: String(a.weight_percent), due_on: a.due_on || '' });
    setSelectedAssessment(a.id);
    void loadScores(a.id).catch(e => setError(db.friendly(e)));
  };

  const saveScore = async (student: any) => {
    const value = scores[student.user_id];
    if (!value || value.score === '') { setError('Enter a mark before saving.'); return; }
    const selected = assessments.find(a => a.id === selectedAssessment);
    if (!selected) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: saveError } = await supabase.rpc('save_course_assessment_score', {
        p_assessment: selectedAssessment, p_student_user_id: student.user_id,
        p_score: Number(value.score), p_feedback: value.feedback || null,
      });
      if (saveError) throw saveError;
      setScores(prev => ({ ...prev, [student.user_id]: { ...prev[student.user_id], saved: true } }));
      setMessage('Mark saved for ' + student.full_name + '.');
    } catch (e) { setError(db.friendly(e)); }
    finally { setBusy(false); }
  };

  const chosen = assessments.find(a => a.id === selectedAssessment);
  if (loading) return <div className="py-12 text-center text-xs text-slate-500">Loading assessment workspace…</div>;

  return <div className="space-y-4">
    <section className={panel}>
      <div>
        <p className="text-[10px] uppercase tracking-wider font-black text-emerald-700 dark:text-emerald-300">{isAdmin ? 'Academic results management' : 'Lecturer-led teaching tools'}</p>
        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">Continuous Assessment & Examinations</h2>
        <p className="text-xs leading-relaxed text-slate-500 mt-1">Choose a course, academic term and (where needed) a teaching group. Students from different programmes can share one group when they attend the same class. Separate groups keep separate rosters and marks.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-[10px] font-bold text-slate-500">Course / subject
          <select className={field + ' mt-1'} value={selectedCourse} onChange={e => { setSelectedCourse(e.target.value); setSelectedAssessment(''); setSelectedGroup(''); }}>
            <option value="">Choose a course</option>
            {visibleCourses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-bold text-slate-500">Academic term / semester
          <select className={field + ' mt-1'} value={selectedTerm} onChange={e => { setSelectedTerm(e.target.value); setSelectedAssessment(''); setSelectedGroup(''); }}>
            <option value="">Choose a term</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-bold text-slate-500">Teaching group
          <select className={field + ' mt-1'} value={selectedGroup} onChange={e => { setSelectedGroup(e.target.value); setSelectedAssessment(''); }}>
            <option value="">All registered students</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name} · {g.student_count} students</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <p className="text-[10px] text-slate-500">Use a teaching group when one course has separately taught sets. Leave the group unselected when everyone takes the course together.</p>
        {!isAdmin && <button type="button" className={secondary} disabled={!selectedCourse || !selectedTerm} onClick={() => void openGroupBuilder()}>Create teaching group</button>}
      </div>
      {!isAdmin && showGroupBuilder && <form onSubmit={saveGroup} className="rounded-xl border border-emerald-200 dark:border-emerald-900 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs">New teaching group</strong><button type="button" className={secondary} onClick={() => setShowGroupBuilder(false)}>Cancel</button></div>
        <input className={field} required minLength={2} maxLength={100} placeholder="e.g. CSC 201 · Group A / Monday class" value={groupName} onChange={e => setGroupName(e.target.value)}/>
        <input className={field} placeholder="Search eligible students" value={groupSearch} onChange={e => setGroupSearch(e.target.value)}/>
        <div className="flex flex-wrap gap-2"><button type="button" className={secondary} onClick={() => setGroupMembers(availableStudents.map(s => s.user_id))}>Select all</button><button type="button" className={secondary} onClick={() => setGroupMembers([])}>Clear selection</button><span className="text-[10px] text-slate-500 self-center">{groupMembers.length} selected</span></div>
        <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-slate-100 dark:border-slate-800 p-2">
          {availableStudents.filter(s => [s.full_name,s.student_id,s.email].some(v => String(v || '').toLowerCase().includes(groupSearch.toLowerCase()))).map(s => <label key={s.user_id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-xs"><input type="checkbox" checked={groupMembers.includes(s.user_id)} onChange={e => setGroupMembers(prev => e.target.checked ? [...prev,s.user_id] : prev.filter(id => id !== s.user_id))}/><span className="min-w-0 flex-1"><strong>{s.full_name}</strong><span className="block text-[10px] text-slate-500">{s.student_id} · {s.email}</span></span></label>)}
        </div>
        <button className={primary} disabled={busy || groupMembers.length===0}>{busy ? 'Creating…' : 'Save teaching group'}</button>
      </form>}
      {!visibleCourses.length && <p className="text-xs text-amber-700 dark:text-amber-300">{isAdmin ? 'Create an active course in Academic catalogue first.' : 'No active course assignments were found for this lecturer. Ask an administrator to assign your courses.'}</p>}
      {visibleCourses.length > 0 && !terms.length && <p className="text-xs text-amber-700 dark:text-amber-300">No academic terms exist yet. An administrator must create a period and term in Academic structure.</p>}
    </section>

    {selectedCourse && selectedTerm && <section className={panel}>
      <div><h3 className="font-extrabold text-slate-900 dark:text-white">Assessment policy</h3><p className="text-xs text-slate-500 mt-1">Lecturers control the split for their course within the institution's approved grading framework. The default is 40% CA and 60% examination; change it where your course requires a different balance.</p></div>
      <form onSubmit={savePolicy} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
        <label className="text-[10px] font-bold text-slate-500">CA contribution (%)<input className={field+' mt-1'} type="number" min="0" max="100" step="0.01" required value={policy.ca_weight_percent} disabled={isAdmin} onChange={e=>setPolicy({...policy,ca_weight_percent:e.target.value})}/></label>
        <label className="text-[10px] font-bold text-slate-500">Exam contribution (%)<input className={field+' mt-1'} type="number" min="0" max="100" step="0.01" required value={policy.exam_weight_percent} disabled={isAdmin} onChange={e=>setPolicy({...policy,exam_weight_percent:e.target.value})}/></label>
        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200"><input type="checkbox" checked={policy.attendance_enabled} disabled={isAdmin} onChange={e=>setPolicy({...policy,attendance_enabled:e.target.checked,attendance_weight_percent:e.target.checked?policy.attendance_weight_percent:'0'})}/> Allow attendance as a CA component</label>
        <label className="text-[10px] font-bold text-slate-500">Attendance marks within CA (%)<input className={field+' mt-1'} type="number" min="0" max={policy.ca_weight_percent} step="0.01" disabled={isAdmin || !policy.attendance_enabled} value={policy.attendance_weight_percent} onChange={e=>setPolicy({...policy,attendance_weight_percent:e.target.value})}/></label>
        <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap justify-between items-center gap-2"><span className="text-[10px] text-slate-500">CA + examination must equal 100%. Attendance is optional and must fit inside the CA allocation.</span>{!isAdmin && <button className={primary} disabled={busy}>{busy?'Saving…':'Save assessment policy'}</button>}</div>
      </form>
    </section>}

    {!isAdmin && <section className={panel}>
      <div><h3 className="font-extrabold text-slate-900 dark:text-white">Assessment components</h3><p className="text-xs text-slate-500 mt-1">Lecturers create and manage their own tests, assignments, quizzes, practicals and exam components. Each component's percentage is calculated within its CA or examination category.</p></div>
      <form onSubmit={saveAssessment} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <input className={field+' sm:col-span-2'} required maxLength={120} placeholder="Assessment name e.g. Test 1 / Assignment 2" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
        <select className={field} value={form.assessment_type} onChange={e=>setForm({...form,assessment_type:e.target.value})}><option value="ca">Continuous assessment (CA)</option><option value="exam">Examination</option></select>
        <label className="text-[10px] font-bold text-slate-500">Maximum raw mark<input className={field+' mt-1'} type="number" min="0.01" step="0.01" required value={form.max_score} onChange={e=>setForm({...form,max_score:e.target.value})}/></label>
        <label className="text-[10px] font-bold text-slate-500">Contribution within category (%)<input className={field+' mt-1'} type="number" min="0.01" max="100" step="0.01" required value={form.weight_percent} onChange={e=>setForm({...form,weight_percent:e.target.value})}/></label>
        <label className="text-[10px] font-bold text-slate-500">Due date (optional)<input className={field+' mt-1'} type="date" value={form.due_on} onChange={e=>setForm({...form,due_on:e.target.value})}/></label>
        <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap justify-end gap-2">{form.id && <button type="button" className={secondary} onClick={()=>setForm({id:'',title:'',assessment_type:'ca',max_score:'20',weight_percent:'10',due_on:''})}>Cancel edit</button>}<button className={primary} disabled={busy||!selectedCourse||!selectedTerm}>{busy?'Saving…':form.id?'Update assessment':'Save assessment'}</button></div>
      </form>
      <p className="text-[10px] text-slate-500">Each category's component weights must total no more than 100%. The course policy above defines how CA and examination combine into the final result.</p>
    </section>}

    <section className={panel}>
      <div><h3 className="font-extrabold text-slate-900 dark:text-white">Assessment list</h3><p className="text-xs text-slate-500 mt-1">{selectedGroup ? 'Only assessments for the selected teaching group are shown.' : 'Showing course-wide assessments for all registered students.'}</p></div>
      {!selectedCourse||!selectedTerm ? <p className="text-xs text-slate-500 py-3">Choose a course and academic term above.</p> : assessments.length===0 ? <p className="text-xs text-slate-500 py-3">No assessments have been created for this selection.</p> :
        <div className="space-y-2">{assessments.map(a=><div key={a.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex flex-wrap items-center justify-between gap-3"><button type="button" className="text-left min-w-0 flex-1" onClick={()=>void loadScores(a.id).catch(e=>setError(db.friendly(e)))}><strong className="block text-xs text-slate-900 dark:text-white">{a.title}</strong><span className="text-[10px] text-slate-500">{a.assessment_type==='ca'?'Continuous assessment':'Examination'} · {a.max_score} marks · {a.weight_percent}% contribution {a.due_on?' · Due '+a.due_on:''}</span></button><div className="flex gap-2">{!isAdmin && <button type="button" className={secondary} onClick={()=>editAssessment(a)}>Edit</button>}<button type="button" className={a.id===selectedAssessment?primary:secondary} onClick={()=>void loadScores(a.id).catch(e=>setError(db.friendly(e)))}>{a.id===selectedAssessment?'Selected':isAdmin?'View marks':'Enter marks'}</button></div></div>)}</div>}
    </section>

    {chosen && <section className={panel}>
      <div><h3 className="font-extrabold text-slate-900 dark:text-white">Record marks — {chosen.title}</h3><p className="text-xs text-slate-500 mt-1">Enter a score from 0 to {chosen.max_score}. The roster is limited to the selected teaching group where one is assigned.</p></div>
      {students.length===0 ? <p className="text-xs text-slate-500 py-4">No approved students were found in this roster.</p> :
        <div className="space-y-2">{students.map(student=>{const value=scores[student.user_id]||{score:'',feedback:''};const valid=value.score!==''&&Number(value.score)>=0&&Number(value.score)<=Number(chosen.max_score);return <div key={student.user_id} className="grid grid-cols-1 sm:grid-cols-[1.2fr_110px_1.5fr_auto] gap-2 items-center rounded-xl border border-slate-100 dark:border-slate-800 p-3"><div className="min-w-0"><strong className="block text-xs text-slate-900 dark:text-white">{student.full_name}</strong><span className="text-[10px] text-slate-500">{student.student_id} · {student.email}</span></div><label className="text-[10px] text-slate-500">Mark / {chosen.max_score}<input className={field+' mt-1'} type="number" min="0" max={chosen.max_score} step="0.01" value={value.score} disabled={isAdmin} onChange={e=>setScores(prev=>({...prev,[student.user_id]:{...value,score:e.target.value,saved:false}}))}/></label><input className={field} placeholder="Feedback (optional)" value={value.feedback} disabled={isAdmin} onChange={e=>setScores(prev=>({...prev,[student.user_id]:{...value,feedback:e.target.value,saved:false}}))}/>{!isAdmin && <button type="button" className={value.saved?secondary:primary} disabled={busy||!valid||!!value.saved} onClick={()=>void saveScore(student)}>{value.saved?'Saved':'Save mark'}</button>}</div>})}</div>}
    </section>}

    {message&&<p role="status" className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-3 text-xs text-emerald-800 dark:text-emerald-200">{message}</p>}
    {error&&<p role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 p-3 text-xs text-rose-700 dark:text-rose-200">{error}</p>}
  </div>;
}
