import React, { useEffect, useMemo, useState } from 'react';
import * as db from './db';
import { supabase } from './supabase';

const panel = 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-4';
const field = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs text-slate-900 dark:text-white';
const primary = 'rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-2.5 text-xs font-bold disabled:opacity-50';
const secondary = 'rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200';

export default function AssessmentManagement({ mode = 'admin' }: { mode?: 'admin' | 'lecturer' }) {
  const isAdmin = mode === 'admin';
  const [courses, setCourses] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [assignedLabels, setAssignedLabels] = useState<string[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [scores, setScores] = useState<Record<string, { score: string; feedback: string; saved?: boolean }>>({});
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

  const loadAssessments = async (courseId = selectedCourse, termId = selectedTerm) => {
    if (!courseId) { setAssessments([]); return; }
    let query = supabase.from('course_assessments').select('*').eq('course_id', courseId).order('created_at', { ascending: false });
    if (termId) query = query.eq('academic_term_id', termId);
    const { data, error: loadError } = await query;
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
      supabase.rpc('assessment_course_students', { p_course: assessment.course_id }),
      supabase.from('course_assessment_scores').select('student_user_id,score,feedback').eq('assessment_id', assessmentId),
    ]);
    if (studentResult.error) throw studentResult.error;
    if (scoreResult.error) throw scoreResult.error;
    const scoreMap: Record<string, { score: string; feedback: string; saved?: boolean }> = {};
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
    if (!selectedCourse) return;
    void loadAssessments(selectedCourse, selectedTerm).catch(e => setError(db.friendly(e)));
  }, [selectedCourse, selectedTerm]);

  const saveAssessment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCourse || !selectedTerm) { setError('Choose a course and academic term first.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: saveError } = await supabase.rpc('save_course_assessment', {
        p_id: form.id || null, p_course: selectedCourse, p_term: selectedTerm,
        p_title: form.title.trim(), p_type: form.assessment_type,
        p_max_score: Number(form.max_score), p_weight_percent: Number(form.weight_percent),
        p_due_on: form.due_on || null,
      });
      if (saveError) throw saveError;
      setForm({ id: '', title: '', assessment_type: 'ca', max_score: '20', weight_percent: '10', due_on: '' });
      setMessage('Assessment saved. Its contribution is included in the course total.');
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
        <p className="text-[10px] uppercase tracking-wider font-black text-emerald-700 dark:text-emerald-300">{isAdmin ? 'Academic results management' : 'Teaching tools'}</p>
        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">Continuous Assessment & Examinations</h2>
        <p className="text-xs leading-relaxed text-slate-500 mt-1">Create tests, assignments, practicals and examination components, set each component's percentage contribution, then record student marks. CA and examination weights are tracked separately and each category must total no more than 100%.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-[10px] font-bold text-slate-500">Course / subject
          <select className={field + ' mt-1'} value={selectedCourse} onChange={e => { setSelectedCourse(e.target.value); setSelectedAssessment(''); }}>
            <option value="">Choose a course</option>
            {visibleCourses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-bold text-slate-500">Academic term / semester
          <select className={field + ' mt-1'} value={selectedTerm} onChange={e => { setSelectedTerm(e.target.value); setSelectedAssessment(''); }}>
            <option value="">Choose a term</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>
      {!visibleCourses.length && <p className="text-xs text-amber-700 dark:text-amber-300">{isAdmin ? 'Create an active course in Departments & courses first.' : 'No active course assignments were found for this lecturer. Ask an administrator to assign your courses.'}</p>}
      {visibleCourses.length > 0 && !terms.length && <p className="text-xs text-amber-700 dark:text-amber-300">No academic terms exist yet. An administrator must create a period and term in Academic structure.</p>}
    </section>

    <section className={panel}>
      <div><h3 className="font-extrabold text-slate-900 dark:text-white">1. Set up an assessment</h3><p className="text-xs text-slate-500 mt-1">Example: a 20-mark class test contributing 10% to the final result. The entered mark is converted to its configured percentage automatically in the result calculation.</p></div>
      <form onSubmit={saveAssessment} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <input className={field + ' sm:col-span-2'} required maxLength={120} placeholder="Assessment name e.g. Test 1 / Assignment 2" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/>
        <select className={field} value={form.assessment_type} onChange={e => setForm({ ...form, assessment_type: e.target.value })}><option value="ca">Continuous assessment (CA)</option><option value="exam">Examination</option></select>
        <label className="text-[10px] font-bold text-slate-500">Maximum raw mark<input className={field + ' mt-1'} type="number" min="0.01" step="0.01" required value={form.max_score} onChange={e => setForm({ ...form, max_score: e.target.value })}/></label>
        <label className="text-[10px] font-bold text-slate-500">Contribution to final result (%)<input className={field + ' mt-1'} type="number" min="0.01" max="100" step="0.01" required value={form.weight_percent} onChange={e => setForm({ ...form, weight_percent: e.target.value })}/></label>
        <label className="text-[10px] font-bold text-slate-500">Due date (optional)<input className={field + ' mt-1'} type="date" value={form.due_on} onChange={e => setForm({ ...form, due_on: e.target.value })}/></label>
        <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap justify-end gap-2">
          {form.id && <button type="button" className={secondary} onClick={() => setForm({ id: '', title: '', assessment_type: 'ca', max_score: '20', weight_percent: '10', due_on: '' })}>Cancel edit</button>}
          <button className={primary} disabled={busy || !selectedCourse || !selectedTerm}>{busy ? 'Saving…' : form.id ? 'Update assessment' : 'Save assessment'}</button>
        </div>
      </form>
      <p className="text-[10px] text-slate-500">Weight limits are checked by the database. CA components and examination components are tracked separately, each with its own 100% limit. The institution-wide CA/exam split (for example, 30% CA and 70% examination) is not yet configured, so these entries are assessment records rather than a final course grade.</p>
    </section>

    <section className={panel}>
      <div><h3 className="font-extrabold text-slate-900 dark:text-white">2. Assessment list</h3><p className="text-xs text-slate-500 mt-1">Choose an assessment to open its class list and enter marks. Editing a component changes its maximum mark or contribution but does not erase recorded scores.</p></div>
      {!selectedCourse || !selectedTerm ? <p className="text-xs text-slate-500 py-3">Choose a course and term above to see assessments.</p> : assessments.length === 0 ? <p className="text-xs text-slate-500 py-3">No assessments have been created for this course and term.</p> :
        <div className="space-y-2">{assessments.map(a => <div key={a.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="text-left min-w-0 flex-1" onClick={() => void loadScores(a.id).catch(e => setError(db.friendly(e)))}>
            <strong className="block text-xs text-slate-900 dark:text-white">{a.title}</strong>
            <span className="text-[10px] text-slate-500">{a.assessment_type === 'ca' ? 'Continuous assessment' : 'Examination'} · {a.max_score} marks · {a.weight_percent}% contribution {a.due_on ? ' · Due ' + a.due_on : ''}</span>
          </button>
          <div className="flex gap-2"><button type="button" className={secondary} onClick={() => editAssessment(a)}>Edit</button><button type="button" className={a.id === selectedAssessment ? primary : secondary} onClick={() => void loadScores(a.id).catch(e => setError(db.friendly(e)))}>{a.id === selectedAssessment ? 'Selected' : 'Enter marks'}</button></div>
        </div>)}</div>}
    </section>

    {chosen && <section className={panel}>
      <div><h3 className="font-extrabold text-slate-900 dark:text-white">3. Record marks — {chosen.title}</h3><p className="text-xs text-slate-500 mt-1">Enter a score from 0 to {chosen.max_score}. Save each student's mark. Only students on the selected course roster are listed.</p></div>
      {students.length === 0 ? <p className="text-xs text-slate-500 py-4">No approved student accounts matched this course roster yet. Check the course roster and approved student accounts.</p> :
        <div className="space-y-2">{students.map(student => {
          const value = scores[student.user_id] || { score: '', feedback: '' };
          const valid = value.score !== '' && Number(value.score) >= 0 && Number(value.score) <= Number(chosen.max_score);
          return <div key={student.user_id} className="grid grid-cols-1 sm:grid-cols-[1.2fr_110px_1.5fr_auto] gap-2 items-center rounded-xl border border-slate-100 dark:border-slate-800 p-3">
            <div className="min-w-0"><strong className="block text-xs text-slate-900 dark:text-white">{student.full_name}</strong><span className="text-[10px] text-slate-500">{student.student_id} · {student.email}</span></div>
            <label className="text-[10px] text-slate-500">Mark / {chosen.max_score}<input className={field + ' mt-1'} type="number" min="0" max={chosen.max_score} step="0.01" value={value.score} onChange={e => setScores(prev => ({ ...prev, [student.user_id]: { ...value, score: e.target.value, saved: false } }))}/></label>
            <input className={field} placeholder="Feedback (optional)" value={value.feedback} onChange={e => setScores(prev => ({ ...prev, [student.user_id]: { ...value, feedback: e.target.value, saved: false } }))}/>
            <button type="button" className={value.saved ? secondary : primary} disabled={busy || !valid || !!value.saved} onClick={() => void saveScore(student)}>{value.saved ? 'Saved' : 'Save mark'}</button>
          </div>;
        })}</div>}
    </section>}

    {message && <p role="status" className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-3 text-xs text-emerald-800 dark:text-emerald-200">{message}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 p-3 text-xs text-rose-700 dark:text-rose-200">{error}</p>}
  </div>;
}
