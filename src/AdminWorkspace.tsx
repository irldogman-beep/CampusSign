import React, { useEffect, useState } from 'react';
import {
  AlertCircle, BarChart3, BadgeCheck, Bell, BookOpen, CheckCheck,
  ClipboardList, History, LogOut, QrCode, RefreshCw, Search, ShieldAlert,
  ShieldCheck, TrendingUp, UserCog, Users, Building2, Plus, Pencil, BookMarked
} from 'lucide-react';
import * as db from './db';

export function NotificationBell({ notifications = [], onRead, onReadAll }: any) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((item: any) => !item.read_at).length;
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => setOpen((value) => !value)}
        className="relative p-2.5 rounded-xl border border-emerald-700 bg-emerald-950/70 text-emerald-100 hover:text-amber-300"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>
        <Bell className="w-4 h-4" />
        {unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black grid place-items-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && <div className="absolute right-0 top-full mt-2 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden text-left">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <div><p className="text-sm font-extrabold text-slate-900 dark:text-white">Notifications</p><p className="text-[10px] text-slate-500">{unread} unread</p></div>
          <button type="button" onClick={onReadAll} disabled={!unread} className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 disabled:opacity-40 inline-flex items-center gap-1"><CheckCheck className="w-3.5 h-3.5" /> Mark all read</button>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.length === 0 ? <p className="p-5 text-center text-xs text-slate-500">You're all caught up.</p> : notifications.map((item: any) => <button key={item.id} type="button" onClick={() => !item.read_at && onRead(item.id)} className={`w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800/70 ${!item.read_at ? 'bg-emerald-50/70 dark:bg-emerald-950/20' : ''}`}>
            <div className="flex items-start gap-2"><span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${item.read_at ? 'bg-slate-300' : 'bg-emerald-500'}`} /><span className="min-w-0"><strong className="block text-xs text-slate-800 dark:text-slate-100">{item.title}</strong><span className="block mt-0.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{item.message}</span><span className="block mt-1 text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString()}</span></span></div>
          </button>)}
        </div>
      </div>}
    </div>
  );
}

export default function AdminWorkspace({ activeStaff, onLogout }: any) {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState<any>(null);
  const [lecturers, setLecturers] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [catalogCourses, setCatalogCourses] = useState<any[]>([]);
  const [deptForm, setDeptForm] = useState({ id: '', code: '', name: '', active: true });
  const [courseForm, setCourseForm] = useState({ id: '', departmentId: '', code: '', title: '', level: '', active: true });
  const [catalogMessage, setCatalogMessage] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const [stats, staff, events, notices, depts, catalog] = await Promise.all([
        db.loadAdminOverview(), db.loadAdminLecturers(), db.loadAdminAudit(60), db.loadNotifications(20), db.loadCatalogDepartments(), db.loadCatalogCourses(null)
      ]);
      setOverview(stats);
      setLecturers(staff);
      setAudit(events);
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
    if (!window.confirm(prompt)) return;
    setWorkingId(lecturer.lecturer_id);
    try {
      await db.setLecturerVerification(lecturer.lecturer_id, next);
      setMessage(`${lecturer.name} ${next ? 'verified' : 'unverified'} successfully.`);
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
        {[['overview', 'Overview', BarChart3], ['academic', 'Departments & courses', BookMarked], ['lecturers', 'Lecturers', UserCog], ['audit', 'Audit history', History]].map(([key, label, Icon]: any) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap inline-flex items-center gap-2 ${tab === key ? 'bg-emerald-900 text-amber-300 shadow' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}><Icon className="w-4 h-4" />{label}</button>)}
      </div>

      {loading ? <div className="py-16 text-center text-sm text-slate-500"><RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />Loading system overview…</div> : tab === 'overview' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{statCards.map((card) => <article key={card.label} className="interactive-card rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"><div className="flex items-center justify-between gap-2"><span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400">{card.label}</span><span className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 grid place-items-center"><card.icon className="w-4 h-4" /></span></div><p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tabular-nums">{card.value}</p><p className="text-[10px] text-slate-500 mt-1">{card.detail}</p></article>)}</div>
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"><div className="flex items-center justify-between gap-2 mb-4"><div><h2 className="font-extrabold text-slate-900 dark:text-white">Course activity</h2><p className="text-[11px] text-slate-500 mt-1">Attendance records created in the last 30 days</p></div><TrendingUp className="w-5 h-5 text-emerald-600" /></div>
            {courses.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">No courses have been registered yet.</p> : <div className="space-y-4">{courses.map((course: any) => <div key={course.course} className="space-y-1.5"><div className="flex items-center justify-between gap-3 text-xs"><strong className="text-slate-800 dark:text-slate-100 truncate">{course.course}</strong><span className="text-slate-500 shrink-0 tabular-nums">{course.attendance_30d} check-ins</span></div><div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-amber-400 transition-all duration-700" style={{ width: `${Math.max(2, Number(course.attendance_30d || 0) / maxAttendance * 100)}%` }} /></div><div className="flex flex-wrap gap-x-4 text-[10px] text-slate-500"><span>{course.lecturers} lecturers</span><span>{course.students} roster entries</span><span>{course.sessions} sessions</span></div></div>)}</div>}
          </section>
        </div>
      ) : tab === 'academic' ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-slate-900 dark:text-white">Departments</h2>
                <p className="text-[11px] text-slate-500 mt-1">Create and maintain the university's academic departments.</p>
              </div>
              <Building2 className="w-5 h-5 text-emerald-600" />
            </div>
            {catalogMessage && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">{catalogMessage}</p>}
            <form onSubmit={saveDepartment} className="space-y-3">
              {deptForm.id && (
                <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300">
                  <span>Editing department: <strong>{deptForm.name || deptForm.code}</strong></span>
                  <button type="button" onClick={() => setDeptForm({ id: '', code: '', name: '', active: true })} className="font-bold underline ml-2">Cancel edit</button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-2">
                <input required maxLength={12} value={deptForm.code} onChange={e=>setDeptForm({...deptForm,code:e.target.value.toUpperCase()})} placeholder="Code e.g. CSC" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-mono font-bold" />
                <input required value={deptForm.name} onChange={e=>setDeptForm({...deptForm,name:e.target.value})} placeholder="Department name" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-medium" />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={deptForm.active} onChange={e=>setDeptForm({...deptForm,active:e.target.checked})}/>
                  Department is active and available for selection
                </label>
                <button disabled={workingId==='department'} className="px-4 py-2.5 rounded-xl bg-emerald-900 text-amber-300 text-xs font-bold disabled:opacity-50">
                  {deptForm.id ? <><Pencil className="w-3.5 h-3.5 inline mr-1"/>Update department</> : <><Plus className="w-4 h-4 inline mr-1"/>Save department</>}
                </button>
              </div>
            </form>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {departments.length === 0 ? <p className="py-4 text-center text-xs text-slate-500">No departments added yet.</p> : departments.map(d=>(
                <div key={d.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="block text-xs text-slate-800 dark:text-white truncate">{d.name}</strong>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${d.is_active ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                        {d.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{d.code}</span>
                  </div>
                  <button type="button" onClick={()=>setDeptForm({id:d.id,code:d.code,name:d.name,active:d.is_active})} className="text-xs text-emerald-700 dark:text-emerald-300 font-bold shrink-0">
                    <Pencil className="w-3.5 h-3.5 inline mr-1"/>Edit
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-slate-900 dark:text-white">Course catalogue</h2>
                <p className="text-[11px] text-slate-500 mt-1">Register courses and assign them to departments.</p>
              </div>
              <BookOpen className="w-5 h-5 text-emerald-600" />
            </div>
            <form onSubmit={saveCourse} className="space-y-2">
              {courseForm.id && (
                <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300">
                  <span>Editing course: <strong>{courseForm.code}</strong></span>
                  <button type="button" onClick={() => setCourseForm({ id: '', departmentId: courseForm.departmentId, code: '', title: '', level: '', active: true })} className="font-bold underline ml-2">Cancel edit</button>
                </div>
              )}
              <select required value={courseForm.departmentId} onChange={e=>setCourseForm({...courseForm,departmentId:e.target.value})} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-semibold">
                <option value="">Choose department</option>
                {departments.map(d=><option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input required value={courseForm.code} onChange={e=>setCourseForm({...courseForm,code:e.target.value.toUpperCase()})} placeholder="Course code e.g. CSC301" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-mono font-bold"/>
                <input value={courseForm.level} onChange={e=>setCourseForm({...courseForm,level:e.target.value})} placeholder="Level (e.g. 300)" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs"/>
              </div>
              <input required value={courseForm.title} onChange={e=>setCourseForm({...courseForm,title:e.target.value})} placeholder="Course title e.g. Data Structures and Algorithms" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-medium"/>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={courseForm.active} onChange={e=>setCourseForm({...courseForm,active:e.target.checked})}/>
                  Course is active and available for selection
                </label>
                <button disabled={workingId==='course'||!departments.length} className="px-4 py-2.5 rounded-xl bg-emerald-900 text-amber-300 text-xs font-bold disabled:opacity-50">
                  {courseForm.id ? <><Pencil className="w-3.5 h-3.5 inline mr-1"/>Update course</> : <><Plus className="w-4 h-4 inline mr-1"/>Save course</>}
                </button>
              </div>
            </form>
            <div className="max-h-[430px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {catalogCourses.length === 0 ? <p className="py-4 text-center text-xs text-slate-500">No courses registered in the catalogue yet.</p> : catalogCourses.map(c=>(
                <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="block text-xs text-slate-800 dark:text-white truncate">{c.code} · {c.title}</strong>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${c.is_active ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">{c.department_name}{c.level ? ` · ${c.level} Level` : ''}</span>
                  </div>
                  <button type="button" onClick={()=>setCourseForm({id:c.id,departmentId:c.department_id,code:c.code,title:c.title,level:c.level||'',active:c.is_active})} className="text-xs text-emerald-700 dark:text-emerald-300 font-bold shrink-0">
                    <Pencil className="w-3.5 h-3.5 inline mr-1"/>Edit
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : tab === 'lecturers' ? (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-900 dark:text-white">Lecturer accounts</h2><p className="text-[11px] text-slate-500 mt-1">Verify academic staff before they can use lecturer tools.</p></div><div className="relative w-full sm:max-w-xs"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or course" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs" /></div></div>
          <div className="overflow-x-auto"><table className="w-full text-left min-w-[680px]"><thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-3">Lecturer</th><th className="p-3">Department</th><th className="p-3">Course</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{visibleLecturers.map((lecturer) => <tr key={lecturer.lecturer_id}><td className="p-3"><strong className="block text-xs text-slate-800 dark:text-white">{lecturer.name}</strong><span className="text-[10px] text-slate-500">{lecturer.email}</span></td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{lecturer.dept}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{lecturer.course}</td><td className="p-3">{lecturer.is_verified ? <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"><BadgeCheck className="w-4 h-4" />Verified</span> : <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"><AlertCircle className="w-4 h-4" />Pending</span>}</td><td className="p-3 text-right"><button disabled={workingId === lecturer.lecturer_id} onClick={() => changeVerification(lecturer)} className={`px-3 py-2 rounded-lg text-[10px] font-extrabold disabled:opacity-50 ${lecturer.is_verified ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900' : 'bg-emerald-900 text-amber-300 border border-emerald-700'}`}>{workingId === lecturer.lecturer_id ? 'Saving…' : lecturer.is_verified ? 'Withdraw access' : 'Verify lecturer'}</button></td></tr>)}</tbody></table>{visibleLecturers.length === 0 && <p className="py-8 text-center text-xs text-slate-500">No lecturer accounts match that search.</p>}</div>
        </section>
      ) : (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"><div className="mb-4"><h2 className="font-extrabold text-slate-900 dark:text-white">Audit history</h2><p className="text-[11px] text-slate-500 mt-1">Recent enrolment, verification and attendance changes. Biometric descriptors and photos are never included.</p></div>
          {audit.length === 0 ? <p className="py-10 text-center text-xs text-slate-500">No audit events recorded yet. New sensitive actions will appear here.</p> : <div className="space-y-2">{audit.map((event) => <article key={event.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1"><strong className="text-xs text-slate-800 dark:text-slate-100">{String(event.action).replace(/\./g, ' ')}</strong><time className="text-[10px] text-slate-500">{new Date(event.created_at).toLocaleString()}</time></div><p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{event.entity_type}{event.course ? ` · ${event.course}` : ''}{event.actor_email ? ` · by ${event.actor_email}` : ''}</p><pre className="mt-2 text-[10px] text-slate-500 whitespace-pre-wrap break-words">{JSON.stringify(event.details, null, 2)}</pre></article>)}</div>}
        </section>
      )}
      <p className="text-[10px] text-slate-400 text-center">Administrator actions are enforced by Supabase policies and server-side functions, not by this interface alone.</p>
    </div>
  );
}
