import React, { useEffect, useMemo, useState } from 'react';
import * as db from './db';

const panel = 'rounded-2xl sm:rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4';
const field = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs text-slate-900 dark:text-white';
const primary = 'rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-2.5 text-xs font-bold disabled:opacity-50';
const secondary = 'rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200';

const emptySettings = { id: 1, education_type: 'university', level_label: 'Level', period_label: 'Academic year', term_label: 'Semester', terms_per_period: 2, progression_mode: 'manual' };

export default function AcademicManagement() {
  const [settings, setSettings] = useState<any>(emptySettings);
  const [levels, setLevels] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [levelForm, setLevelForm] = useState({ id: '', code: '', name: '', sequence: '' });
  const [periodForm, setPeriodForm] = useState({ id: '', name: '', starts_on: '', ends_on: '', is_current: false });
  const [termForm, setTermForm] = useState({ id: '', academic_period_id: '', name: '', sequence: '1', starts_on: '', ends_on: '', is_current: false });
  const [cohortForm, setCohortForm] = useState({ id: '', name: '', admission_year: '', description: '' });
  const [profileForm, setProfileForm] = useState({ student_user_id: '', cohort_id: '', current_level_id: '', academic_status: 'active', status_reason: '', event_type: 'initial_assignment', effective_on: new Date().toISOString().slice(0,10), note: '' });
  const [attemptForm, setAttemptForm] = useState({ student_user_id: '', course_id: '', academic_term_id: '', attempt_number: '1', status: 'registered', grade: '', result_note: '' });

  const refresh = async () => {
    setLoading(true); setError('');
    try {
      const [settingRows, levelRows, periodRows, termRows, cohortRows, profileRows, eventRows, attemptRows, studentRows, courseRows] = await Promise.all([
        db.loadAcademicSettings(), db.loadAcademicLevels(), db.loadAcademicPeriods(), db.loadAcademicTerms(),
        db.loadAcademicCohorts(), db.loadStudentAcademicProfiles(), db.loadStudentProgressionEvents(),
        db.loadStudentCourseAttempts(), db.loadAdminStudentAccounts(), db.loadCatalogCourses(null)
      ]);
      setSettings(settingRows || emptySettings);
      setLevels(levelRows); setPeriods(periodRows); setTerms(termRows); setCohorts(cohortRows);
      setProfiles(profileRows); setEvents(eventRows); setAttempts(attemptRows); setStudents(studentRows); setCourses(courseRows);
    } catch (e) { setError(db.friendly(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const studentById = useMemo(() => Object.fromEntries(students.map(s => [s.user_id, s])), [students]);
  const levelById = useMemo(() => Object.fromEntries(levels.map(x => [x.id, x])), [levels]);
  const courseById = useMemo(() => Object.fromEntries(courses.map(x => [x.id, x])), [courses]);
  const termById = useMemo(() => Object.fromEntries(terms.map(x => [x.id, x])), [terms]);

  const run = async (action: () => Promise<any>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); await refresh(); }
    catch (e) { setError(db.friendly(e)); }
    finally { setBusy(false); }
  };

  const saveSettings = (event: React.FormEvent) => {
    event.preventDefault();
    void run(() => db.saveAcademicSettings(settings), 'Academic structure settings saved.');
  };

  const saveLevel = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await db.saveAcademicLevel({ ...levelForm, sequence: Number(levelForm.sequence) });
      setLevelForm({ id: '', code: '', name: '', sequence: '' });
    }, 'Academic level saved.');
  };

  const savePeriod = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const savedId = await db.saveAcademicPeriod({ ...periodForm, is_current: periodForm.is_current });
      if (periodForm.is_current) await db.setCurrentAcademicPeriod(savedId);
      setPeriodForm({ id: '', name: '', starts_on: '', ends_on: '', is_current: false });
    }, 'Academic period saved.');
  };

  const saveTerm = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const id = await db.saveAcademicTerm({ ...termForm, sequence: Number(termForm.sequence), is_current: false });
      if (termForm.is_current) await db.setCurrentAcademicTerm(id, termForm.academic_period_id);
      setTermForm({ id: '', academic_period_id: termForm.academic_period_id, name: '', sequence: '1', starts_on: '', ends_on: '', is_current: false });
    }, 'Term or semester saved.');
  };

  const saveCohort = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await db.saveAcademicCohort(cohortForm);
      setCohortForm({ id: '', name: '', admission_year: '', description: '' });
    }, 'Admission set saved.');
  };

  const saveProfile = (event: React.FormEvent) => {
    event.preventDefault();
    void run(() => db.saveStudentAcademicProfile(profileForm), 'Student academic record updated and progression history recorded.');
  };

  const saveAttempt = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await db.saveStudentCourseAttempt({ ...attemptForm, attempt_number: Number(attemptForm.attempt_number) });
      setAttemptForm(prev => ({ ...prev, course_id: '', attempt_number: String(Number(prev.attempt_number) + 1), status: 'registered', grade: '', result_note: '' }));
    }, 'Course attempt recorded.');
  };

  const chooseStudent = (userId: string) => {
    const profile = profiles.find(p => p.student_user_id === userId);
    setProfileForm(prev => ({
      ...prev, student_user_id: userId, cohort_id: profile?.cohort_id || '',
      current_level_id: profile?.current_level_id || '', academic_status: profile?.academic_status || 'active',
      status_reason: profile?.status_reason || '', event_type: profile ? 'promoted' : 'initial_assignment'
    }));
  };

  if (loading) return <div className="py-16 text-center text-sm text-slate-500">Loading academic structure…</div>;

  return <div className="space-y-4">
    <section className={panel}>
      <div><p className="text-[10px] uppercase tracking-wider font-black text-emerald-700 dark:text-emerald-300">Institution setup</p><h2 className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">Academic structure</h2><p className="text-xs text-slate-500 mt-1">Configure the education system once. Levels, periods and terms then follow this institution's model.</p></div>
      <form onSubmit={saveSettings} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <label className="text-[10px] font-bold text-slate-500">Education type<select className={field+' mt-1'} value={settings.education_type} onChange={e=>setSettings({...settings,education_type:e.target.value})}><option value="secondary">Secondary school</option><option value="college">College / Polytechnic</option><option value="university">University</option><option value="custom">Custom institution</option></select></label>
        <label className="text-[10px] font-bold text-slate-500">Level label<input className={field+' mt-1'} value={settings.level_label} onChange={e=>setSettings({...settings,level_label:e.target.value})} placeholder="e.g. Class or Level" required/></label>
        <label className="text-[10px] font-bold text-slate-500">Academic period label<input className={field+' mt-1'} value={settings.period_label} onChange={e=>setSettings({...settings,period_label:e.target.value})} placeholder="e.g. Academic year" required/></label>
        <label className="text-[10px] font-bold text-slate-500">Term label<input className={field+' mt-1'} value={settings.term_label} onChange={e=>setSettings({...settings,term_label:e.target.value})} placeholder="e.g. Semester or Term" required/></label>
        <label className="text-[10px] font-bold text-slate-500">Terms per academic period<select className={field+' mt-1'} value={settings.terms_per_period} onChange={e=>setSettings({...settings,terms_per_period:Number(e.target.value)})}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label>
        <label className="text-[10px] font-bold text-slate-500">Progression approval<select className={field+' mt-1'} value={settings.progression_mode} onChange={e=>setSettings({...settings,progression_mode:e.target.value})}><option value="manual">Manual administrator approval</option></select></label>
        <div className="sm:col-span-2 lg:col-span-3 flex justify-end"><button className={primary} disabled={busy}>Save academic settings</button></div>
      </form>
      <p className="text-[10px] text-slate-500">Changing these labels does not rename existing records or automatically promote students. Progression remains an explicit, reviewable action.</p>
    </section>

    <section className={panel}>
      <div><h2 className="font-extrabold text-slate-900 dark:text-white">Academic levels / classes</h2><p className="text-xs text-slate-500 mt-1">Define the institution's own progression path, from JSS1–SS3 to 100–500 Level or another structure.</p></div>
      <form onSubmit={saveLevel} className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_100px_auto] gap-2">
        <input className={field} required maxLength={24} placeholder="Code e.g. JSS1" value={levelForm.code} onChange={e=>setLevelForm({...levelForm,code:e.target.value.toUpperCase().replace(/\s+/g,'_')})}/>
        <input className={field} required placeholder="Display name e.g. Junior Secondary 1" value={levelForm.name} onChange={e=>setLevelForm({...levelForm,name:e.target.value})}/>
        <input className={field} required type="number" min="1" placeholder="Order" value={levelForm.sequence} onChange={e=>setLevelForm({...levelForm,sequence:e.target.value})}/>
        <button className={primary} disabled={busy}>{levelForm.id?'Update':'Add level'}</button>
      </form>
      <div className="space-y-2">{levels.length===0?<p className="text-xs text-slate-500 py-3">No levels configured yet. Add the institution's first level above.</p>:levels.sort((a,b)=>a.sequence-b.sequence).map(level=><div key={level.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 p-3"><div className="min-w-0"><p className="text-xs font-bold text-slate-900 dark:text-white">{level.name}</p><p className="text-[10px] text-slate-500">{level.code} · Step {level.sequence} · {level.is_active?'Active':'Inactive'}</p></div><button type="button" className={secondary} onClick={()=>setLevelForm({id:level.id,code:level.code,name:level.name,sequence:String(level.sequence)})}>Edit</button></div>)}</div>
    </section>

    <section className={panel}>
      <div><h2 className="font-extrabold text-slate-900 dark:text-white">{settings.period_label}s and {settings.term_label}s</h2><p className="text-xs text-slate-500 mt-1">Create academic periods and their terms. Only one period can be current, and only one term per period can be current.</p></div>
      <form onSubmit={savePeriod} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <input className={field} required placeholder="Period e.g. 2026/2027" value={periodForm.name} onChange={e=>setPeriodForm({...periodForm,name:e.target.value})}/>
        <input className={field} type="date" value={periodForm.starts_on} onChange={e=>setPeriodForm({...periodForm,starts_on:e.target.value})}/>
        <input className={field} type="date" value={periodForm.ends_on} onChange={e=>setPeriodForm({...periodForm,ends_on:e.target.value})}/>
        <button className={primary} disabled={busy}>Add period</button>
        <label className="sm:col-span-4 flex items-center gap-2 text-xs"><input type="checkbox" checked={periodForm.is_current} onChange={e=>setPeriodForm({...periodForm,is_current:e.target.checked})}/>Set this as current period after saving</label>
      </form>
      <div className="space-y-2">{periods.map(period=><article key={period.id} className="rounded-xl border border-slate-100 dark:border-slate-800 p-3 space-y-2"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-bold">{period.name} {period.is_current&&<span className="text-emerald-600">· Current</span>}</p><p className="text-[10px] text-slate-500">{period.starts_on||'Start not set'} – {period.ends_on||'End not set'}</p></div><button type="button" className={secondary} onClick={()=>setPeriodForm({id:period.id,name:period.name,starts_on:period.starts_on||'',ends_on:period.ends_on||'',is_current:period.is_current})}>Edit</button></div><div className="pl-3 border-l-2 border-emerald-200 dark:border-emerald-900 space-y-1">{terms.filter(t=>t.academic_period_id===period.id).sort((a,b)=>a.sequence-b.sequence).map(term=><p key={term.id} className="text-[11px] text-slate-600 dark:text-slate-300">{term.sequence}. {term.name} {term.is_current?'· Current':''}</p>)}</div></article>)}</div>
      <form onSubmit={saveTerm} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
        <select className={field} required value={termForm.academic_period_id} onChange={e=>setTermForm({...termForm,academic_period_id:e.target.value})}><option value="">Choose period</option>{periods.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input className={field} required placeholder="Term e.g. First semester" value={termForm.name} onChange={e=>setTermForm({...termForm,name:e.target.value})}/>
        <input className={field} type="number" min="1" max="4" required placeholder="Order" value={termForm.sequence} onChange={e=>setTermForm({...termForm,sequence:e.target.value})}/>
        <button className={primary} disabled={busy||!periods.length}>Add term</button>
        <input className={field} type="date" value={termForm.starts_on} onChange={e=>setTermForm({...termForm,starts_on:e.target.value})}/>
        <input className={field} type="date" value={termForm.ends_on} onChange={e=>setTermForm({...termForm,ends_on:e.target.value})}/>
        <label className="sm:col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={termForm.is_current} onChange={e=>setTermForm({...termForm,is_current:e.target.checked})}/>Set this as current term</label>
      </form>
    </section>

    <section className={panel}>
      <div><h2 className="font-extrabold text-slate-900 dark:text-white">Admission sets / cohorts</h2><p className="text-xs text-slate-500 mt-1">A set is based on original admission year. Repeating or carrying over never changes a student's admission set.</p></div>
      <form onSubmit={saveCohort} className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_2fr_auto] gap-2">
        <input className={field} required placeholder="Set name e.g. 2026/2027 Admission Set" value={cohortForm.name} onChange={e=>setCohortForm({...cohortForm,name:e.target.value})}/>
        <input className={field} required placeholder="Admission year" value={cohortForm.admission_year} onChange={e=>setCohortForm({...cohortForm,admission_year:e.target.value})}/>
        <input className={field} placeholder="Optional description" value={cohortForm.description} onChange={e=>setCohortForm({...cohortForm,description:e.target.value})}/>
        <button className={primary} disabled={busy}>Add set</button>
      </form>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{cohorts.map(c=><div key={c.id} className="rounded-xl border border-slate-100 dark:border-slate-800 p-3"><p className="text-xs font-bold">{c.name}</p><p className="text-[10px] text-slate-500">{c.admission_year} · {c.is_active?'Active':'Inactive'}</p></div>)}</div>
    </section>

    <section className={panel}>
      <div><h2 className="font-extrabold text-slate-900 dark:text-white">Student progression</h2><p className="text-xs text-slate-500 mt-1">Assign a student's original admission set and current level. Record promotions, repeats, transfers and returns without overwriting their original cohort.</p></div>
      <form onSubmit={saveProfile} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <select className={field} required value={profileForm.student_user_id} onChange={e=>chooseStudent(e.target.value)}><option value="">Choose student</option>{students.map(s=><option key={s.user_id} value={s.user_id}>{s.full_name} · {s.student_id}</option>)}</select>
        <select className={field} value={profileForm.cohort_id} onChange={e=>setProfileForm({...profileForm,cohort_id:e.target.value})}><option value="">Admission set not assigned</option>{cohorts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className={field} value={profileForm.current_level_id} onChange={e=>setProfileForm({...profileForm,current_level_id:e.target.value})}><option value="">Current level not assigned</option>{levels.filter(l=>l.is_active).sort((a,b)=>a.sequence-b.sequence).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <select className={field} value={profileForm.academic_status} onChange={e=>setProfileForm({...profileForm,academic_status:e.target.value})}><option value="active">Active student</option><option value="inactive">Inactive</option><option value="withdrawn">Withdrawn</option><option value="expelled">Expelled</option><option value="graduating">Graduating</option><option value="graduated">Graduated</option></select>
        <select className={field} value={profileForm.event_type} onChange={e=>setProfileForm({...profileForm,event_type:e.target.value})}><option value="initial_assignment">Initial assignment</option><option value="promoted">Promoted</option><option value="repeated">Repeated level</option><option value="transferred">Transferred</option><option value="returned">Returned to study</option><option value="status_changed">Status change</option></select>
        <input className={field} type="date" required value={profileForm.effective_on} onChange={e=>setProfileForm({...profileForm,effective_on:e.target.value})}/>
        <input className={field} placeholder="Status reason (optional)" value={profileForm.status_reason} onChange={e=>setProfileForm({...profileForm,status_reason:e.target.value})}/>
        <input className={field} placeholder="Progression note (optional)" value={profileForm.note} onChange={e=>setProfileForm({...profileForm,note:e.target.value})}/>
        <div className="sm:col-span-2 lg:col-span-3 flex justify-end"><button className={primary} disabled={busy||!students.length}>Save progression record</button></div>
      </form>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-2">Student</th><th className="p-2">Admission set</th><th className="p-2">Current level</th><th className="p-2">Last update</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{profiles.map(p=><tr key={p.student_user_id}><td className="p-2 text-xs font-semibold">{studentById[p.student_user_id]?.full_name||studentById[p.student_user_id]?.student_id||p.student_user_id}</td><td className="p-2 text-xs">{cohorts.find(c=>c.id===p.cohort_id)?.name||'Not assigned'}</td><td className="p-2 text-xs">{levelById[p.current_level_id]?.name||'Not assigned'}</td><td className="p-2 text-[10px] text-slate-500">{new Date(p.updated_at).toLocaleDateString()}</td></tr>)}</tbody></table>{!profiles.length&&<p className="py-4 text-xs text-slate-500 text-center">No progression profiles have been assigned yet.</p>}</div>
      <div className="border-t border-slate-100 dark:border-slate-800 pt-3"><h3 className="text-xs font-extrabold mb-2">Progression history</h3><div className="space-y-2">{events.slice(0,12).map(event=><div key={event.id} className="flex flex-wrap items-center justify-between gap-2 text-[10px] border-b border-slate-50 dark:border-slate-800 pb-2"><span className="font-semibold">{studentById[event.student_user_id]?.full_name||event.student_user_id}</span><span>{levelById[event.from_level_id]?.name||'—'} → {levelById[event.to_level_id]?.name||'—'}</span><span className="text-slate-500">{event.event_type.replace('_',' ')} · {event.effective_on}</span></div>)}{!events.length&&<p className="text-[10px] text-slate-500">No progression events yet.</p>}</div></div>
    </section>

    <section className={panel}>
      <div><h2 className="font-extrabold text-slate-900 dark:text-white">Course attempts and carryovers</h2><p className="text-xs text-slate-500 mt-1">A failed course remains outstanding. Record a later attempt with the next attempt number; passing it clears the carryover without forcing the student to repeat the whole level.</p></div>
      <form onSubmit={saveAttempt} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <select className={field} required value={attemptForm.student_user_id} onChange={e=>setAttemptForm({...attemptForm,student_user_id:e.target.value})}><option value="">Choose student</option>{students.map(s=><option key={s.user_id} value={s.user_id}>{s.full_name} · {s.student_id}</option>)}</select>
        <select className={field} required value={attemptForm.course_id} onChange={e=>setAttemptForm({...attemptForm,course_id:e.target.value})}><option value="">Choose course</option>{courses.map(c=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select>
        <select className={field} required value={attemptForm.academic_term_id} onChange={e=>setAttemptForm({...attemptForm,academic_term_id:e.target.value})}><option value="">Choose term / semester</option>{terms.map(t=><option key={t.id} value={t.id}>{periods.find(p=>p.id===t.academic_period_id)?.name} · {t.name}</option>)}</select>
        <input className={field} type="number" min="1" max="20" required value={attemptForm.attempt_number} onChange={e=>setAttemptForm({...attemptForm,attempt_number:e.target.value})} placeholder="Attempt number"/>
        <select className={field} value={attemptForm.status} onChange={e=>setAttemptForm({...attemptForm,status:e.target.value})}><option value="registered">Registered</option><option value="in_progress">In progress</option><option value="passed">Passed</option><option value="failed">Failed / carryover</option><option value="withdrawn">Withdrawn</option></select>
        <input className={field} placeholder="Grade (optional)" value={attemptForm.grade} onChange={e=>setAttemptForm({...attemptForm,grade:e.target.value})}/>
        <input className={field+' sm:col-span-2'} placeholder="Result note (optional)" value={attemptForm.result_note} onChange={e=>setAttemptForm({...attemptForm,result_note:e.target.value})}/>
        <div className="flex justify-end"><button className={primary} disabled={busy||!students.length||!courses.length||!terms.length}>Record course attempt</button></div>
      </form>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-2">Student</th><th className="p-2">Course</th><th className="p-2">Term</th><th className="p-2">Attempt</th><th className="p-2">Result</th><th className="p-2">Grade</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{attempts.map(a=><tr key={a.id}><td className="p-2 text-xs">{studentById[a.student_user_id]?.full_name||a.student_user_id}</td><td className="p-2 text-xs">{courseById[a.course_id]?.code||'—'} · {courseById[a.course_id]?.title||''}</td><td className="p-2 text-xs">{termById[a.academic_term_id]?.name||'—'}</td><td className="p-2 text-xs">{a.attempt_number}</td><td className="p-2 text-xs">{a.status==='failed'?'Carryover':a.status.replace('_',' ')}</td><td className="p-2 text-xs">{a.grade||'—'}</td></tr>)}</tbody></table>{!attempts.length&&<p className="py-4 text-xs text-slate-500 text-center">No course attempts recorded yet.</p>}</div>
    </section>
    {message&&<div role="status" className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-3 text-xs text-emerald-800 dark:text-emerald-200">{message}</div>}
    {error&&<div role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3 text-xs text-rose-700 dark:text-rose-200">{error}</div>}
    <div className="flex justify-end"><button type="button" className={secondary} onClick={()=>void refresh()}>Refresh academic data</button></div>
  </div>;
}
