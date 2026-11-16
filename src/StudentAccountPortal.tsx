import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Bell, BookOpen, CalendarDays, CheckCircle2, Clock3,
  GraduationCap, Scan, LogOut, RefreshCw, ShieldCheck, UserRound
} from 'lucide-react';
import { supabase } from './supabase';
import * as db from './db';

type Props = {
  onClose: () => void;
  onEnroll: (profile: any, courses: any[]) => void;
  onScan?: () => void;
};

export default function StudentAccountPortal({ onClose, onEnroll, onScan }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [studentId, setStudentId] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [level, setLevel] = useState('100');
  const [departments, setDepartments] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expandedNotification, setExpandedNotification] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'courses' | 'attendance' | 'inbox' | 'profile'>('courses');
  const [rerollStatus, setRerollStatus] = useState<any>(null);
  const [rerollDepartment, setRerollDepartment] = useState('');
  const [rerollReason, setRerollReason] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [data, inbox, reroll] = await Promise.all([
        db.loadStudentDashboard(),
        db.loadNotifications(30),
        db.loadDepartmentRerollStatus(),
      ]);
      setDashboard(data);
      setRerollStatus(reroll);
      setNotifications(inbox.filter((item: any) =>
        item.notification_type === 'announcement' || item.notification_type === 'department_reroll' || item.recipient_role === 'student'
      ));
      setError('');
    } catch (e: any) {
      setError(db.friendly(e));
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      db.loadCatalogDepartments(),
      supabase.auth.getSession(),
    ]).then(async ([rows, session]) => {
      if (!active) return;
      setDepartments(rows.filter((d: any) => d.is_active));
      if (session.data.session) await refresh();
      else setLoading(false);
    }).catch((e) => {
      if (active) { setError(db.friendly(e)); setLoading(false); }
    });
    return () => { active = false; };
  }, [refresh]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: {
            account_type: 'student',
            student_id: studentId.trim().toUpperCase(),
            name: fullName.trim(),
            dept: department,
            level,
          } }
        });
        if (authError) throw authError;
        setPassword('');
        if (data.session) {
          await refresh();
          setNotice('Your account has been created. It is awaiting administrator verification.');
        } else {
          setMode('login');
          setNotice('Account created. Confirm your email using the link we sent, then sign in here.');
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(), password
        });
        if (authError) throw authError;
        setPassword('');
        await refresh();
      }
    } catch (e: any) {
      setError(e?.message ? db.friendly(e) : 'Could not complete the account request.');
    } finally { setBusy(false); }
  };

  const submitDepartmentReroll = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rerollDepartment || rerollReason.trim().length < 10) return;
    if (!window.confirm(`Request a department change from ${profile.department} to ${rerollDepartment}? An administrator must approve it first.`)) return;
    setBusy(true); setError(''); setNotice('');
    try { await db.requestDepartmentReroll(rerollDepartment, rerollReason.trim()); setRerollReason(''); setNotice('Your department change request has been sent for administrator review.'); await refresh(); }
    catch (e) { setError(db.friendly(e)); }
    finally { setBusy(false); }
  };

  const applyApprovedReroll = async () => {
    if (!window.confirm('Apply the approved department change? Your old course enrolments and face registration will be cleared. Your attendance history will remain. You will need to select courses and register your face again.')) return;
    setBusy(true); setError(''); setNotice('');
    try { await db.applyDepartmentReroll(); setActiveSection('courses'); setNotice('Department updated. Choose your new courses and complete face registration.'); await refresh(); }
    catch (e) { setError(db.friendly(e)); }
    finally { setBusy(false); }
  };

  const markRead = async (id: string) => {
    try {
      await db.markNotificationRead(id);
      setNotifications(current => current.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
      setDashboard(current => current ? { ...current, unread_notifications: Math.max(0, Number(current.unread_notifications || 0) - 1) } : current);
    } catch (e) { setError(db.friendly(e)); }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await supabase.auth.signOut();
      setDashboard(null); setNotifications([]); setNotice('You have signed out.');
    } catch (e) { setError(db.friendly(e)); }
    finally { setBusy(false); }
  };

  const profile = dashboard?.profile;
  const courses = dashboard?.courses || [];
  const attendance = dashboard?.attendance || [];
  const isSignedIn = !!profile;

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5 page-enter px-0.5">
      <section className="rounded-[1.75rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 text-white p-4 sm:p-7 border border-emerald-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/15 border border-amber-300/30 grid place-items-center text-amber-300"><GraduationCap className="w-6 h-6"/></div>
            <div><p className="text-[10px] uppercase tracking-[.2em] text-emerald-200 font-black">CampusSign · Student services</p><h1 className="text-xl sm:text-2xl font-black mt-1">Student services</h1></div>
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2">
            {isSignedIn && onScan && <button type="button" onClick={onScan} className="px-3 py-2 rounded-xl bg-amber-400 text-emerald-950 text-xs font-extrabold inline-flex items-center gap-2"><Scan className="w-4 h-4"/>Scan attendance</button>}
            {isSignedIn && <button type="button" onClick={signOut} disabled={busy} className="px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-xs font-bold inline-flex items-center gap-2"><LogOut className="w-4 h-4"/>Sign out</button>}
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl bg-amber-400 text-emerald-950 text-xs font-extrabold">Back to check-in</button>
          </div>
        </div>
      </section>

      {notice && <div role="status" className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs">{notice}</div>}
      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-200 text-xs flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0"/><span>{error}</span></div>}

      {loading ? <div className="py-16 text-center text-sm text-slate-500"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2"/>Loading your student account…</div> : !isSignedIn ? (
        <section className="max-w-xl mx-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7 shadow-lg">
          <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 mb-5">
            <button type="button" onClick={()=>{setMode('login');setError('');}} className={`flex-1 rounded-lg py-2.5 text-xs font-bold ${mode==='login'?'bg-emerald-900 text-amber-300':'text-slate-500'}`}>Already have an account</button>
            <button type="button" onClick={()=>{setMode('signup');setError('');}} className={`flex-1 rounded-lg py-2.5 text-xs font-bold ${mode==='signup'?'bg-emerald-900 text-amber-300':'text-slate-500'}`}>New student</button>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div><h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{mode==='signup'?'Get started with CampusSign':'Welcome back'}</h2></div>
            {mode==='signup' && <>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student ID</span><input required maxLength={40} value={studentId} onChange={e=>setStudentId(e.target.value.toUpperCase())} placeholder="Your matriculation number" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Full registered name</span><input required maxLength={120} value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="As it appears on your student record" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Department</span><select required value={department} onChange={e=>setDepartment(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"><option value="">Choose department</option>{departments.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}</select></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Academic level</span><select value={level} onChange={e=>setLevel(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm">{['100','200','300','400','500','600'].map(v=><option key={v} value={v}>{v} Level</option>)}</select></label>
            </>}
            <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Email address</span><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
            <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Password</span><input required type="password" minLength={8} autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
            <button disabled={busy || !email.trim() || !password || (mode==='signup' && (!studentId.trim() || !fullName.trim() || !department))} className="w-full rounded-xl bg-emerald-900 text-amber-300 py-3.5 text-sm font-extrabold disabled:opacity-50">{busy?'Please wait…':mode==='signup'?'Create account & continue':'Sign in to Student services'}</button>
          </form>
          {mode==='signup' && <p className="mt-4 text-[10px] text-slate-500 leading-relaxed">Your account is your CampusSign login. First, an administrator checks and approves your student details. After approval, you can select courses and enrol your face; the relevant lecturers then review your course requests. If you already have academic records, the administrator can use them to verify you before you request any additional courses.</p>}
        </section>
      ) : (
        <div className="space-y-4">
          {profile.status === 'approved' && (
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 text-white p-5 sm:p-6 shadow-lg border border-emerald-800">
            <div className="absolute -right-12 -top-16 w-48 h-48 rounded-full bg-amber-400/10 blur-2xl" />
            <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.2em] text-emerald-200 font-black">Your CampusSign dashboard</p><h2 className="text-xl sm:text-2xl font-black mt-1">Good to see you, {String(profile.full_name || 'student').trim().split(' ')[0]}.</h2></div><div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-2 text-[10px] font-bold text-emerald-50"><ShieldCheck className="w-3.5 h-3.5 text-amber-300"/>Account verified</div></div>
            
          </section>          )}

          <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0"><div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 grid place-items-center"><UserRound className="w-5 h-5"/></div><div className="min-w-0"><h2 className="font-extrabold text-slate-900 dark:text-white">{profile.full_name}</h2><p className="text-xs text-slate-500 break-all">{profile.student_id}</p></div></div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-extrabold ${profile.status==='approved'?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':profile.status==='rejected'?'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200':'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>{profile.status==='approved'?<ShieldCheck className="w-3.5 h-3.5"/>:<Clock3 className="w-3.5 h-3.5"/>}{profile.status==='approved'?'Verified student account':profile.status==='rejected'?'Verification declined':'Awaiting administrator verification'}</span>
            </div>
            {profile.status==='pending' && <div className="mt-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-4"><p className="text-xs text-amber-900 dark:text-amber-200 font-semibold">Step 1 of 2 · Administrator verification. Your details are waiting for an administrator to review them. Course selection, face registration and lecturer review will unlock only after your account is approved. If you already have courses on the academic roster, the administrator can verify your account against those records.</p><button type="button" onClick={refresh} className="mt-3 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 px-4 py-2.5 text-xs font-bold">Check approval status</button></div>}
            {profile.status==='rejected' && <p className="mt-4 text-xs text-rose-700 dark:text-rose-300">Your student account was not approved by the administrator. Contact your department administrator to clarify or correct your details.</p>}
          </section>

          {profile.status==='approved' && <>
             <nav aria-label="Student dashboard sections" className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
               {([
                 ['courses','Courses',BookOpen,courses.length],
                 ['attendance','Attendance',CalendarDays,attendance.length],
                 ['inbox','Inbox',Bell,notifications.length],
                 ['profile','Profile',UserRound,null],
               ] as const).map(([key,label,Icon,count]) => (
                 <button key={key} type="button" onClick={()=>setActiveSection(key)} aria-pressed={activeSection===key}
                   className={`interactive-card min-w-0 rounded-2xl border px-3.5 py-3.5 sm:px-4 sm:py-4 text-left transition-colors ${activeSection===key?'bg-emerald-900 text-amber-300 border-emerald-800 shadow-sm':'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'}`}>
                   <span className="flex items-center justify-between gap-2"><Icon className="w-4 h-4 shrink-0"/>{count!==null&&<span className="text-[10px] font-bold tabular-nums">{count}</span>}</span>
                   <span className="block mt-2 text-xs font-bold">{label}</span>
                 </button>
               ))}
             </nav>
             {activeSection==='courses' && <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                 <h3 className="font-extrabold text-slate-900 dark:text-white">My courses</h3>
                 <button type="button" onClick={()=>onEnroll(profile,courses)} className="w-full sm:w-auto rounded-xl bg-emerald-900 text-amber-300 px-4 py-2.5 text-xs font-bold">{courses.length===0?'Choose courses & register face':'Request another course'}</button>
               </div>
               {courses.length===0?<p className="py-8 text-center text-xs text-slate-500">No approved courses are linked to this account yet.</p>:<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{courses.map((course:any,i:number)=><article key={course.course+i} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4"><div className="flex items-start justify-between gap-2"><strong className="text-sm text-slate-900 dark:text-white break-words">{course.course}</strong><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0"/></div><p className="text-[11px] text-slate-500 mt-2 break-words">{course.lecturer}</p><p className="text-[11px] mt-2 text-emerald-700 dark:text-emerald-300">{course.face_enrolled?'Face enrolment active':'Face enrolment pending'}</p></article>)}</div>}
             </section>}
             {activeSection==='attendance' && <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
               <h3 className="font-extrabold text-slate-900 dark:text-white mb-3">Attendance history</h3>
               {attendance.length===0?<p className="py-8 text-center text-xs text-slate-500">No attendance records yet.</p>:<div className="space-y-2">{attendance.map((row:any)=><article key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto_auto] gap-x-3 gap-y-2"><div className="min-w-0"><p className="text-xs font-bold text-slate-900 dark:text-white break-words">{row.course}</p><p className="text-[10px] text-slate-500 mt-1">{new Date(row.created_at).toLocaleString()}</p></div><div className="text-[11px] text-slate-600 dark:text-slate-300">{row.status}</div><div className="col-span-2 sm:col-span-1 text-[10px] font-mono text-slate-500 break-all">{row.receipt_no}</div></article>)}</div>}
             </section>}
             {activeSection==='inbox' && <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
               <div className="flex items-center justify-between gap-2 mb-3"><h3 className="font-extrabold text-slate-900 dark:text-white">Inbox</h3><span className="text-[10px] text-slate-500">{notifications.length} messages</span></div>
               {notifications.length===0?<p className="py-6 text-xs text-slate-500">No messages yet.</p>:<div className="space-y-2">{notifications.map((item:any)=><article key={item.id} className={`rounded-xl border p-3 ${item.read_at?'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50':'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30'}`}>
                 <button type="button" aria-expanded={expandedNotification===item.id} onClick={()=>{setExpandedNotification(current=>current===item.id?null:item.id);if(!item.read_at)markRead(item.id);}} className="w-full min-w-0 text-left"><span className="flex items-start justify-between gap-2"><strong className="text-xs text-slate-900 dark:text-white break-words">{item.title}</strong><span className="text-[10px] text-slate-500 shrink-0">{new Date(item.created_at).toLocaleDateString()}</span></span><span className="block text-[10px] text-slate-500 mt-1">{item.read_at?'Read':'New'}</span></button>
                 {expandedNotification===item.id&&<p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 mt-3 whitespace-pre-wrap break-words">{item.message}</p>}
               </article>)}</div>}
             </section>}
             {activeSection==='profile' && <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
               <h3 className="font-extrabold text-slate-900 dark:text-white mb-3">Student details</h3>
               <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                 <div><dt className="text-[10px] text-slate-500">Full name</dt><dd className="font-semibold mt-1 break-words">{profile.full_name}</dd></div>
                 <div><dt className="text-[10px] text-slate-500">Student ID</dt><dd className="font-semibold mt-1 break-all">{profile.student_id}</dd></div>
                 <div><dt className="text-[10px] text-slate-500">Department</dt><dd className="font-semibold mt-1 break-words">{profile.department}</dd></div>
                 <div><dt className="text-[10px] text-slate-500">Level</dt><dd className="font-semibold mt-1">{profile.level} Level</dd></div>
               </dl>
               <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                 <h4 className="text-sm font-bold text-slate-900 dark:text-white">Change department</h4>
                 {rerollStatus && ['pending','approved'].includes(rerollStatus.status) ? (
                   <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                     <div className="flex items-center justify-between gap-2"><strong className="text-xs break-words">{rerollStatus.current_department} → {rerollStatus.requested_department}</strong><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${rerollStatus.status==='approved'?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800'}`}>{rerollStatus.status==='approved'?'Approved':'Pending review'}</span></div>
                     <p className="text-xs text-slate-500 break-words">{rerollStatus.reason}</p>
                     {rerollStatus.admin_note&&<p className="text-[11px] text-slate-500">Admin note: {rerollStatus.admin_note}</p>}
                     {rerollStatus.status==='approved'&&<button type="button" disabled={busy} onClick={applyApprovedReroll} className="w-full rounded-xl bg-emerald-900 text-amber-300 px-4 py-3 text-xs font-extrabold disabled:opacity-50">Apply approved department change</button>}
                   </div>
                 ) : (
                   <>
                     {rerollStatus?.status==='rejected'&&<p className="text-xs text-rose-600 dark:text-rose-300">Your last request was declined. You can submit a new request with further information.</p>}
                     {rerollStatus?.status==='applied'&&<p className="text-xs text-emerald-700 dark:text-emerald-300">Your last department change was applied on {new Date(rerollStatus.applied_at).toLocaleDateString()}.</p>}
                     <form onSubmit={submitDepartmentReroll} className="space-y-2">
                       <select required value={rerollDepartment} onChange={e=>setRerollDepartment(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-xs">
                         <option value="">Choose new department</option>{departments.filter(d=>d.name!==profile.department).map(d=><option key={d.id} value={d.name}>{d.name}</option>)}
                       </select>
                       <textarea required minLength={10} maxLength={500} rows={3} value={rerollReason} onChange={e=>setRerollReason(e.target.value)} placeholder="Explain why you need to change department (10–500 characters)" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-xs resize-y"/>
                       <button type="submit" disabled={busy||!rerollDepartment||rerollReason.trim().length<10} className="w-full rounded-xl border border-emerald-800 text-emerald-800 dark:text-emerald-300 px-4 py-3 text-xs font-bold disabled:opacity-50">Request department change</button>
                     </form>
                   </>
                 )}
               </div>
             </section>}
           </>}
           <div className="flex justify-end"><button type="button" onClick={refresh} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5"/>Refresh account</button></div>
        </div>
      )}
    </div>
  );
}
