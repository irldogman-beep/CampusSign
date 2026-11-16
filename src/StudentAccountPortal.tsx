import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Bell, BookOpen, CalendarDays, CheckCircle2, Clock3,
  GraduationCap, LogOut, RefreshCw, ShieldCheck, UserRound
} from 'lucide-react';
import { supabase } from './supabase';
import * as db from './db';

type Props = {
  onClose: () => void;
  onEnroll: (profile: any) => void;
};

export default function StudentAccountPortal({ onClose, onEnroll }: Props) {
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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [data, inbox] = await Promise.all([
        db.loadStudentDashboard(),
        db.loadNotifications(30),
      ]);
      setDashboard(data);
      setNotifications(inbox.filter((item: any) =>
        item.notification_type === 'announcement' || item.recipient_role === 'student'
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

  const markRead = async (id: string) => {
    try { await db.markNotificationRead(id); await refresh(); }
    catch (e) { setError(db.friendly(e)); }
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
    <div className="max-w-5xl mx-auto space-y-5 page-enter">
      <section className="rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 text-white p-5 sm:p-7 border border-emerald-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/15 border border-amber-300/30 grid place-items-center text-amber-300"><GraduationCap className="w-6 h-6"/></div>
            <div><p className="text-[10px] uppercase tracking-[.2em] text-emerald-200 font-black">CampusSign · Student services</p><h1 className="text-xl sm:text-2xl font-black mt-1">Student services</h1><p className="text-xs text-emerald-100/75 mt-1">Create your student account, finish registration or view your attendance.</p></div>
          </div>
          <div className="flex gap-2">
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
            <button type="button" onClick={()=>{setMode('login');setError('');}} className={`flex-1 rounded-lg py-2.5 text-xs font-bold ${mode==='login'?'bg-emerald-900 text-amber-300':'text-slate-500'}`}>Sign in</button>
            <button type="button" onClick={()=>{setMode('signup');setError('');}} className={`flex-1 rounded-lg py-2.5 text-xs font-bold ${mode==='signup'?'bg-emerald-900 text-amber-300':'text-slate-500'}`}>Create account</button>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div><h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{mode==='signup'?'Get started with CampusSign':'Welcome back'}</h2><p className="text-xs text-slate-500 mt-1">{mode==='signup'?'Create one account using your official student details. You will then complete your academic registration and face enrolment here.':'Sign in to continue registration or view your student dashboard.'}</p></div>
            {mode==='signup' && <>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student ID</span><input required maxLength={40} value={studentId} onChange={e=>setStudentId(e.target.value.toUpperCase())} placeholder="Your matriculation number" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Full registered name</span><input required maxLength={120} value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="As it appears on your student record" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Department</span><select required value={department} onChange={e=>setDepartment(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"><option value="">Choose department</option>{departments.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}</select></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Academic level</span><select value={level} onChange={e=>setLevel(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm">{['100','200','300','400','500','600'].map(v=><option key={v} value={v}>{v} Level</option>)}</select></label>
            </>}
            <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Email address</span><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
            <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Password</span><input required type="password" minLength={8} autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
            <button disabled={busy || !email.trim() || !password || (mode==='signup' && (!studentId.trim() || !fullName.trim() || !department))} className="w-full rounded-xl bg-emerald-900 text-amber-300 py-3.5 text-sm font-extrabold disabled:opacity-50">{busy?'Please wait…':mode==='signup'?'Create student account':'Sign in'}</button>
          </form>
          {mode==='signup' && <p className="mt-4 text-[10px] text-slate-500 leading-relaxed">Your account is your CampusSign login. After creating it, continue to academic registration to select courses and enrol your face. Lecturers review course requests, then an administrator verifies your account. If you are already on the academic roster, you may ask the administrator to verify your existing record without submitting duplicate course requests.</p>}
        </section>
      ) : (
        <div className="space-y-4">
          <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0"><div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 grid place-items-center"><UserRound className="w-5 h-5"/></div><div className="min-w-0"><h2 className="font-extrabold text-slate-900 dark:text-white">{profile.full_name}</h2><p className="text-xs text-slate-500">{profile.student_id} · {profile.department} · {profile.level} Level</p></div></div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-extrabold ${profile.status==='approved'?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':profile.status==='rejected'?'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200':'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>{profile.status==='approved'?<ShieldCheck className="w-3.5 h-3.5"/>:<Clock3 className="w-3.5 h-3.5"/>}{profile.status==='approved'?'Verified student account':profile.status==='rejected'?'Verification declined':'Awaiting administrator verification'}</span>
            </div>
            {profile.status==='pending' && <div className="mt-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-4"><p className="text-xs text-amber-900 dark:text-amber-200 font-semibold">Your student account is created, but it is not yet verified. If you are a new student or still need to register courses, continue below. If your courses are already on the academic roster, you do not need to submit them again — ask your administrator to verify your existing record.</p><div className="mt-3 flex flex-col sm:flex-row gap-2"><button type="button" onClick={()=>onEnroll(profile)} className="rounded-xl bg-emerald-900 text-amber-300 px-4 py-2.5 text-xs font-bold">Continue academic registration</button><button type="button" onClick={()=>setNotice('Your administrator can verify your account against your existing academic roster. No duplicate course request has been submitted.')} className="rounded-xl border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 px-4 py-2.5 text-xs font-bold">My courses are already registered</button></div></div>}
            {profile.status==='rejected' && <p className="mt-4 text-xs text-rose-700 dark:text-rose-300">Your details could not be matched to the academic roster. Contact your department administrator to resolve this.</p>}
          </section>

          {profile.status==='approved' && <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4"><BookOpen className="w-4 h-4 text-emerald-600"/><p className="text-2xl font-black mt-2 text-slate-900 dark:text-white">{courses.length}</p><p className="text-[10px] text-slate-500">Approved courses</p></div>
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4"><CalendarDays className="w-4 h-4 text-emerald-600"/><p className="text-2xl font-black mt-2 text-slate-900 dark:text-white">{attendance.length}</p><p className="text-[10px] text-slate-500">Attendance records</p></div>
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 col-span-2 sm:col-span-1"><Bell className="w-4 h-4 text-emerald-600"/><p className="text-2xl font-black mt-2 text-slate-900 dark:text-white">{dashboard.unread_notifications||0}</p><p className="text-[10px] text-slate-500">Unread notifications</p></div>
            </div>
            <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm"><div className="flex items-center justify-between mb-3"><div><h3 className="font-extrabold text-slate-900 dark:text-white">My courses</h3><p className="text-[10px] text-slate-500 mt-1">Courses approved by your lecturers.</p></div><button type="button" onClick={()=>onEnroll(profile)} className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Request another course +</button></div>{courses.length===0?<p className="py-7 text-center text-xs text-slate-500">No approved courses are linked to this account yet.</p>:<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{courses.map((course:any,i:number)=><div key={course.course+i} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-900 dark:text-white">{course.course}</strong><CheckCircle2 className="w-4 h-4 text-emerald-600"/></div><p className="text-[10px] text-slate-500 mt-2">{course.lecturer}</p><p className="text-[10px] mt-2 text-emerald-700 dark:text-emerald-300">{course.face_enrolled?'Face enrolment active':'Face enrolment pending'}</p></div>)}</div>}</section>
            <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm"><h3 className="font-extrabold text-slate-900 dark:text-white mb-3">Attendance history</h3>{attendance.length===0?<p className="py-7 text-center text-xs text-slate-500">Your approved course attendance will appear here after your first check-in.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left"><thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="py-2 pr-3">Course</th><th className="py-2 pr-3">Date & time</th><th className="py-2 pr-3">Status</th><th className="py-2">Receipt</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{attendance.map((row:any)=><tr key={row.id}><td className="py-3 pr-3 text-xs font-semibold text-slate-800 dark:text-white">{row.course}</td><td className="py-3 pr-3 text-[10px] text-slate-500">{new Date(row.created_at).toLocaleString()}</td><td className="py-3 pr-3 text-xs">{row.status}</td><td className="py-3 text-[10px] font-mono text-slate-500">{row.receipt_no}</td></tr>)}</tbody></table></div>}</section>
            <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm"><h3 className="font-extrabold text-slate-900 dark:text-white mb-3">Announcements & notifications</h3>{notifications.length===0?<p className="py-5 text-xs text-slate-500">No announcements yet.</p>:<div className="space-y-2">{notifications.map((item:any)=><div key={item.id} className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-xs text-slate-900 dark:text-white">{item.title}</strong><span className="text-[9px] text-slate-500">{new Date(item.created_at).toLocaleDateString()}</span></div><p className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap">{item.message}</p><div className="mt-2 flex justify-end">{item.read_at?<span className="text-[9px] text-emerald-700 dark:text-emerald-300 font-semibold">Read</span>:<button type="button" onClick={()=>markRead(item.id)} className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold">Mark as read</button>}</div></div>)}</div>}</section>
          </>}
          <div className="flex justify-end"><button type="button" onClick={refresh} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5"/>Refresh account</button></div>
        </div>
      )}
    </div>
  );
}
