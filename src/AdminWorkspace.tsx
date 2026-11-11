import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, BarChart3, BadgeCheck, Bell, BookOpen, CheckCheck,
  ClipboardList, History, LogOut, QrCode, RefreshCw, Search, ShieldAlert,
  ShieldCheck, TrendingUp, UserCog, Users, Building2, Plus, Pencil, BookMarked
} from 'lucide-react';
import * as db from './db';
import { confirmAction, showToast } from './feedback';

export function NotificationBell({ notifications = [], onRead, onReadAll }: any) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 16 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const unread = notifications.filter((item: any) => !item.read_at).length;

  useEffect(() => {
    if (!open) return;
    const placePanel = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ top: Math.max(8, Math.min(rect.bottom + 10, window.innerHeight - Math.min(640, window.innerHeight - 16))), right: Math.max(16, window.innerWidth - rect.right) });
    };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    placePanel();
    window.addEventListener('resize', placePanel);
    window.addEventListener('scroll', placePanel, true);
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      window.removeEventListener('resize', placePanel);
      window.removeEventListener('scroll', placePanel, true);
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  return <>
    <button ref={buttonRef} type="button" onClick={() => setOpen(value => !value)}
      className="relative p-2.5 rounded-xl border border-emerald-700 bg-emerald-950/70 text-emerald-100 hover:text-amber-300"
      aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} aria-haspopup="dialog">
      <Bell className="w-4 h-4" />
      {unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black grid place-items-center">{unread > 9 ? '9+' : unread}</span>}
    </button>
    {open && typeof document !== 'undefined' && createPortal(
      <div ref={panelRef} role="dialog" aria-label="Notifications"
        style={{ position: 'fixed', top: position.top, right: position.right, width: 'min(22rem, calc(100vw - 2rem))', zIndex: 9990, maxHeight: 'calc(100dvh - 1rem)' }}
        className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden text-left">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <div><p className="text-sm font-extrabold text-slate-900 dark:text-white">Notifications</p><p className="text-[10px] text-slate-500">{unread} unread</p></div>
          <button type="button" onClick={onReadAll} disabled={!unread} className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 disabled:opacity-40 inline-flex items-center gap-1"><CheckCheck className="w-3.5 h-3.5" /> Mark all read</button>
        </div>
        <div className="max-h-[calc(80dvh-3.5rem)] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.length === 0 ? <p className="p-5 text-center text-xs text-slate-500">You're all caught up.</p> : notifications.map((item: any) => <button key={item.id} type="button" onClick={() => !item.read_at && onRead(item.id)} className={`w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800/70 ${!item.read_at ? 'bg-emerald-50/70 dark:bg-emerald-950/20' : ''}`}>
            <div className="flex items-start gap-2"><span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${item.read_at ? 'bg-slate-300' : 'bg-emerald-500'}`} /><span className="min-w-0"><strong className="block text-xs text-slate-800 dark:text-slate-100">{item.title}</strong><span className="block mt-0.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{item.message}</span><span className="block mt-1 text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString()}</span></span></div>
          </button>)}
        </div>
      </div>, document.body
    )}
  </>;
}

export default function AdminWorkspace({ activeStaff, onLogout }: any) {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState<any>(null);
  const [lecturers, setLecturers] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [enrolments, setEnrolments] = useState<any[]>([]);
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [catalogCourses, setCatalogCourses] = useState<any[]>([]);
  const [deptForm, setDeptForm] = useState({ id: '', code: '', name: '', active: true });
  const [courseForm, setCourseForm] = useState({ id: '', departmentId: '', code: '', title: '', level: '', active: true });
  const [catalogMessage, setCatalogMessage] = useState('');
  const [editingLecturer, setEditingLecturer] = useState<any>(null);
  const [lecturerCourseIds, setLecturerCourseIds] = useState<string[]>([]);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const [stats, staff, events, notices, depts, catalog, studentRows, attendanceRows, sessionRows] = await Promise.all([
        db.loadAdminOverview(), db.loadAdminLecturers(), db.loadAdminAudit(60), db.loadNotifications(20), db.loadCatalogDepartments(), db.loadCatalogCourses(null),
        db.loadAdminEnrolments(150), db.loadAdminAttendance(150), db.loadAdminSessions(75)
      ]);
      setOverview(stats);
      setLecturers(staff);
      setAudit(events);
      setEnrolments(studentRows);
      setRecentAttendance(attendanceRows);
      setRecentSessions(sessionRows);
      setNotifications(notices);
      setDepartments(depts);
      setCatalogCourses(catalog);
    } catch (e) {
      setError(db.friendly(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh(true);
    const timer = window.setInterval(() => refresh(false), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => { setMessage(''); setError(''); }, 5000);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  const changeVerification = async (lecturer: any) => {
    const next = !lecturer.is_verified;
    const prompt = next
      ? `Verify ${lecturer.name}? They will be able to create attendance sessions and manage their course roster.`
      : `Withdraw verification for ${lecturer.name}? Their lecturer tools will be blocked until verified again.`;
    if (!(await confirmAction(prompt))) return;
    setWorkingId(lecturer.lecturer_id);
    try {
      await db.setLecturerVerification(lecturer.lecturer_id, next);
      setMessage(`${lecturer.name} ${next ? 'verified' : 'unverified'} successfully.`); showToast(`${lecturer.name} ${next ? 'verified' : 'unverified'} successfully.`, 'success');
      await refresh(false);
    } catch (e) {
      setError(db.friendly(e));
    } finally {
      setWorkingId('');
    }
  };

  const saveDepartment = async (event: React.FormEvent) => {
    event.preventDefault(); setWorkingId('department'); setCatalogMessage('');
    try {
      await db.saveCatalogDepartment({ id: deptForm.id || null, code: deptForm.code, name: deptForm.name, active: deptForm.active });
      setDeptForm({ id: '', code: '', name: '', active: true }); setCatalogMessage('Department saved successfully.'); await refresh(false);
    } catch (e) { setError(db.friendly(e)); } finally { setWorkingId(''); }
  };
  const saveCourse = async (event: React.FormEvent) => {
    event.preventDefault(); setWorkingId('course'); setCatalogMessage('');
    try {
      await db.saveCatalogCourse({ id: courseForm.id || null, departmentId: courseForm.departmentId, code: courseForm.code, title: courseForm.title, level: courseForm.level, active: courseForm.active });
      setCourseForm({ id: '', departmentId: courseForm.departmentId, code: '', title: '', level: '', active: true }); setCatalogMessage('Course saved successfully.'); await refresh(false);
    } catch (e) { setError(db.friendly(e)); } finally { setWorkingId(''); }
  };

  const openLecturerCourses = async (lecturer: any) => {
    setLecturerCourseIds([]);
    setEditingLecturer(lecturer);
    setWorkingId(`courses:${lecturer.lecturer_id}`);
    try {
      const assigned = await db.loadLecturerCourseAssignments(lecturer.lecturer_id);
      setLecturerCourseIds(assigned.map((item: any) => item.course_id));
    } catch (e) {
      setEditingLecturer(null);
      setError(db.friendly(e));
    } finally { setWorkingId(''); }
  };

  const saveLecturerCourses = async () => {
    if (!editingLecturer) return;
    setSavingAssignments(true);
    try {
      const coursesForDepartment = catalogCourses.filter(c => String(c.department_name || '').trim().toLowerCase() === String(editingLecturer.dept || '').trim().toLowerCase());
      for (const course of coursesForDepartment) {
        const assigned = lecturerCourseIds.includes(course.id);
        await db.assignLecturerCourse(editingLecturer.lecturer_id, course.id, assigned, assigned && course.id === lecturerCourseIds[0]);
      }
      showToast(`Course assignments updated for ${editingLecturer.name}.`, 'success');
      setEditingLecturer(null);
      await refresh(false);
    } catch (e) { setError(db.friendly(e)); }
    finally { setSavingAssignments(false); }
  };

  const readOne = async (id: string) => {
    try { await db.markNotificationRead(id); await refresh(false); }
    catch (e) { setError(db.friendly(e)); }
  };
  const readAll = async () => {
    try { await db.markAllNotificationsRead(); await refresh(false); }
    catch (e) { setError(db.friendly(e)); }
  };

  const visibleLecturers = lecturers.filter((item) =>
    [item.name, item.email, item.dept, item.course].some((value) => String(value || '').toLowerCase().includes(search.toLowerCase()))
  );
  const courses = overview?.courses || [];
  const maxAttendance = Math.max(1, ...courses.map((course: any) => Number(course.attendance_30d || 0)));
  const statCards = [
    { label: 'Lecturers', value: overview?.lecturers_total ?? '—', detail: `${overview?.lecturers_verified ?? 0} verified`, icon: UserCog },
    { label: 'Awaiting verification', value: overview?.lecturers_pending ?? '—', detail: 'Requires administrator review', icon: ShieldAlert },
    { label: 'Student-course enrolments', value: overview?.student_course_enrolments ?? '—', detail: 'Roster entries across courses', icon: Users },
    { label: 'Attendance records', value: overview?.attendance_total ?? '—', detail: `${overview?.attendance_today ?? 0} recorded today`, icon: ClipboardList },
    { label: 'Sessions', value: overview?.sessions_total ?? '—', detail: `${overview?.sessions_active ?? 0} currently active`, icon: QrCode },
    { label: 'Courses', value: courses.length, detail: 'Distinct course names', icon: BookOpen },
  ];

  return (
    <div className="space-y-5 sm:space-y-7 animate-fade-up">
      <section className="rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 border border-emerald-800 p-5 sm:p-7 text-white shadow-xl overflow-hidden relative">
        <div className="absolute -right-10 -top-16 w-56 h-56 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0"><div className="w-12 h-12 rounded-2xl bg-amber-400/15 border border-amber-300/30 grid place-items-center text-amber-300"><ShieldCheck className="w-6 h-6" /></div><div className="min-w-0"><p className="text-[10px] uppercase tracking-[.2em] text-emerald-200 font-black">CampusSign · System administration</p><h1 className="text-xl sm:text-2xl font-black text-white mt-1">Welcome, {activeStaff.name}</h1><p className="text-xs text-emerald-100/75 mt-1">Manage lecturer access, monitor attendance and review system activity.</p></div></div>
          <div className="flex items-center gap-2 self-end sm:self-auto"><NotificationBell notifications={notifications} onRead={readOne} onReadAll={readAll} /><button onClick={() => refresh(true)} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15" aria-label="Refresh dashboard"><RefreshCw className="w-4 h-4" /></button><button onClick={onLogout} className="px-3 py-2.5 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-700 text-rose-100 text-xs font-bold inline-flex items-center gap-2"><LogOut className="w-4 h-4" />Sign out</button></div>
        </div>
      </section>

      {message && <div role="status" className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs font-semibold">{message}</div>}
      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-200 text-xs">{error}</div>}

      <div className="flex gap-2 overflow-x-auto p-1 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit max-w-full">
        {[['overview', 'Overview', BarChart3], ['academic', 'Departments & courses', BookMarked], ['lecturers', 'Lecturers', UserCog], ['enrolments', 'Student enrolments', Users], ['records', 'Attendance & sessions', ClipboardList], ['audit', 'Audit history', History]].map(([key, label, Icon]: any) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap inline-flex items-center gap-2 ${tab === key ? 'bg-emerald-900 text-amber-300 shadow' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}><Icon className="w-4 h-4" />{label}</button>)}
      </div>

      {loading ? <div className="py-16 text-center text-sm text-slate-500"><RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />Loading system overview…</div> : tab === 'overview' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{statCards.map((card) => {
            const destination = card.label === 'Courses' ? 'academic' : ['Lecturers', 'Awaiting verification'].includes(card.label) ? 'lecturers' : card.label === 'Student-course enrolments' ? 'enrolments' : ['Attendance records', 'Sessions'].includes(card.label) ? 'records' : 'audit';
            return <button key={card.label} type="button" onClick={() => setTab(destination)} aria-label={`Open ${destination === 'academic' ? 'academic catalogue' : destination === 'lecturers' ? 'lecturer accounts' : destination === 'enrolments' ? 'student enrolments' : destination === 'records' ? 'attendance and sessions' : 'audit history'} from ${card.label}`} className="interactive-card text-left rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-500">
              <div className="flex items-center justify-between gap-2"><span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400">{card.label}</span><span className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 grid place-items-center"><card.icon className="w-4 h-4" /></span></div>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tabular-nums">{card.value}</p><p className="text-[10px] text-slate-500 mt-1">{card.detail}</p><span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 mt-3">View details <span aria-hidden="true">→</span></span>
            </button>;
          })}</div>
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"><div className="flex items-center justify-between gap-2 mb-4"><div><h2 className="font-extrabold text-slate-900 dark:text-white">Course activity</h2><p className="text-[11px] text-slate-500 mt-1">Attendance records created in the last 30 days</p></div><TrendingUp className="w-5 h-5 text-emerald-600" /></div>
            {courses.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">No courses have been registered yet.</p> : <div className="space-y-4">{courses.map((course: any) => <button type="button" key={course.course} onClick={() => setTab('academic')} className="block w-full text-left space-y-1.5 rounded-xl p-2 -m-2 hover:bg-slate-50 dark:hover:bg-slate-800/60"><div className="flex items-center justify-between gap-3 text-xs"><strong className="text-slate-800 dark:text-slate-100 truncate">{course.course}</strong><span className="text-slate-500 shrink-0 tabular-nums">{course.attendance_30d} check-ins</span></div><div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-amber-400 transition-all duration-700" style={{ width: `${Math.max(2, Number(course.attendance_30d || 0) / maxAttendance * 100)}%` }} /></div><div className="flex flex-wrap gap-x-4 text-[10px] text-slate-500"><span>{course.lecturers} lecturers</span><span>{course.students} roster entries</span><span>{course.sessions} sessions</span></div></button>)}</div>}
          </section>
        </div>
      ) : tab === 'academic' ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between"><div><h2 className="font-extrabold text-slate-900 dark:text-white">Departments</h2><p className="text-[11px] text-slate-500 mt-1">Create and maintain the university's academic departments.</p></div><Building2 className="w-5 h-5 text-emerald-600" /></div>
            {catalogMessage && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{catalogMessage}</p>}
            <form onSubmit={saveDepartment} className="grid grid-cols-1 sm:grid-cols-[110px_1fr_auto] gap-2">
              <input required maxLength={12} value={deptForm.code} onChange={e=>setDeptForm({...deptForm,code:e.target.value.toUpperCase()})} placeholder="Code e.g. CSC" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs" />
              <input required value={deptForm.name} onChange={e=>setDeptForm({...deptForm,name:e.target.value})} placeholder="Department name" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs" />
              <label className="col-span-full flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300"><input type="checkbox" checked={deptForm.active} onChange={e=>setDeptForm({...deptForm,active:e.target.checked})}/> Department is active and available for selection</label><button disabled={workingId==='department'} className="px-4 py-2.5 rounded-xl bg-emerald-900 text-amber-300 text-xs font-bold disabled:opacity-50"><Plus className="w-4 h-4 inline mr-1"/>Save</button>
            </form>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">{departments.map(d=><div key={d.id} className="py-3 flex items-center justify-between gap-3"><div><strong className="block text-xs text-slate-800 dark:text-white">{d.name}</strong><span className="text-[10px] text-slate-500">{d.code}</span></div><button type="button" onClick={()=>setDeptForm({id:d.id,code:d.code,name:d.name,active:d.is_active})} className="text-xs text-emerald-700 dark:text-emerald-300 font-bold"><Pencil className="w-3.5 h-3.5 inline mr-1"/>Edit</button></div>)}</div>
          </section>
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between"><div><h2 className="font-extrabold text-slate-900 dark:text-white">Course catalogue</h2><p className="text-[11px] text-slate-500 mt-1">Register courses and assign them to departments.</p></div><BookOpen className="w-5 h-5 text-emerald-600" /></div>
            <form onSubmit={saveCourse} className="space-y-2">
              <select required value={courseForm.departmentId} onChange={e=>setCourseForm({...courseForm,departmentId:e.target.value})} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs"><option value="">Choose department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
              <div className="grid grid-cols-2 gap-2"><input required value={courseForm.code} onChange={e=>setCourseForm({...courseForm,code:e.target.value.toUpperCase()})} placeholder="Course code" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs"/><input value={courseForm.level} onChange={e=>setCourseForm({...courseForm,level:e.target.value})} placeholder="Level (optional)" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs"/></div>
              <input required value={courseForm.title} onChange={e=>setCourseForm({...courseForm,title:e.target.value})} placeholder="Course title" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs"/>
              <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300"><input type="checkbox" checked={courseForm.active} onChange={e=>setCourseForm({...courseForm,active:e.target.checked})}/> Course is active and available for selection</label><button disabled={workingId==='course'||!departments.length} className="w-full px-4 py-2.5 rounded-xl bg-emerald-900 text-amber-300 text-xs font-bold disabled:opacity-50"><Plus className="w-4 h-4 inline mr-1"/>Save course</button>
            </form>
            <div className="max-h-[430px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">{catalogCourses.map(c=><div key={c.id} className="py-3 flex items-center justify-between gap-3"><div className="min-w-0"><strong className="block text-xs text-slate-800 dark:text-white">{c.code} · {c.title}</strong><span className="text-[10px] text-slate-500">{c.department_name}{c.level ? ` · ${c.level} Level` : ''}</span></div><button type="button" onClick={()=>setCourseForm({id:c.id,departmentId:c.department_id,code:c.code,title:c.title,level:c.level||'',active:c.is_active})} className="text-xs text-emerald-700 dark:text-emerald-300 font-bold shrink-0"><Pencil className="w-3.5 h-3.5 inline mr-1"/>Edit</button></div>)}</div>
          </section>
        </div>
      ) : tab === 'lecturers' ? (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-900 dark:text-white">Lecturer accounts</h2><p className="text-[11px] text-slate-500 mt-1">Verify academic staff before they can use lecturer tools.</p></div><div className="relative w-full sm:max-w-xs"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or course" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs" /></div></div>
          <div className="overflow-x-auto"><table className="w-full text-left min-w-[680px]"><thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-3">Lecturer</th><th className="p-3">Department</th><th className="p-3">Course</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{visibleLecturers.map((lecturer) => <tr key={lecturer.lecturer_id}><td className="p-3"><strong className="block text-xs text-slate-800 dark:text-white">{lecturer.name}</strong><span className="text-[10px] text-slate-500">{lecturer.email}</span></td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{lecturer.dept}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{lecturer.course}</td><td className="p-3">{lecturer.is_verified ? <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"><BadgeCheck className="w-4 h-4" />Verified</span> : <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"><AlertCircle className="w-4 h-4" />Pending</span>}</td><td className="p-3 text-right"><div className="flex flex-col items-end gap-1.5"><button type="button" disabled={workingId === `courses:${lecturer.lecturer_id}`} onClick={() => openLecturerCourses(lecturer)} className="px-3 py-2 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-500">Manage courses</button><button type="button" disabled={workingId === lecturer.lecturer_id} onClick={() => changeVerification(lecturer)} className={`px-3 py-2 rounded-lg text-[10px] font-extrabold disabled:opacity-50 ${lecturer.is_verified ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900' : 'bg-emerald-900 text-amber-300 border border-emerald-700'}`}>{workingId === lecturer.lecturer_id ? 'Saving…' : lecturer.is_verified ? 'Withdraw access' : 'Verify lecturer'}</button></div></td></tr>)}</tbody></table>{visibleLecturers.length === 0 && <p className="py-8 text-center text-xs text-slate-500">No lecturer accounts match that search.</p>}</div>
        </section>
      ) : tab === 'enrolments' ? (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div><h2 className="font-extrabold text-slate-900 dark:text-white">Student-course enrolments</h2><p className="text-[11px] text-slate-500 mt-1">Recent roster entries across departments and courses. Biometric data is not displayed here.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-3">Student</th><th className="p-3">Department / Level</th><th className="p-3">Course</th><th className="p-3">Lecturer</th><th className="p-3">Face</th><th className="p-3">Date added</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{enrolments.map(row=><tr key={row.enrolment_id}><td className="p-3"><strong className="block text-xs text-slate-800 dark:text-white">{row.student_name}</strong><span className="text-[10px] text-slate-500">{row.student_id}</span></td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{row.department} · {row.level || '—'}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{row.course}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{row.lecturer_name}</td><td className="p-3 text-xs">{row.face_enrolled ? <span className="text-emerald-700 dark:text-emerald-300">Enrolled</span> : <span className="text-amber-700 dark:text-amber-300">Pending</span>}</td><td className="p-3 text-[10px] text-slate-500">{new Date(row.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>{enrolments.length===0&&<p className="py-8 text-center text-xs text-slate-500">No student-course enrolments found.</p>}</div>
        </section>
      ) : tab === 'records' ? (
        <div className="space-y-4">
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"><div><h2 className="font-extrabold text-slate-900 dark:text-white">Recent attendance</h2><p className="text-[11px] text-slate-500 mt-1">Latest attendance records, with no face images or raw location coordinates.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-3">Student</th><th className="p-3">Course</th><th className="p-3">Session</th><th className="p-3">Lecturer</th><th className="p-3">Status</th><th className="p-3">Time</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{recentAttendance.map(row=><tr key={row.attendance_id}><td className="p-3"><strong className="block text-xs text-slate-800 dark:text-white">{row.student_name}</strong><span className="text-[10px] text-slate-500">{row.student_id}</span></td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{row.course}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{row.session_title || row.session_id}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{row.lecturer_name || '—'}</td><td className="p-3 text-xs">{row.status}</td><td className="p-3 text-[10px] text-slate-500">{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table>{recentAttendance.length===0&&<p className="py-8 text-center text-xs text-slate-500">No attendance records found.</p>}</div></section>
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"><div><h2 className="font-extrabold text-slate-900 dark:text-white">Recent sessions</h2><p className="text-[11px] text-slate-500 mt-1">Session status and check-in totals.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-3">Session</th><th className="p-3">Course</th><th className="p-3">Lecturer</th><th className="p-3">Check-ins</th><th className="p-3">Status</th><th className="p-3">Created</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{recentSessions.map(row=><tr key={row.session_id}><td className="p-3 text-xs text-slate-800 dark:text-white">{row.title || row.session_id}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{row.course}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{row.lecturer_name || '—'}</td><td className="p-3 text-xs tabular-nums">{row.attendance_count}</td><td className="p-3 text-xs">{row.revoked ? 'Ended' : row.ends_at && new Date(row.ends_at) < new Date() ? 'Expired' : 'Active'}</td><td className="p-3 text-[10px] text-slate-500">{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table>{recentSessions.length===0&&<p className="py-8 text-center text-xs text-slate-500">No sessions found.</p>}</div></section>
        </div>
      ) : (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"><div className="mb-4"><h2 className="font-extrabold text-slate-900 dark:text-white">Audit history</h2><p className="text-[11px] text-slate-500 mt-1">Recent enrolment, verification and attendance changes. Biometric descriptors and photos are never included.</p></div>
          {audit.length === 0 ? <p className="py-10 text-center text-xs text-slate-500">No audit events recorded yet. New sensitive actions will appear here.</p> : <div className="space-y-2">{audit.map((event) => <article key={event.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1"><strong className="text-xs text-slate-800 dark:text-slate-100">{String(event.action).replace(/\./g, ' ')}</strong><time className="text-[10px] text-slate-500">{new Date(event.created_at).toLocaleString()}</time></div><p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{event.entity_type}{event.course ? ` · ${event.course}` : ''}{event.actor_email ? ` · by ${event.actor_email}` : ''}</p><pre className="mt-2 text-[10px] text-slate-500 whitespace-pre-wrap break-words">{JSON.stringify(event.details, null, 2)}</pre></article>)}</div>}
        </section>
      )}
      {editingLecturer && <div className="fixed inset-0 z-[90] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4" role="presentation">
        <section role="dialog" aria-modal="true" aria-label={`Manage courses for ${editingLecturer.name}`} className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4">
          <div><h2 className="font-extrabold text-slate-900 dark:text-white">Manage lecturer courses</h2><p className="text-xs text-slate-500 mt-1">{editingLecturer.name} · {editingLecturer.dept}. The first selected course becomes the default.</p></div>
          <div className="space-y-2">{catalogCourses.filter(c => String(c.department_name || '').trim().toLowerCase() === String(editingLecturer.dept || '').trim().toLowerCase()).map(course => <label key={course.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-400 cursor-pointer"><input type="checkbox" className="mt-0.5" checked={lecturerCourseIds.includes(course.id)} onChange={e => setLecturerCourseIds(current => e.target.checked ? [...current, course.id] : current.filter(id => id !== course.id))} /><span className="min-w-0"><strong className="block text-xs text-slate-800 dark:text-white">{course.code} · {course.title}</strong><span className="text-[10px] text-slate-500">{course.level ? `${course.level} Level` : 'All levels'}{course.is_active ? '' : ' · Inactive'}</span></span></label>)}
            {!catalogCourses.some(c => String(c.department_name || '').trim().toLowerCase() === String(editingLecturer.dept || '').trim().toLowerCase()) && <p className="text-xs text-amber-700 dark:text-amber-300">No catalogue courses are registered for this department yet.</p>}
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2"><button type="button" onClick={() => setEditingLecturer(null)} className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200">Cancel</button><button type="button" disabled={savingAssignments || !lecturerCourseIds.length} onClick={saveLecturerCourses} className="px-4 py-2.5 rounded-xl bg-emerald-900 text-amber-300 text-xs font-bold disabled:opacity-50">{savingAssignments ? 'Saving…' : 'Save assignments'}</button></div>
        </section>
      </div>}
      <p className="text-[10px] text-slate-400 text-center">Administrator actions are enforced by Supabase policies and server-side functions, not by this interface alone.</p>
    </div>
  );
}
