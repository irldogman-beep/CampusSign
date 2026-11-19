import React, { useEffect, useMemo, useState } from 'react';
import * as db from './db';
import AcademicGradingManagement from './AcademicGradingManagement';

const panel = 'rounded-2xl sm:rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4';
const field = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs text-slate-900 dark:text-white';
const primary = 'rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-2.5 text-xs font-bold disabled:opacity-50';
const secondary = 'rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200';

const emptySettings = { id: 1, education_type: 'university', secondary_mode_enabled: false, level_label: 'Level', period_label: 'Academic year', term_label: 'Semester', terms_per_period: 2, progression_mode: 'manual', pass_mark: 40 };

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
  const [progressionPolicy, setProgressionPolicy] = useState<any>({ minimum_cgpa: '', maximum_carryovers: '', minimum_earned_credits: '', probation_minimum_cgpa: '', probation_maximum_carryovers: '' });
  const [progressionPeriodId, setProgressionPeriodId] = useState('');
  const [progressionReviews, setProgressionReviews] = useState<any[]>([]);
  const [progressionSearch, setProgressionSearch] = useState('');
  const [progressionNotes, setProgressionNotes] = useState<Record<string, string>>({});
  const [progressionBusyId, setProgressionBusyId] = useState('');

  const refresh = async () => {
    setLoading(true); setError('');
    try {
      const [settingRows, levelRows, periodRows, termRows, cohortRows, profileRows, eventRows, attemptRows, studentRows, courseRows, policyRow] = await Promise.all([
        db.loadAcademicSettings(), db.loadAcademicLevels(), db.loadAcademicPeriods(), db.loadAcademicTerms(),
        db.loadAcademicCohorts(), db.loadStudentAcademicProfiles(), db.loadStudentProgressionEvents(),
        db.loadStudentCourseAttempts(), db.loadAdminStudentAccounts(), db.loadCatalogCourses(null),
        db.loadAcademicProgressionPolicy()
      ]);
      setSettings(settingRows || emptySettings);
      setLevels(levelRows); setPeriods(periodRows); setTerms(termRows); setCohorts(cohortRows);
      setProfiles(profileRows); setEvents(eventRows); setAttempts(attemptRows); setStudents(studentRows); setCourses(courseRows);
      setProgressionPolicy({
        minimum_cgpa: policyRow?.minimum_cgpa == null ? '' : String(policyRow.minimum_cgpa),
        maximum_carryovers: policyRow?.maximum_carryovers == null ? '' : String(policyRow.maximum_carryovers),
        minimum_earned_credits: policyRow?.minimum_earned_credits == null ? '' : String(policyRow.minimum_earned_credits),
        probation_minimum_cgpa: policyRow?.probation_minimum_cgpa == null ? '' : String(policyRow.probation_minimum_cgpa),
        probation_maximum_carryovers: policyRow?.probation_maximum_carryovers == null ? '' : String(policyRow.probation_maximum_carryovers),
      });
      setProgressionPeriodId(current => current || periodRows.find(p => p.is_current)?.id || periodRows[0]?.id || '');
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
    if (profileForm.academic_status === 'expelled' && !profileForm.status_reason.trim()) {
      setError('A written reason is required before a student can be expelled.');
      return;
    }
    if (profileForm.academic_status === 'expelled' && !window.confirm('Confirm expulsion for this student? Their Student workspace access will be blocked. Their account, attendance history and academic records will be retained.')) return;
    void run(() => db.saveStudentAcademicProfile(profileForm), 'Student academic record updated and progression history recorded.');
  };

  const saveAttempt = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await db.saveStudentCourseAttempt({ ...attemptForm, attempt_number: Number(attemptForm.attempt_number) });
      setAttemptForm(prev => ({ ...prev, course_id: '', attempt_number: String(Number(prev.attempt_number) + 1), status: 'registered', grade: '', result_note: '' }));
    }, 'Course attempt recorded.');
  };

  const saveProgressionPolicy = (event: React.FormEvent) => {
    event.preventDefault();
    void run(() => db.saveAcademicProgressionPolicy(progressionPolicy), 'Progression rules saved. They will be used for the next eligibility review.');
  };

  const refreshProgressionReviews = async () => {
    if (!progressionPeriodId) { setProgressionReviews([]); return; }
    try {
      const rows = await db.loadAcademicProgressionReviews(progressionPeriodId);
      setProgressionReviews(rows);
    } catch (e) { setError(db.friendly(e)); }
  };

  useEffect(() => { void refreshProgressionReviews(); }, [progressionPeriodId]);

  const generateProgressionReviews = async () => {
    if (!progressionPeriodId) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await db.generateAcademicProgressionReviews(progressionPeriodId);
      const rows = await db.loadAcademicProgressionReviews(progressionPeriodId);
      setProgressionReviews(rows);
      setMessage(`Eligibility review refreshed. ${result?.refreshed ?? rows.length} pending record(s) updated; completed decisions were preserved.`);
    } catch (e) { setError(db.friendly(e)); }
    finally { setBusy(false); }
  };

  const decideProgression = async (review: any, decision: 'promote' | 'repeat' | 'hold' | 'deny' | 'graduate') => {
    const note = progressionNotes[review.id] || '';
    if (['repeat','hold','deny','graduate'].includes(decision) && note.trim().length < 5) {
      setError('Add a short note of at least 5 characters before recording this decision.');
      return;
    }
    const actionLabel = decision === 'promote' ? (review.eligibility_status === 'probation' ? 'promote on probation' : 'promote') :
      decision === 'repeat' ? 'keep at the current level' : decision === 'graduate' ? 'mark as graduated' :
      decision === 'hold' ? 'put on hold' : 'decline progression';
    if (!window.confirm(`Confirm: ${actionLabel} for ${review.student_name}? This decision will be saved to the student's progression history.`)) return;
    setProgressionBusyId(review.id); setError(''); setMessage('');
    try {
      await db.decideAcademicProgressionReview(review.id, decision, note);
      setProgressionReviews(await db.loadAcademicProgressionReviews(progressionPeriodId));
      setMessage(`Decision recorded for ${review.student_name}.`);
      setProgressionNotes(current => ({ ...current, [review.id]: '' }));
    } catch (e) { setError(db.friendly(e)); }
    finally { setProgressionBusyId(''); }
  };

  const filteredProgressionReviews = progressionReviews.filter(review =>
    [review.student_name, review.student_id, review.from_level, review.proposed_level, review.eligibility_status, review.decision_status]
      .some(value => String(value || '').toLowerCase().includes(progressionSearch.trim().toLowerCase()))
  );
  const progressionCounts = {
    eligible: progressionReviews.filter(r => r.eligibility_status === 'eligible').length,
    probation: progressionReviews.filter(r => r.eligibility_status === 'probation').length,
    ineligible: progressionReviews.filter(r => r.eligibility_status === 'ineligible').length,
    needsData: progressionReviews.filter(r => r.eligibility_status === 'needs_data').length,
    completed: progressionReviews.filter(r => r.decision_status !== 'pending').length,
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
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 sm:col-span-2 lg:col-span-3"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className="text-xs font-extrabold text-slate-900 dark:text-white">Institution academic mode</p><p className="text-[10px] text-slate-600 dark:text-slate-300 mt-1">CampusSign is university-first. Secondary-school workflows stay locked unless an authorised administrator deliberately enables them.</p></div><label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100"><input type="checkbox" checked={!!settings.secondary_mode_enabled} onChange={e=>{const enabled=e.target.checked;if(!window.confirm(enabled?'Enable secondary-school mode for this institution? This changes the academic mode but does not delete existing university records. Secondary-specific workflows must be configured separately.':'Return this institution to university mode? Existing academic records will be preserved.'))return;setSettings({...settings,secondary_mode_enabled:enabled,education_type:enabled?'secondary':'university'});}}/> Enable secondary-school mode</label></div><p className="text-[10px] text-slate-500 mt-2">{settings.secondary_mode_enabled?'Secondary-school mode selected. Save settings to apply the mode.':'University / higher-institution mode active. Secondary-only features remain unavailable.'}</p></div>
        <label className="text-[10px] font-bold text-slate-500">Level label<input className={field+' mt-1'} value={settings.level_label} onChange={e=>setSettings({...settings,level_label:e.target.value})} placeholder="e.g. Class or Level" required/></label>
        <label className="text-[10px] font-bold text-slate-500">Academic period label<input className={field+' mt-1'} value={settings.period_label} onChange={e=>setSettings({...settings,period_label:e.target.value})} placeholder="e.g. Academic year" required/></label>
        <label className="text-[10px] font-bold text-slate-500">Term label<input className={field+' mt-1'} value={settings.term_label} onChange={e=>setSettings({...settings,term_label:e.target.value})} placeholder="e.g. Semester or Term" required/></label>
        <label className="text-[10px] font-bold text-slate-500">Terms per academic period<select className={field+' mt-1'} value={settings.terms_per_period} onChange={e=>setSettings({...settings,terms_per_period:Number(e.target.value)})}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label>
        <label className="text-[10px] font-bold text-slate-500">Progression approval<select className={field+' mt-1'} value={settings.progression_mode} onChange={e=>setSettings({...settings,progression_mode:e.target.value})}><option value="manual">Manual administrator approval</option></select></label>
        <label className="text-[10px] font-bold text-slate-500">Minimum pass mark (%)<input className={field+' mt-1'} type="number" min="0" max="100" step="0.5" required value={settings.pass_mark ?? 40} onChange={e=>setSettings({...settings,pass_mark:Number(e.target.value)})}/></label>
        <div className="sm:col-span-2 lg:col-span-3 flex justify-end"><button className={primary} disabled={busy}>Save academic settings</button></div>
      </form>
      <p className="text-[10px] text-slate-500">Changing the institution mode or labels does not delete, rename or automatically migrate existing academic records. Promotion remains an explicit, reviewable action. Published results automatically update course attempts using the configured pass mark; failed courses remain carryovers.</p>
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
        <select className={field} value={profileForm.academic_status} onChange={e=>setProfileForm({...profileForm,academic_status:e.target.value,event_type:e.target.value === profileForm.academic_status ? profileForm.event_type : 'status_changed'})}><option value="active">Active student</option><option value="probation">Academic probation</option><option value="inactive">Inactive</option><option value="withdrawn">Withdrawn</option><option value="expelled">Expelled</option><option value="graduating">Graduating</option><option value="graduated">Graduated</option></select>
        <select className={field} value={profileForm.event_type} onChange={e=>setProfileForm({...profileForm,event_type:e.target.value})}><option value="initial_assignment">Initial assignment</option><option value="promoted">Promoted</option><option value="repeated">Repeated level</option><option value="transferred">Transferred</option><option value="returned">Returned to study</option><option value="status_changed">Status change</option></select>
        <input className={field} type="date" required value={profileForm.effective_on} onChange={e=>setProfileForm({...profileForm,effective_on:e.target.value})}/>
        <input className={field} required={profileForm.academic_status === 'expelled'} placeholder={profileForm.academic_status === 'expelled' ? 'Required: reason for expulsion' : 'Status reason (optional)'} value={profileForm.status_reason} onChange={e=>setProfileForm({...profileForm,status_reason:e.target.value})}/>
        <input className={field} placeholder="Progression note (optional)" value={profileForm.note} onChange={e=>setProfileForm({...profileForm,note:e.target.value})}/>
        <div className="sm:col-span-2 lg:col-span-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300"><strong className="block text-slate-800 dark:text-slate-100 mb-1">What these statuses mean</strong>Active students can use their workspace. Inactive, withdrawn, expelled and graduated students are blocked from student access; their historical records remain. Graduating students remain active while final clearance is completed. Use Expelled only after the institution has made its formal decision.</div><div className="sm:col-span-2 lg:col-span-3 flex justify-end"><button className={primary} disabled={busy||!students.length}>Save progression record</button></div>
      </form>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-2">Student</th><th className="p-2">Admission set</th><th className="p-2">Current level</th><th className="p-2">Last update</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{profiles.map(p=><tr key={p.student_user_id}><td className="p-2 text-xs font-semibold">{studentById[p.student_user_id]?.full_name||studentById[p.student_user_id]?.student_id||p.student_user_id}</td><td className="p-2 text-xs">{cohorts.find(c=>c.id===p.cohort_id)?.name||'Not assigned'}</td><td className="p-2 text-xs">{levelById[p.current_level_id]?.name||'Not assigned'}</td><td className="p-2 text-[10px] text-slate-500">{new Date(p.updated_at).toLocaleDateString()}</td></tr>)}</tbody></table>{!profiles.length&&<p className="py-4 text-xs text-slate-500 text-center">No progression profiles have been assigned yet.</p>}</div>
      <div className="border-t border-slate-100 dark:border-slate-800 pt-3"><h3 className="text-xs font-extrabold mb-2">Progression history</h3><div className="space-y-2">{events.slice(0,12).map(event=><div key={event.id} className="flex flex-wrap items-center justify-between gap-2 text-[10px] border-b border-slate-50 dark:border-slate-800 pb-2"><span className="font-semibold">{studentById[event.student_user_id]?.full_name||event.student_user_id}</span><span>{levelById[event.from_level_id]?.name||'—'} → {levelById[event.to_level_id]?.name||'—'}</span><span className="text-slate-500">{event.event_type.replace('_',' ')} · {event.effective_on}</span></div>)}{!events.length&&<p className="text-[10px] text-slate-500">No progression events yet.</p>}</div></div>
    </section>

    <section className={panel}>
      <div>
        <h2 className="font-extrabold text-slate-900 dark:text-white">Progression eligibility rules</h2>
        <p className="text-xs text-slate-500 mt-1">Set the institution's own requirements. These rules calculate recommendations only; students are never promoted automatically.</p>
      </div>
      <form onSubmit={saveProgressionPolicy} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <label className="text-[10px] font-bold text-slate-500">Minimum CGPA
          <input className={field+' mt-1'} type="number" min="0" step="0.01" value={progressionPolicy.minimum_cgpa} onChange={e=>setProgressionPolicy({...progressionPolicy,minimum_cgpa:e.target.value})} placeholder="Not used"/>
        </label>
        <label className="text-[10px] font-bold text-slate-500">Maximum outstanding carryovers
          <input className={field+' mt-1'} type="number" min="0" max="50" step="1" value={progressionPolicy.maximum_carryovers} onChange={e=>setProgressionPolicy({...progressionPolicy,maximum_carryovers:e.target.value})} placeholder="Not used"/>
        </label>
        <label className="text-[10px] font-bold text-slate-500">Minimum earned credits
          <input className={field+' mt-1'} type="number" min="0" max="10000" step="0.5" value={progressionPolicy.minimum_earned_credits} onChange={e=>setProgressionPolicy({...progressionPolicy,minimum_earned_credits:e.target.value})} placeholder="Not used"/>
        </label>
        <div className="sm:col-span-2 lg:col-span-3 border-t border-slate-100 dark:border-slate-800 pt-3">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Optional probation range</p>
          <p className="text-[10px] text-slate-500 mt-1">Students who narrowly miss the normal CGPA or carryover limit can be recommended for promotion on probation if they meet these limits. Credit requirements remain mandatory.</p>
        </div>
        <label className="text-[10px] font-bold text-slate-500">Probation minimum CGPA
          <input className={field+' mt-1'} type="number" min="0" step="0.01" value={progressionPolicy.probation_minimum_cgpa} onChange={e=>setProgressionPolicy({...progressionPolicy,probation_minimum_cgpa:e.target.value})} placeholder="Not used"/>
        </label>
        <label className="text-[10px] font-bold text-slate-500">Probation carryover limit
          <input className={field+' mt-1'} type="number" min="0" max="50" step="1" value={progressionPolicy.probation_maximum_carryovers} onChange={e=>setProgressionPolicy({...progressionPolicy,probation_maximum_carryovers:e.target.value})} placeholder="Not used"/>
        </label>
        <div className="flex items-end justify-end"><button className={primary} disabled={busy || (!progressionPolicy.minimum_cgpa && !progressionPolicy.maximum_carryovers && !progressionPolicy.minimum_earned_credits)}>Save progression rules</button></div>
      </form>
      <p className="text-[10px] text-slate-500">At least one normal rule is required. CGPA uses the institution's grading scale and repeat policy; carryovers count the latest failed attempt per course. Configure grade bands and course credit units before running a review.</p>
    </section>

    <section className={panel}>
      <div>
        <h2 className="font-extrabold text-slate-900 dark:text-white">Progression review</h2>
        <p className="text-xs text-slate-500 mt-1">Review students at the end of an academic period. Promote, repeat, hold or graduate only after an administrator makes an explicit decision.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <select className={field+' flex-1'} value={progressionPeriodId} onChange={e=>setProgressionPeriodId(e.target.value)}>
          <option value="">Choose academic period</option>
          {periods.map(period=><option key={period.id} value={period.id}>{period.name}</option>)}
        </select>
        <button type="button" className={primary} disabled={busy || !progressionPeriodId} onClick={()=>void generateProgressionReviews()}>
          {busy?'Preparing review…':'Generate / refresh eligibility'}
        </button>
      </div>
      {!!progressionReviews.length && <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3"><p className="text-[10px] text-emerald-800 dark:text-emerald-200">Eligible</p><p className="text-xl font-black">{progressionCounts.eligible}</p></div>
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3"><p className="text-[10px] text-amber-800 dark:text-amber-200">Probation</p><p className="text-xl font-black">{progressionCounts.probation}</p></div>
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-3"><p className="text-[10px] text-rose-800 dark:text-rose-200">Not eligible</p><p className="text-xl font-black">{progressionCounts.ineligible}</p></div>
        <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-3"><p className="text-[10px] text-slate-600 dark:text-slate-300">Needs data</p><p className="text-xl font-black">{progressionCounts.needsData}</p></div>
        <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-3"><p className="text-[10px] text-slate-600 dark:text-slate-300">Decisions made</p><p className="text-xl font-black">{progressionCounts.completed}</p></div>
      </div>}
      {progressionReviews.length>0 && <input className={field} value={progressionSearch} onChange={e=>setProgressionSearch(e.target.value)} placeholder="Search by student name, ID or level"/>}
      {!progressionPeriodId ? <p className="py-4 text-xs text-slate-500">Choose an academic period to review progression.</p> :
        progressionReviews.length===0 ? <p className="py-4 text-xs text-slate-500">No review has been generated for this period yet. Save the institution's rules, publish graded results, then generate the review.</p> :
        filteredProgressionReviews.length===0 ? <p className="py-4 text-xs text-slate-500">No students match this search.</p> :
        <div className="space-y-3">{filteredProgressionReviews.map(review=>{
          const metrics=review.metrics||{};
          const pending=review.decision_status==='pending';
          const canPromote=['eligible','probation'].includes(review.eligibility_status)&&!!review.proposed_level_id;
          const note=progressionNotes[review.id]||'';
          const badge=review.eligibility_status==='eligible'?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':review.eligibility_status==='probation'?'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200':review.eligibility_status==='ineligible'?'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200':'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
          return <article key={review.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div className="min-w-0"><p className="text-sm font-extrabold text-slate-900 dark:text-white">{review.student_name}</p><p className="text-[10px] text-slate-500">{review.student_id} · {review.from_level||'Level not assigned'} {review.proposed_level? '→ '+review.proposed_level : ''}</p></div>
              <div className="flex flex-wrap gap-1.5"><span className={'rounded-full px-2.5 py-1 text-[9px] font-bold '+badge}>{review.eligibility_status.replace('_',' ')}</span><span className="rounded-full px-2.5 py-1 text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{review.decision_status.replace(/_/g,' ')}</span></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2"><p className="text-[9px] text-slate-500">CGPA</p><p className="text-sm font-extrabold">{metrics.cgpa==null?'—':Number(metrics.cgpa).toFixed(2)} <span className="text-[9px] font-normal text-slate-500">/ {metrics.maximum_grade_point??'—'}</span></p></div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2"><p className="text-[9px] text-slate-500">Earned credits</p><p className="text-sm font-extrabold">{Number(metrics.earned_credits||0).toFixed(2)}</p></div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2"><p className="text-[9px] text-slate-500">Carryovers</p><p className="text-sm font-extrabold">{metrics.outstanding_carryovers??0}</p></div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2"><p className="text-[9px] text-slate-500">Attempts this period</p><p className="text-sm font-extrabold">{metrics.period_attempts??0}</p></div>
            </div>
            {!!(review.reasons||[]).length && <ul className="list-disc pl-5 space-y-1 text-[10px] text-slate-600 dark:text-slate-300">{review.reasons.map((reason:string,index:number)=><li key={index}>{reason}</li>)}</ul>}
            {review.decision_note && <p className="text-[10px] text-slate-500">Decision note: {review.decision_note}</p>}
            {pending && <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              <input className={field} value={note} onChange={e=>setProgressionNotes(current=>({...current,[review.id]:e.target.value}))} placeholder="Decision note (required for repeat, hold, decline or graduation)"/>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={!!progressionBusyId||!canPromote} onClick={()=>void decideProgression(review,'promote')}>{progressionBusyId===review.id?'Saving…':review.eligibility_status==='probation'?'Promote on probation':'Approve promotion'}</button>
                <button type="button" className={secondary} disabled={!!progressionBusyId||!review.from_level_id||!['active','probation'].includes(metrics.academic_status)} onClick={()=>void decideProgression(review,'repeat')}>Repeat level</button>
                {review.eligibility_status==='completion_review' && <button type="button" className={secondary} disabled={!!progressionBusyId} onClick={()=>void decideProgression(review,'graduate')}>Mark graduated</button>}
                <button type="button" className={secondary} disabled={!!progressionBusyId} onClick={()=>void decideProgression(review,'hold')}>Hold</button>
                <button type="button" className="rounded-xl border border-rose-200 dark:border-rose-900 px-3 py-2.5 text-xs font-bold text-rose-700 dark:text-rose-300" disabled={!!progressionBusyId} onClick={()=>void decideProgression(review,'deny')}>Decline</button>
              </div>
            </div>}
          </article>;
        })}</div>}
      <p className="text-[10px] text-slate-500">Refreshing recalculates pending reviews only. Completed decisions and their audit history are preserved. Promotion, repetition and graduation are always administrator decisions.</p>
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
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-2">Student</th><th className="p-2">Course</th><th className="p-2">Term</th><th className="p-2">Attempt</th><th className="p-2">Result</th><th className="p-2">Final score</th><th className="p-2">Grade</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{attempts.map(a=><tr key={a.id}><td className="p-2 text-xs">{studentById[a.student_user_id]?.full_name||a.student_user_id}</td><td className="p-2 text-xs">{courseById[a.course_id]?.code||'—'} · {courseById[a.course_id]?.title||''}</td><td className="p-2 text-xs">{termById[a.academic_term_id]?.name||'—'}</td><td className="p-2 text-xs">{a.attempt_number}</td><td className="p-2 text-xs">{a.status==='failed'&&!attempts.some(next=>next.student_user_id===a.student_user_id&&next.course_id===a.course_id&&next.attempt_number>a.attempt_number)?'Carryover':a.status==='failed'?'Failed attempt':a.status.replace('_',' ')}</td><td className="p-2 text-xs tabular-nums">{a.final_score==null?'—':Number(a.final_score).toFixed(2)+'%'}</td><td className="p-2 text-xs">{a.grade||'—'}</td></tr>)}</tbody></table>{!attempts.length&&<p className="py-4 text-xs text-slate-500 text-center">No course attempts recorded yet.</p>}</div>
    </section>
    <AcademicGradingManagement />
    {message&&<div role="status" className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-3 text-xs text-emerald-800 dark:text-emerald-200">{message}</div>}
    {error&&<div role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3 text-xs text-rose-700 dark:text-rose-200">{error}</div>}
    <div className="flex justify-end"><button type="button" className={secondary} onClick={()=>void refresh()}>Refresh academic data</button></div>
  </div>;
}
