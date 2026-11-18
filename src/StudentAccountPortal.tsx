import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Bell, BookOpen, CalendarDays, CheckCircle2, Clock3, ClipboardList,
  GraduationCap, Scan, LogOut, RefreshCw, ShieldCheck, UserRound, Eye, EyeOff
} from 'lucide-react';
import { supabase } from './supabase';
import * as db from './db';
import WorkspaceUxControls from './WorkspaceUxControls';
const StudentResults = React.lazy(() => import('./StudentResults'));

type Props = {
  onClose: () => void;
  onEnroll: (profile: any, courses: any[]) => void;
  onTakeAttendance?: (profile: any) => void;
  branding?: any;
};

export default function StudentAccountPortal({ onClose, onEnroll, onTakeAttendance, branding }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [level, setLevel] = useState('100');
  const [departments, setDepartments] = useState<any[]>([]);
  const [departmentLoadError, setDepartmentLoadError] = useState('');
  const [dashboard, setDashboard] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [enrollmentRequests, setEnrollmentRequests] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [inboxBusy, setInboxBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expandedNotification, setExpandedNotification] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'courses' | 'attempts' | 'results' | 'attendance' | 'requests' | 'inbox' | 'profile'>('courses');
  const [attendanceCourseFilter, setAttendanceCourseFilter] = useState('');
  const [attendanceDateFilter, setAttendanceDateFilter] = useState('');
  const [rerollStatus, setRerollStatus] = useState<any>(null);
  const [rerollDepartment, setRerollDepartment] = useState('');
  const [rerollReason, setRerollReason] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Load the core dashboard first. Optional services must not prevent
      // a student from opening their account and academic records.
      const data = await db.loadStudentDashboard();
      setDashboard(data);

      const [inboxResult, rerollResult, requestsResult] = await Promise.allSettled([
        db.loadNotifications(30),
        db.loadDepartmentRerollStatus(),
        db.loadStudentEnrollmentRequests(),
      ]);
      const optionalErrors: string[] = [];
      if (inboxResult.status === 'fulfilled') {
        // Row-level security already limits this query to the signed-in user.
        setNotifications(inboxResult.value);
      } else {
        setNotifications([]);
        optionalErrors.push('Your inbox could not be loaded.');
      }
      if (rerollResult.status === 'fulfilled') {
        setRerollStatus(rerollResult.value);
      } else {
        setRerollStatus(null);
        optionalErrors.push('Department-change status could not be loaded.');
      }
      if (requestsResult.status === 'fulfilled') {
        setEnrollmentRequests(requestsResult.value);
      } else {
        setEnrollmentRequests([]);
        optionalErrors.push('Course-request status could not be loaded.');
      }
      if (optionalErrors.length) setError(optionalErrors.join(' '));
    } catch (e: any) {
      setDashboard(null);
      const failure = String(e?.message || '');
      if (failure.includes('student_account_not_found')) {
        try { await supabase.auth.signOut(); } catch { /* keep the account form usable */ }
        setError('This login is not linked to a Student account. Use the Staff workspace for a staff login, or create a Student account.');
      } else if (failure.includes('student_account_inactive')) {
        try { await supabase.auth.signOut(); } catch { /* keep the account form usable */ }
        setError('This student account is marked inactive, withdrawn, expelled or graduated. Student workspace access has been disabled. Contact the institution administrator if you believe this is incorrect.');
      } else if (failure.includes('authentication_required')) {
        try { await supabase.auth.signOut(); } catch { /* keep the account form usable */ }
        setError('Your Student session has expired. Please sign in again.');
      } else {
        setError(db.friendly(e));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshInbox = useCallback(async () => {
    setInboxBusy(true);
    try {
      setNotifications(await db.loadNotifications(30));
      setError('');
    } catch (e) {
      setError(db.friendly(e));
    } finally {
      setInboxBusy(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    // Load the catalogue separately so a temporary catalogue problem cannot
    // block an existing student from signing in.
    db.loadCatalogDepartments()
      .then(rows => {
        if (!active) return;
        setDepartments(rows.filter((d: any) => d.is_active));
        setDepartmentLoadError('');
      })
      .catch(e => {
        if (!active) return;
        setDepartments([]);
        setDepartmentLoadError(db.friendly(e));
      });

    supabase.auth.getSession()
      .then(async ({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) throw sessionError;
        if (data.session) await refresh();
        else setLoading(false);
      })
      .catch(e => {
        if (active) {
          setError(db.friendly(e));
          setLoading(false);
        }
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

  const markAllRead = async () => {
    if (!unreadCount || inboxBusy) return;
    setInboxBusy(true);
    try {
      await db.markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications(current => current.map(item => ({ ...item, read_at: item.read_at || readAt })));
      setDashboard(current => current ? { ...current, unread_notifications: 0 } : current);
    } catch (e) { setError(db.friendly(e)); }
    finally { setInboxBusy(false); }
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
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      setDashboard(null);
      setNotifications([]);
      setRerollStatus(null);
      setActiveSection('courses');
      setExpandedNotification(null);
      setRerollDepartment('');
      setRerollReason('');
      setMode('login');
      setPassword('');
      setError('');
      setNotice('You have signed out. Sign in again to continue.');
    } catch (e) { setError(db.friendly(e)); }
    finally { setBusy(false); }
  };

  const profile = dashboard?.profile;
  const courses = dashboard?.courses || [];
  const attendance = dashboard?.attendance || [];
  const unreadCount = notifications.filter(item => !item.read_at).length;
  const attendanceCourses: string[] = [...new Set<string>(attendance.map((row: any) => String(row.course || '')).filter((course: string) => course.length > 0))].sort();
  const filteredAttendance = attendance.filter((row: any) =>
    (!attendanceCourseFilter || row.course === attendanceCourseFilter) &&
    (!attendanceDateFilter || String(row.created_at || '').slice(0, 10) === attendanceDateFilter)
  );
  const isSignedIn = !!profile;

  return (
    <div className="cs-student-account max-w-5xl mx-auto space-y-4 sm:space-y-5 page-enter px-0.5">
      <section className="cs-space-header cs-space-header--student">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-[10px] uppercase tracking-[.18em] text-emerald-200 font-black">{branding?.brand_name || 'CampusSign'} · Student</p><h1 className="text-lg sm:text-xl font-black mt-0.5">{branding?.student_app_name || 'Student workspace'}</h1></div>
          {isSignedIn
            ? <button type="button" onClick={signOut} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 px-4 py-2.5 text-xs font-extrabold text-rose-700 dark:text-rose-200 disabled:opacity-50"><LogOut className="w-4 h-4"/>{busy ? 'Signing out…' : 'Sign out'}</button>
            : <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300">Back</button>}
        </div>
      </section>

      {notice && <div role="status" className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs">{notice}</div>}
      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-200 text-xs flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0"/><span>{error}</span></div>}

      {loading ? <div className="py-16 text-center text-sm text-slate-500"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2"/>Loading your student account…</div> : !isSignedIn ? (
        <section className="cs-auth-layout cs-auth-layout--student">
          <aside className="cs-auth-aside">
            <div className="cs-auth-aside-mark"><GraduationCap className="w-8 h-8"/></div>
            <p className="cs-auth-aside-kicker">{branding?.brand_name || 'CAMPUSSIGN'} · STUDENT</p>
            <h2>Your campus life,<br/>all in sync.</h2>
            <p>Sign in to keep your courses, attendance and student services together in one secure place.</p>
            <div className="cs-auth-aside-list">
              <span><BookOpen className="w-4 h-4"/> Keep track of your courses</span>
              <span><CalendarDays className="w-4 h-4"/> Follow your attendance record</span>
              <span><ShieldCheck className="w-4 h-4"/> Protect your student identity</span>
            </div>
            <div className="cs-auth-aside-foot">Your student workspace, wherever campus takes you</div>
          </aside>
          <div className="cs-auth-card">
          <div className="cs-auth-mode-toggle flex gap-2 p-1 rounded-xl mb-5">
            <button type="button" onClick={()=>{setMode('login');setError('');setNotice('');}} className={`flex-1 rounded-lg py-2.5 text-xs font-bold ${mode==='login'?'is-active':''}`}>Sign in</button>
            <button type="button" onClick={()=>{setMode('signup');setError('');setNotice('');}} className={`flex-1 rounded-lg py-2.5 text-xs font-bold ${mode==='signup'?'is-active':''}`}>Create account</button>
          </div>
          <form onSubmit={submit} className="cs-auth-form space-y-3">
            <div><h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{mode==='signup' ? `Get started with ${branding?.brand_name || 'CampusSign'}` : 'Welcome back'}</h2><p className="text-xs text-slate-500 mt-1">{branding?.student_welcome || 'Sign in to manage your courses and attendance.'}</p></div>
            {mode==='signup' && <>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student ID</span><input required maxLength={40} value={studentId} onChange={e=>setStudentId(e.target.value.toUpperCase())} placeholder="Your matriculation number" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Full registered name</span><input required maxLength={120} value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="As it appears on your student record" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Department</span>{departments.length > 0 ? <select required value={department} onChange={e=>setDepartment(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"><option value="">Choose department</option>{departments.map(d=><option key={d.id} value={d.name}>{d.name}{d.faculty_name ? ' — ' + d.faculty_name : ''}</option>)}</select> : <p className="mt-1 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">{departmentLoadError || 'No active departments are available yet. Please try again later or contact your administrator.'}</p>}</label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Academic level</span><select value={level} onChange={e=>setLevel(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm">{['100','200','300','400','500','600'].map(v=><option key={v} value={v}>{v} Level</option>)}</select></label>
            </>}
            <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Email address</span><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
            <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Password</span><span className="mt-1 flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus-within:ring-2 focus-within:ring-emerald-700/20"><input required type={showPassword?'text':'password'} minLength={8} autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" className="min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-sm outline-none focus:ring-0"/><button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} className="shrink-0 rounded-lg px-3 py-2 text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-300"><span className="inline-flex items-center gap-1.5 text-[10px] font-bold">{showPassword?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}{showPassword?'Hide':'Show'}</span></button></span>{mode==='signup'&&<span className="mt-1 block text-[10px] text-slate-500">Use at least 8 characters. You can reveal it briefly to check for typing mistakes.</span>}</label>
            <button disabled={busy || !email.trim() || !password || (mode==='signup' && (!studentId.trim() || !fullName.trim() || !department || departments.length===0))} className="cs-auth-submit w-full rounded-xl py-3.5 text-sm font-extrabold disabled:opacity-50">{busy?'Please wait…':mode==='signup'?'Create student account':'Sign in to Student services'}</button>
          </form>

          {mode==='signup' && <p className="mt-4 text-[10px] text-slate-500 leading-relaxed">Your account is your CampusSign login. First, an administrator checks and approves your student details. After approval, you can select courses and enrol your face; the relevant lecturers then review your course requests. If you already have academic records, the administrator can use them to verify you before you request any additional courses.</p>}
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {profile.status === 'approved' && <div className="flex justify-end">
            <button type="button" onClick={() => onTakeAttendance?.(profile)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-900 hover:bg-emerald-800 px-4 py-3 text-xs font-extrabold text-white shadow-sm border border-emerald-700">
              <Scan className="w-4 h-4"/>Take attendance
            </button>
          </div>}

          <section className="px-1">
            <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
              <div className="min-w-0"><p className="text-sm font-extrabold text-slate-900 dark:text-white">{profile.full_name}</p><p className="text-[11px] text-slate-500 break-all">{profile.student_id}</p></div>
              {profile.status !== 'approved' && <span className={`text-[10px] font-bold ${profile.status==='rejected'?'text-rose-600 dark:text-rose-300':'text-amber-700 dark:text-amber-300'}`}>{profile.status==='rejected'?'Verification declined':'Awaiting verification'}</span>}
            </div>
            {profile.status==='pending' && <div className="mt-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-4"><p className="text-xs text-amber-900 dark:text-amber-200 font-semibold">Step 1 of 2 · Administrator verification. Your details are waiting for an administrator to review them. Course selection, face registration and lecturer review will unlock only after your account is approved. If you already have courses on the academic roster, the administrator can verify your account against those records.</p><button type="button" onClick={refresh} className="mt-3 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 px-4 py-2.5 text-xs font-bold">Check approval status</button></div>}
            {profile.status==='rejected' && <p className="mt-4 text-xs text-rose-700 dark:text-rose-300">Your student account was not approved by the administrator. Contact your department administrator to clarify or correct your details.</p>}
          </section>

          {profile.status==='approved' && <>
             <div className="cs-workspace-layout-shell">
             <WorkspaceUxControls />
             <div className="cs-workspace-layout grid grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)] gap-4 lg:gap-6 items-start">
               <aside className="cs-workspace-sidebar lg:sticky lg:top-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 space-y-3">
                 <div className="px-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                   <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-700 dark:text-emerald-300">Student menu</p>
                   <h2 className="text-sm font-extrabold text-slate-900 dark:text-white mt-1">My workspace</h2>
                   <p className="text-[10px] text-slate-500 mt-1">Your courses, results and account.</p>
                 </div>
             <nav aria-label="Student dashboard sections" className="cs-student-nav grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">
               {([
                 ['courses','Courses',BookOpen,courses.length],
                 ['attempts','Course attempts',ClipboardList,(dashboard?.course_attempts || []).length],
                 ['results','Results',GraduationCap,null],
                 ['attendance','Attendance',CalendarDays,attendance.length],
                 ['requests','Course requests',ClipboardList,enrollmentRequests.length],
                 ['inbox','Inbox',Bell,unreadCount],
                 ['profile','Profile',UserRound,null],
               ] as const).map(([key,label,Icon,count]) => (
                 <button key={key} type="button" onClick={()=>setActiveSection(key)} aria-pressed={activeSection===key}
                   className={`cs-student-nav-button inline-flex items-center justify-center gap-2 shrink-0 rounded-xl px-3 py-3 text-xs font-bold justify-start transition-colors ${activeSection===key?'is-active':''}`}>
                   <Icon className="w-4 h-4 shrink-0"/>
                   <span>{label}</span>
                   {count!==null&&<span className="text-[10px] font-bold tabular-nums opacity-75">{count}</span>}
                 </button>
               ))}
             </nav>
               </aside>
               <div className="min-w-0 space-y-4">

             {activeSection==='courses' && <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/20 p-4 sm:p-5 space-y-3">
               <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[10px] uppercase tracking-[.16em] font-black text-emerald-700 dark:text-emerald-300">Your academic journey</p><h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-1">Account overview</h3><p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{profile.department || 'Department not assigned'} · {profile.level || 'Level not set'}</p></div><span className="rounded-full px-3 py-1.5 text-[10px] font-extrabold bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">Account approved</span></div>
               <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                 <div className="rounded-xl bg-white dark:bg-slate-900 p-3"><p className="text-[10px] text-slate-500">Approved courses</p><p className="text-xl font-black text-slate-900 dark:text-white">{courses.length}</p></div>
                 <div className="rounded-xl bg-white dark:bg-slate-900 p-3"><p className="text-[10px] text-slate-500">Pending requests</p><p className="text-xl font-black text-slate-900 dark:text-white">{enrollmentRequests.filter((r:any)=>r.status==='pending').length}</p></div>
                 <div className="rounded-xl bg-white dark:bg-slate-900 p-3"><p className="text-[10px] text-slate-500">Face enrolment</p><p className="text-xl font-black text-slate-900 dark:text-white">{courses.filter((c:any)=>c.face_enrolled).length}/{courses.length}</p></div>
                 <div className="rounded-xl bg-white dark:bg-slate-900 p-3"><p className="text-[10px] text-slate-500">Unread messages</p><p className="text-xl font-black text-slate-900 dark:text-white">{unreadCount}</p></div>
               </div>
               <div className="flex flex-wrap gap-2">
                 <button type="button" onClick={()=>setActiveSection('requests')} className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 px-3 py-2 text-[11px] font-bold text-emerald-800 dark:text-emerald-200">Track course requests</button>
                 <button type="button" onClick={()=>setActiveSection('inbox')} className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 px-3 py-2 text-[11px] font-bold text-emerald-800 dark:text-emerald-200">Open inbox</button>
               </div>
             </div>}
             {activeSection==='courses' && <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                 <h3 className="font-extrabold text-slate-900 dark:text-white">My courses</h3>
                 <button type="button" onClick={()=>onEnroll(profile,courses)} className="w-full sm:w-auto rounded-xl bg-emerald-900 text-amber-300 px-4 py-2.5 text-xs font-bold">{courses.length===0?'Choose courses & register face':'Request another course'}</button>
               </div>
               {courses.length===0?<p className="py-8 text-center text-xs text-slate-500">No approved courses are linked to this account yet.</p>:<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{courses.map((course:any,i:number)=><article key={course.course+i} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4"><div className="flex items-start justify-between gap-2"><strong className="text-sm text-slate-900 dark:text-white break-words">{course.course}</strong><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0"/></div><p className="text-[11px] text-slate-500 mt-2 break-words">{course.lecturer}</p><p className="text-[11px] mt-2 text-emerald-700 dark:text-emerald-300">{course.face_enrolled?'Face enrolment active':'Face enrolment pending'}</p></article>)}</div>}
               {courses.some((course:any)=>!course.face_enrolled) && <p className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">At least one existing course still needs face enrolment. Contact that course's lecturer to complete it. Requesting an additional course will not change the face-enrolment status of courses you already have. </p>}
             </section>}
             {activeSection==='attempts' && <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
               <h3 className="font-extrabold text-slate-900 dark:text-white mb-1">Course attempts and carryovers</h3>
               <p className="text-[10px] text-slate-500 mb-3">A failed course can be retaken in a later term without repeating your entire level.</p>
               {(dashboard?.course_attempts||[]).length===0?<p className="py-4 text-xs text-slate-500">No course attempts have been recorded in the academic record yet.</p>:<div className="space-y-2">{dashboard.course_attempts.map((attempt:any)=><article key={attempt.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold text-slate-900 dark:text-white">{attempt.course_code} · {attempt.course_title}</p><p className="text-[10px] text-slate-500 mt-1">{attempt.academic_period} · {attempt.term} · Attempt {attempt.attempt_number}</p>{attempt.grade&&<p className="text-[10px] text-slate-500 mt-1">Grade: {attempt.grade}</p>}</div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${attempt.status==='failed'?'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200':attempt.status==='passed'?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{attempt.status==='failed'?'Carryover':attempt.status.replace('_',' ')}</span></article>)}</div>}
             </section>}
             {activeSection==='results' && <React.Suspense fallback={<div role="status" className="py-10 text-center text-xs text-slate-500">Loading your results…</div>}><StudentResults /></React.Suspense>}
             {activeSection==='attendance' && <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
               <div className="mb-3"><h3 className="font-extrabold text-slate-900 dark:text-white">Attendance history</h3><p className="mt-1 text-[11px] text-slate-500">Your most recent attendance records. Filter by course or date.</p></div>
               {attendance.length>0 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3"><label className="block text-[10px] font-bold text-slate-500">Course<select aria-label="Filter attendance by course" value={attendanceCourseFilter} onChange={e=>setAttendanceCourseFilter(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs"><option value="">All courses</option>{attendanceCourses.map(course=><option key={course} value={course}>{course}</option>)}</select></label><label className="block text-[10px] font-bold text-slate-500">Date<input aria-label="Filter attendance by date" type="date" value={attendanceDateFilter} onChange={e=>setAttendanceDateFilter(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs"/></label></div>}
               {attendance.length===0?<p className="py-8 text-center text-xs text-slate-500">No attendance records yet.</p>:filteredAttendance.length===0?<p className="py-8 text-center text-xs text-slate-500">No attendance records match these filters. <button type="button" onClick={()=>{setAttendanceCourseFilter('');setAttendanceDateFilter('');}} className="font-bold text-emerald-700 underline">Clear filters</button></p>:<div className="grid grid-cols-1 lg:grid-cols-2 gap-2">{filteredAttendance.map((row:any)=><article key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 min-w-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold text-slate-900 dark:text-white break-words">{row.course}</p><p className="text-[10px] text-slate-500 mt-1">{new Date(row.created_at).toLocaleString()}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold ${String(row.status).toLowerCase()==='verified'?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>{row.status}</span></div><p className="mt-2 text-[10px] font-mono text-slate-500 break-all">{row.receipt_no || 'Receipt reference unavailable'}</p></article>)}</div>}
             </section>}
             {activeSection==='inbox' && <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
               <div className="flex items-center justify-between gap-2 mb-3"><div><h3 className="font-extrabold text-slate-900 dark:text-white">Inbox</h3><p className="text-[10px] text-slate-500 mt-1">{unreadCount} unread · {notifications.length} messages</p></div><div className="flex items-center gap-2"><button type="button" onClick={markAllRead} disabled={!unreadCount || inboxBusy} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40">Mark all read</button><button type="button" onClick={refreshInbox} disabled={inboxBusy} aria-label="Refresh inbox" title="Refresh inbox" className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${inboxBusy?'animate-spin':''}`}/></button></div></div>
               {notifications.length===0?<p className="py-6 text-xs text-slate-500">No messages yet.</p>:<div className="space-y-2">{notifications.map((item:any)=><article key={item.id} className={`rounded-xl border p-3 ${item.read_at?'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50':'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30'}`}>
                 <button type="button" aria-expanded={expandedNotification===item.id} onClick={()=>{setExpandedNotification(current=>current===item.id?null:item.id);if(!item.read_at)markRead(item.id);}} className="w-full min-w-0 text-left"><span className="flex items-start justify-between gap-2"><strong className="text-xs text-slate-900 dark:text-white break-words">{item.title}</strong><span className="text-[10px] text-slate-500 shrink-0">{new Date(item.created_at).toLocaleDateString()}</span></span><span className="block text-[10px] text-slate-500 mt-1">{item.read_at?'Read':'New'}</span></button>
                 {expandedNotification===item.id&&<p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 mt-3 whitespace-pre-wrap break-words">{item.message}</p>}
               </article>)}</div>}
             </section>}
             {activeSection==='requests' && <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
               <div className="mb-3"><h3 className="font-extrabold text-slate-900 dark:text-white">Course enrolment requests</h3><p className="mt-1 text-[11px] text-slate-500">Track the requests you have sent to lecturers.</p></div>
               {enrollmentRequests.length===0 ? <p className="py-8 text-center text-xs text-slate-500">No course requests have been submitted from this account yet. When you request a course, its review status will appear here.</p> : <div className="space-y-2">{enrollmentRequests.map((request:any)=><article key={request.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4">
                 <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-bold text-slate-900 dark:text-white break-words">{request.course}</p><p className="mt-1 text-[11px] text-slate-500">Lecturer: {request.lecturer_name}</p><p className="mt-1 text-[10px] text-slate-500">Submitted {new Date(request.created_at).toLocaleString()}</p></div>
                   <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${request.status==='approved'?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':request.status==='rejected'?'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200':request.needs_identity_review?'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200':'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{request.status==='approved'?'Approved':request.status==='rejected'?'Not approved':request.needs_identity_review?'Identity review needed':'Awaiting lecturer review'}</span>
                 </div>
                 {request.needs_identity_review && request.status==='pending' && <p className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2.5 text-[10px] leading-relaxed text-amber-800 dark:text-amber-200">A lecturer has flagged this request for an additional identity check. This does not mean your request has been rejected. Please wait for the lecturer to complete the review.</p>}
                 {request.reviewed_at && <p className="mt-2 text-[10px] text-slate-500">Reviewed {new Date(request.reviewed_at).toLocaleString()}</p>}
               </article>)}</div>}
             </section>}
             {activeSection==='profile' && <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
               <h3 className="font-extrabold text-slate-900 dark:text-white mb-3">Student details</h3>
               <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                 <div><dt className="text-[10px] text-slate-500">Full name</dt><dd className="font-semibold mt-1 break-words">{profile.full_name}</dd></div>
                 <div><dt className="text-[10px] text-slate-500">Student ID</dt><dd className="font-semibold mt-1 break-all">{profile.student_id}</dd></div>
                 <div><dt className="text-[10px] text-slate-500">Department</dt><dd className="font-semibold mt-1 break-words">{profile.department}</dd></div>
                 <div><dt className="text-[10px] text-slate-500">Current level</dt><dd className="font-semibold mt-1">{profile.current_level || profile.level + " Level"}</dd></div>
                 <div><dt className="text-[10px] text-slate-500">Admission set</dt><dd className="font-semibold mt-1">{profile.admission_set || "Not assigned"}</dd></div>
                 <div><dt className="text-[10px] text-slate-500">Academic status</dt><dd className="font-semibold mt-1 capitalize">{(profile.academic_status || "active").replace("_"," ")}</dd></div>
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
               </div>
             </div>
             </div>
           </>}
 
        </div>
      )}
    </div>
  );
}
