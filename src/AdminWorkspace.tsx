import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, BarChart3, BadgeCheck, Bell, BookOpen, CheckCheck, Check, X,
  ClipboardList, History, LogOut, QrCode, RefreshCw, Search, ShieldAlert,
  ShieldCheck, UserCog, Users, Building2, Plus, Pencil, BookMarked, Trash2, Activity, UserRound
} from 'lucide-react';
import * as db from './db';

export function NotificationBell({ notifications = [], onRead, onReadAll, onUnread, onDelete, onOpen }: any) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [panelPosition, setPanelPosition] = useState<{ top: number; right: number; maxHeight: number } | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((item: any) => !item.read_at).length;

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = bellRef.current?.getBoundingClientRect();
      if (!rect) return;
      const top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 160));
      const isNarrow = window.innerWidth < 520;
      setPanelPosition({
        top,
        right: isNarrow ? 8 : Math.max(16, window.innerWidth - rect.right),
        maxHeight: Math.max(180, window.innerHeight - top - 16),
      });
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (bellRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setSelected(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); setSelected(null); }
    };
    updatePosition();
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  const openNotification = (item: any) => {
    if (!item.read_at) onRead?.(item.id);
    const handled = onOpen?.(item) === true;
    if (handled) {
      setSelected(null);
      setOpen(false);
    } else {
      setSelected(item);
    }
  };

  const toggleRead = (item: any) => {
    if (item.read_at) onUnread?.(item.id);
    else onRead?.(item.id);
    if (selected?.id === item.id) setSelected({ ...item, read_at: item.read_at ? null : new Date().toISOString() });
  };

  const dismiss = (item: any) => {
    if (!window.confirm('Dismiss this notification?')) return;
    onDelete?.(item.id);
    if (selected?.id === item.id) setSelected(null);
  };

  return (
    <div ref={bellRef} className="relative shrink-0">
      <button type="button" onClick={() => { setOpen(value => !value); setSelected(null); }}
        className="relative p-2.5 rounded-xl border border-emerald-700 bg-emerald-950/70 text-emerald-100 hover:text-amber-300"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} aria-haspopup="dialog">
        <Bell className="w-4 h-4" />
        {unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black grid place-items-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && panelPosition && createPortal(
        <section ref={panelRef} role="dialog" aria-label="Notifications"
          style={{ position: 'fixed', top: panelPosition.top, right: panelPosition.right, maxHeight: panelPosition.maxHeight }}
          className="z-[10000] w-[min(24rem,calc(100vw-1rem))] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden text-left flex flex-col">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <div className="min-w-0">
              {selected ? <button type="button" onClick={() => setSelected(null)} className="text-xs font-bold text-emerald-700 dark:text-emerald-300">← All notifications</button> : <><p className="text-sm font-extrabold text-slate-900 dark:text-white">Notifications</p><p className="text-[10px] text-slate-500">{unread} unread · {notifications.length} total</p></>}
            </div>
            {!selected && <button type="button" onClick={onReadAll} disabled={!unread} className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 disabled:opacity-40 inline-flex items-center gap-1"><CheckCheck className="w-3.5 h-3.5" /> Mark all read</button>}
          </div>
          {selected ? (
            <div className="p-4 overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="text-sm font-extrabold text-slate-900 dark:text-white">{selected.title}</p><p className="text-[10px] text-slate-500 mt-1">{new Date(selected.created_at).toLocaleString()}</p></div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${selected.read_at ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'}`}>{selected.read_at ? 'Read' : 'Unread'}</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200 mt-3 whitespace-pre-wrap">{selected.message}</p>
              <div className="flex flex-wrap gap-2 mt-5">
                <button type="button" onClick={() => toggleRead(selected)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-[11px] font-bold text-slate-700 dark:text-slate-200">{selected.read_at ? 'Mark as unread' : 'Mark as read'}</button>
                <button type="button" onClick={() => dismiss(selected)} className="rounded-lg border border-rose-200 dark:border-rose-900 px-3 py-2 text-[11px] font-bold text-rose-700 dark:text-rose-300">Dismiss</button>
              </div>
            </div>
          ) : (
            <div className="min-h-0 overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-slate-800">
              {notifications.length === 0 ? <p className="p-5 text-center text-xs text-slate-500">You're all caught up.</p> : notifications.map((item: any) => (
                <div key={item.id} className={`p-3 flex items-start gap-2 ${!item.read_at ? 'bg-emerald-50/70 dark:bg-emerald-950/20' : ''}`}>
                  <button type="button" onClick={() => openNotification(item)} className="flex-1 min-w-0 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                    <div className="flex items-start gap-2"><span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${item.read_at ? 'bg-slate-300' : 'bg-emerald-500'}`} /><span className="min-w-0"><strong className="block text-xs text-slate-800 dark:text-slate-100">{item.title}</strong><span className="block mt-0.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-2">{item.message}</span><span className="block mt-1 text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString()}</span></span></div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" title={item.read_at ? 'Mark as unread' : 'Mark as read'} aria-label={item.read_at ? 'Mark as unread' : 'Mark as read'} onClick={() => toggleRead(item)} className="p-2 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-slate-100 dark:hover:bg-slate-800"><Check className="w-3.5 h-3.5" /></button>
                    <button type="button" title="Dismiss notification" aria-label="Dismiss notification" onClick={() => dismiss(item)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>,
        document.body
      )}
    </div>
  );
}

export default function AdminWorkspace({ activeStaff, onLogout }: any) {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState<any>(null);
  const [lecturers, setLecturers] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [announcementForm, setAnnouncementForm] = useState({ id: '', title: '', body: '', audienceType: 'all_lecturers', departmentId: '', courseId: '' });
  const [departments, setDepartments] = useState<any[]>([]);
  const [catalogCourses, setCatalogCourses] = useState<any[]>([]);
  const [studentEnrolments, setStudentEnrolments] = useState<any[]>([]);
  const [studentAccounts, setStudentAccounts] = useState<any[]>([]);
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [attendanceTrends, setAttendanceTrends] = useState<any[]>([]);
  const [courseActivity, setCourseActivity] = useState<any[]>([]);
  const [analyticsDays, setAnalyticsDays] = useState(14);
  const [assignmentLecturer, setAssignmentLecturer] = useState('');
  const [assignedCourseIds, setAssignedCourseIds] = useState<string[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [monitorSearch, setMonitorSearch] = useState('');
  const [deptForm, setDeptForm] = useState({ id: '', code: '', name: '', active: true });
  const [courseForm, setCourseForm] = useState({ id: '', departmentId: '', code: '', title: '', level: '', active: true });
  const [catalogMessage, setCatalogMessage] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Keep independent admin sections usable when one RPC/table is unavailable.
  // A failed audit or notification request must not blank the catalogue or lecturer list.
  const refreshInFlight = useRef(false);
  const refresh = async (showLoader = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (showLoader) setLoading(true);
    const failures: string[] = [];
    const jobs = [
      ['overview', db.loadAdminOverview, setOverview],
      ['lecturers', db.loadAdminLecturers, setLecturers],
      ['audit history', () => db.loadAdminAudit(60), setAudit],
      ['notifications', () => db.loadNotifications(20), setNotifications],
      ['announcements', db.loadAdminAnnouncements, setAnnouncements],
      ['departments', db.loadCatalogDepartments, setDepartments],
      ['course catalogue', () => db.loadCatalogCourses(null), setCatalogCourses],
      ['student enrolments', () => db.loadAdminStudentEnrolments(150), setStudentEnrolments],
      ['student accounts', db.loadAdminStudentAccounts, setStudentAccounts],
      ['recent attendance', () => db.loadAdminRecentAttendance(150), setRecentAttendance],
      ['recent sessions', () => db.loadAdminRecentSessions(75), setRecentSessions],
      ['attendance trends', () => db.loadAdminAttendanceTrends(analyticsDays), setAttendanceTrends],
      ['course activity', () => db.loadAdminCourseActivity(30), setCourseActivity],
    ] as const;
    try {
      await Promise.all(jobs.map(async ([label, load, apply]) => {
        try {
          const value = await load();
          apply(value as never);
        } catch (e) {
          failures.push(`${label}: ${db.friendly(e)}`);
        }
      }));
      setError(failures.length
        ? `Some admin information could not be loaded. Other sections remain available. ${failures.join(' · ')}`
        : '');
    } finally {
      refreshInFlight.current = false;
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

  const reviewStudentAccount = async (account: any, decision: 'approve' | 'reject') => {
    const action = decision === 'approve' ? 'approve' : 'reject';
    const prompt = action === 'approve'
      ? 'Approve the student account for ' + account.full_name + ' (' + account.student_id + ')? This grants access to their matched course and attendance history.'
      : 'Reject the student account for ' + account.full_name + ' (' + account.student_id + ')? They will not be able to view student records.';
    if (!window.confirm(prompt)) return;
    setWorkingId('student-account:' + account.user_id);
    try {
      await db.reviewStudentAccount(account.user_id, action);
      setMessage('Student account ' + action + 'd.');
      await refresh(false);
    } catch (e) { setError(db.friendly(e)); }
    finally { setWorkingId(''); }
  };

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

  const loadLecturerAssignments = async (lecturerId: string) => {
    setAssignmentLecturer(lecturerId);
    if (!lecturerId) { setAssignedCourseIds([]); return; }
    setAssignmentLoading(true);
    try {
      const rows = await db.loadAdminLecturerCourses(lecturerId);
      setAssignedCourseIds(rows.map((row: any) => row.course_id));
    } catch (e) { setError(db.friendly(e)); }
    finally { setAssignmentLoading(false); }
  };
  const toggleLecturerCourse = async (courseId: string, assigned: boolean) => {
    if (!assignmentLecturer) return;
    setWorkingId(`assignment:${courseId}`);
    try {
      await db.assignLecturerCourse(assignmentLecturer, courseId, assigned, false);
      setAssignedCourseIds((current) => assigned ? [...current, courseId] : current.filter((id) => id !== courseId));
      setMessage(`Course ${assigned ? 'assigned' : 'removed'} successfully.`);
      await refresh(false);
    } catch (e) { setError(db.friendly(e)); }
    finally { setWorkingId(''); }
  };

  const runDelete = async (kind: string, id: string, label: string, action: () => Promise<any>) => {
    const warning = kind === 'session'
      ? 'Delete session "' + label + '"? Its attendance rows and check-in attempts will also be deleted. This cannot be undone.'
      : kind === 'student'
      ? 'Remove student "' + label + '"? Their face template will be deleted, but historical attendance will remain.'
      : kind === 'lecturer'
      ? 'Permanently delete lecturer "' + label + '"? This is allowed only when they have no students, sessions, attendance or pending enrolment requests. Their sign-in account will also be removed.'
      : 'Delete ' + kind + ' "' + label + '" permanently? This cannot be undone.';
    if (!window.confirm(warning)) return;
    setWorkingId('delete:' + id);
    try {
      const result = await action();
      const extra = result?.attendance_rows_deleted ? ' ' + result.attendance_rows_deleted + ' attendance rows removed.'
        : result?.historical_attendance_preserved ? ' ' + result.historical_attendance_preserved + ' historical attendance rows preserved.' : '';
      setMessage(kind.charAt(0).toUpperCase() + kind.slice(1) + ' deleted successfully.' + extra);
      if (deptForm.id === id) setDeptForm({id:'',code:'',name:'',active:true});
      if (courseForm.id === id) setCourseForm({id:'',departmentId:'',code:'',title:'',level:'',active:true});
      await refresh(false);
    } catch (e) { setError(db.friendly(e)); }
    finally { setWorkingId(''); }
  };

  const readOne = async (id: string) => {
    try { await db.markNotificationRead(id); await refresh(false); }
    catch (e) { setError(db.friendly(e)); }
  };
  const readAll = async () => {
    try { await db.markAllNotificationsRead(); await refresh(false); }
    catch (e) { setError(db.friendly(e)); }
  };
  const unreadOne = async (id: string) => {
    try { await db.markNotificationUnread(id); await refresh(false); }
    catch (e) { setError(db.friendly(e)); }
  };
  const deleteOneNotification = async (id: string) => {
    try { await db.deleteNotification(id); await refresh(false); }
    catch (e) { setError(db.friendly(e)); }
  };
  const resetAnnouncementForm = () => setAnnouncementForm({ id: '', title: '', body: '', audienceType: 'all_lecturers', departmentId: '', courseId: '' });
  const editAnnouncement = (item: any) => {
    setAnnouncementForm({ id: item.id, title: item.title, body: item.body, audienceType: item.audience_type, departmentId: item.department_id || '', courseId: item.course_id || '' });
    setTab('announcements');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const saveAnnouncement = async (publish: boolean) => {
    setWorkingId('announcement');
    try {
      const result = await db.saveAdminAnnouncement({ ...announcementForm, publish });
      setMessage(publish
        ? `Announcement published to ${result.recipient_count} recipient(s).`
        : 'Announcement saved as a draft.');
      resetAnnouncementForm();
      await refresh(false);
    } catch (e) { setError(db.friendly(e)); }
    finally { setWorkingId(''); }
  };
  const removeAnnouncement = async (item: any) => {
    if (!window.confirm(`Delete “${item.title}”? This also removes its in-app announcement notifications.`)) return;
    setWorkingId('announcement-delete');
    try { await db.deleteAdminAnnouncement(item.id); setMessage('Announcement deleted.'); if (announcementForm.id === item.id) resetAnnouncementForm(); await refresh(false); }
    catch (e) { setError(db.friendly(e)); }
    finally { setWorkingId(''); }
  };

  const openNotification = (item: any) => {
    if (item.notification_type === 'lecturer_review' || item.entity_type === 'lecturer') {
      setTab('lecturers');
      return true;
    }
    if (item.notification_type === 'enrollment_request' || item.entity_type === 'enrollment_request') {
      setTab('enrolments');
      return true;
    }
    if (item.entity_type === 'attendance' || item.entity_type === 'session') {
      setTab('monitoring');
      return true;
    }
    return false;
  };

  const visibleLecturers = lecturers.filter((item) =>
    [item.name, item.email, item.dept, item.course].some((value) => String(value || '').toLowerCase().includes(search.toLowerCase()))
  );
  const statCards = [
    { label: 'Lecturers', value: overview?.lecturers_total ?? '—', detail: `${overview?.lecturers_verified ?? 0} verified · Manage accounts`, icon: UserCog, tab: 'lecturers' },
    { label: 'Awaiting verification', value: overview?.lecturers_pending ?? '—', detail: 'Review pending accounts', icon: ShieldAlert, tab: 'lecturers' },
    { label: 'Student-course enrolments', value: overview?.student_course_enrolments ?? '—', detail: 'Manage student records', icon: Users, tab: 'enrolments' },
    { label: 'Attendance records', value: overview?.attendance_total ?? '—', detail: `${overview?.attendance_today ?? 0} today · Review records`, icon: ClipboardList, tab: 'monitoring' },
    { label: 'Sessions', value: overview?.sessions_total ?? '—', detail: `${overview?.sessions_active ?? 0} active · Manage sessions`, icon: QrCode, tab: 'monitoring' },
    { label: 'Courses', value: catalogCourses.length, detail: 'Edit academic catalogue', icon: BookOpen, tab: 'academic' },
  ];

  return (
    <div className="space-y-5 sm:space-y-7 animate-fade-up">
      <section className="rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 border border-emerald-800 p-5 sm:p-7 text-white shadow-xl overflow-hidden relative">
        <div className="absolute -right-10 -top-16 w-56 h-56 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0"><div className="w-12 h-12 rounded-2xl bg-amber-400/15 border border-amber-300/30 grid place-items-center text-amber-300"><ShieldCheck className="w-6 h-6" /></div><div className="min-w-0"><p className="text-[10px] uppercase tracking-[.2em] text-emerald-200 font-black">CampusSign · System administration</p><h1 className="text-xl sm:text-2xl font-black text-white mt-1">Welcome, {activeStaff.name}</h1><p className="text-xs text-emerald-100/75 mt-1">Manage lecturer access, monitor attendance and review system activity.</p></div></div>
          <div className="flex items-center gap-2 self-end sm:self-auto"><NotificationBell notifications={notifications} onRead={readOne} onReadAll={readAll} onUnread={unreadOne} onDelete={deleteOneNotification} onOpen={openNotification} /><button onClick={() => refresh(true)} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15" aria-label="Refresh dashboard"><RefreshCw className="w-4 h-4" /></button><button onClick={onLogout} className="px-3 py-2.5 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-700 text-rose-100 text-xs font-bold inline-flex items-center gap-2"><LogOut className="w-4 h-4" />Sign out</button></div>
        </div>
      </section>

      {message && <div role="status" className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs font-semibold">{message}</div>}
      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-200 text-xs">{error}</div>}

      <div className="flex gap-2 overflow-x-auto p-1 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit max-w-full">
        {[['overview', 'Overview', BarChart3], ['academic', 'Departments & courses', BookMarked], ['lecturers', 'Lecturers', UserCog], ['enrolments', 'Enrolments', Users], ['student-accounts', 'Student accounts', UserRound], ['monitoring', 'Attendance & sessions', ClipboardList], ['announcements', 'Announcements', Bell], ['audit', 'Audit history', History]].map(([key, label, Icon]: any) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap inline-flex items-center gap-2 ${tab === key ? 'bg-emerald-900 text-amber-300 shadow' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}><Icon className="w-4 h-4" />{label}</button>)}
      </div>

      {loading ? <div className="py-16 text-center text-sm text-slate-500"><RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />Loading system overview…</div> : tab === 'overview' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{statCards.map((card) => <button type="button" key={card.label} onClick={() => setTab(card.tab)} className="text-left rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-500 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500"><div className="flex items-center justify-between gap-2"><span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400">{card.label}</span><span className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 grid place-items-center"><card.icon className="w-4 h-4" /></span></div><p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tabular-nums">{card.value}</p><p className="text-[10px] text-slate-500 mt-1">{card.detail} →</p></button>)}</div>
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div><h2 className="font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-600"/> Attendance analytics</h2><p className="text-[11px] text-slate-500 mt-1">Actual check-in records grouped by day and course.</p></div>
              <select value={analyticsDays} onChange={e=>setAnalyticsDays(Number(e.target.value))} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold"><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option><option value={60}>Last 60 days</option></select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="text-[10px] text-slate-500">Check-ins</p><p className="text-xl font-black text-slate-900 dark:text-white">{attendanceTrends.reduce((n,r)=>n+Number(r.checkins||0),0)}</p></div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="text-[10px] text-slate-500">Active days</p><p className="text-xl font-black text-slate-900 dark:text-white">{attendanceTrends.filter(r=>Number(r.checkins)>0).length}</p></div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="text-[10px] text-slate-500">Peak day</p><p className="text-xl font-black text-slate-900 dark:text-white">{Math.max(0,...attendanceTrends.map(r=>Number(r.checkins||0)))}</p></div>
            </div>
            <div><div className="flex items-center justify-between mb-2"><h3 className="text-xs font-extrabold text-slate-800 dark:text-white">Daily attendance volume</h3><span className="text-[10px] text-slate-500">Check-ins per day</span></div>
              {attendanceTrends.length===0 ? <p className="py-8 text-center text-xs text-slate-500">No trend data returned.</p> : <div className="h-36 flex items-end gap-1 border-b border-slate-200 dark:border-slate-700 pb-1">{attendanceTrends.map((r:any)=><div key={r.day} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1" title={r.day+': '+r.checkins+' check-ins, '+r.unique_students+' students'}><span className="text-[9px] text-slate-500">{r.checkins||''}</span><div className="w-full max-w-7 rounded-t bg-emerald-600 hover:bg-amber-500 transition-colors" style={{height:(Math.max(2,Number(r.checkins||0)/Math.max(1,...attendanceTrends.map(x=>Number(x.checkins||0)))*100))+'%'}}/><span className="text-[8px] text-slate-400 [writing-mode:vertical-rl] sm:[writing-mode:horizontal-tb]">{new Date(r.day).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</span></div>)}</div>}
            </div>
            <div><h3 className="text-xs font-extrabold text-slate-800 dark:text-white mb-2">Most active courses</h3>
              {courseActivity.length===0 ? <p className="py-5 text-center text-xs text-slate-500">No attendance activity in this period.</p> : <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="py-2">Course</th><th className="py-2 text-right">Check-ins</th><th className="py-2 text-right">Sessions</th><th className="py-2 text-right">Students</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{courseActivity.map((r:any)=><tr key={r.course}><td className="py-2 text-xs font-semibold text-slate-800 dark:text-slate-100">{r.course}</td><td className="py-2 text-xs text-right tabular-nums">{r.attendance_count}</td><td className="py-2 text-xs text-right tabular-nums">{r.session_count}</td><td className="py-2 text-xs text-right tabular-nums">{r.unique_students}</td></tr>)}</tbody></table></div>}
            </div>
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
                  <div className="flex items-center gap-3 shrink-0"><button type="button" onClick={()=>setDeptForm({id:d.id,code:d.code,name:d.name,active:d.is_active})} className="text-xs text-emerald-700 dark:text-emerald-300 font-bold">
                    <Pencil className="w-3.5 h-3.5 inline mr-1"/>Edit</button><button type="button" disabled={workingId===`delete:${d.id}`} onClick={()=>runDelete("department",d.id,d.name,()=>db.adminDeleteDepartment(d.id))} title="Delete department" className="text-rose-600 hover:text-rose-700 disabled:opacity-40"><Trash2 className="w-4 h-4"/></button></div>
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
                  <div className="flex items-center gap-3 shrink-0"><button type="button" onClick={()=>setCourseForm({id:c.id,departmentId:c.department_id,code:c.code,title:c.title,level:c.level||'',active:c.is_active})} className="text-xs text-emerald-700 dark:text-emerald-300 font-bold">
                    <Pencil className="w-3.5 h-3.5 inline mr-1"/>Edit</button><button type="button" disabled={workingId===`delete:${c.id}`} onClick={()=>runDelete("course",c.id,c.code,()=>db.adminDeleteCourse(c.id))} title="Delete course" className="text-rose-600 hover:text-rose-700 disabled:opacity-40"><Trash2 className="w-4 h-4"/></button></div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : tab === 'enrolments' ? (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><h2 className="font-extrabold text-slate-900 dark:text-white">Student enrolments</h2><p className="text-[11px] text-slate-500 mt-1">Recent student records and face-enrolment status. Biometric data is not displayed.</p></div>
            <input value={monitorSearch} onChange={e=>setMonitorSearch(e.target.value)} placeholder="Search student, ID, course…" className="w-full sm:max-w-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs"/>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-3">Student</th><th className="p-3">Department / level</th><th className="p-3">Course</th><th className="p-3">Lecturer</th><th className="p-3">Face setup</th><th className="p-3">Added</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {studentEnrolments.filter((r:any)=>[r.student_name,r.student_id,r.department,r.course,r.lecturer_name].some(v=>String(v||'').toLowerCase().includes(monitorSearch.toLowerCase()))).map((r:any)=><tr key={r.enrolment_id}><td className="p-3"><strong className="block text-xs text-slate-800 dark:text-white">{r.student_name}</strong><span className="text-[10px] text-slate-500">{r.student_id}</span></td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{r.department} · {r.level}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{r.course}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{r.lecturer_name}</td><td className="p-3 text-[10px] font-bold">{r.face_enrolled ? <span className="text-emerald-600">Enrolled</span> : <span className="text-amber-600">Not enrolled</span>}</td><td className="p-3 text-[10px] text-slate-500">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td><td className="p-3"><button type="button" disabled={workingId==='delete:'+r.enrolment_id} onClick={()=>runDelete('student',r.enrolment_id,r.student_name,()=>db.adminDeleteStudent(r.enrolment_id))} className="text-rose-600 hover:text-rose-700 text-xs font-bold inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td></tr>)}
          </tbody></table>{studentEnrolments.length===0 && <p className="py-8 text-center text-xs text-slate-500">No student enrolment records returned.</p>}</div>
        </section>

      ) : tab === 'student-accounts' ? (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><h2 className="font-extrabold text-slate-900 dark:text-white">Student account verification</h2><p className="text-[11px] text-slate-500 mt-1">Verify student sign-ins against lecturer-approved roster records. Account claims are matched by student ID, registered name and department.</p></div>
            <button type="button" onClick={()=>refresh(false)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold"><RefreshCw className="w-3.5 h-3.5 inline mr-1"/>Refresh</button>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-3">Student</th><th className="p-3">Contact</th><th className="p-3">Academic details</th><th className="p-3">Matched roster</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {studentAccounts.map((account:any)=><tr key={account.user_id}>
            <td className="p-3"><strong className="block text-xs text-slate-900 dark:text-white">{account.full_name}</strong><span className="text-[10px] text-slate-500">{account.student_id}</span></td>
            <td className="p-3 text-xs">{account.email}</td>
            <td className="p-3 text-xs">{account.department}<span className="block text-[10px] text-slate-500">{account.level} Level</span></td>
            <td className="p-3"><strong className="text-xs tabular-nums">{account.matching_roster_count}</strong><span className="block max-w-[240px] text-[10px] text-slate-500">{(account.matching_courses||[]).join(', ')||'No exact roster match yet'}</span></td>
            <td className="p-3"><span className={"rounded-full px-2 py-1 text-[9px] font-bold " + (account.status==='approved'?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':account.status==='rejected'?'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200':'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200')}>{account.status}</span><span className="block text-[9px] text-slate-500 mt-1">{new Date(account.created_at).toLocaleDateString()}</span></td>
            <td className="p-3">{account.status==='pending'?<div className="flex gap-2"><button type="button" disabled={!Number(account.matching_roster_count)||workingId==='student-account:'+account.user_id} onClick={()=>reviewStudentAccount(account,'approve')} className="rounded-lg bg-emerald-800 text-white px-3 py-2 text-[10px] font-bold disabled:opacity-40"><Check className="w-3 h-3 inline mr-1"/>Approve</button><button type="button" disabled={workingId==='student-account:'+account.user_id} onClick={()=>reviewStudentAccount(account,'reject')} className="rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 px-3 py-2 text-[10px] font-bold">Reject</button></div>:<span className="text-[10px] text-slate-500">Reviewed</span>}</td>
          </tr>)}
          </tbody></table>{studentAccounts.length===0&&<p className="py-10 text-center text-xs text-slate-500">No student accounts have been created yet.</p>}</div>
          <p className="text-[10px] text-slate-500">An account cannot be approved until at least one lecturer has approved an enrolment with matching student ID, name and department. No existing roster or attendance data is changed during account verification.</p>
        </section>
      ) : tab === 'monitoring' ? (
        <div className="space-y-4">
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div><h2 className="font-extrabold text-slate-900 dark:text-white">Recent attendance</h2><p className="text-[11px] text-slate-500 mt-1">Latest check-in records across the system. This view is read-only.</p></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-3">Student</th><th className="p-3">Course</th><th className="p-3">Session</th><th className="p-3">Lecturer</th><th className="p-3">Status</th><th className="p-3">Time</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{recentAttendance.filter((r:any)=>[r.student_name,r.student_id,r.course,r.session_title,r.lecturer_name].some(v=>String(v||'').toLowerCase().includes(monitorSearch.toLowerCase()))).map((r:any)=><tr key={r.attendance_id}><td className="p-3"><strong className="block text-xs text-slate-800 dark:text-white">{r.student_name}</strong><span className="text-[10px] text-slate-500">{r.student_id}</span></td><td className="p-3 text-xs">{r.course}</td><td className="p-3 text-xs">{r.session_title || r.session_id || '—'}</td><td className="p-3 text-xs">{r.lecturer_name || '—'}</td><td className="p-3 text-xs">{r.status || 'Recorded'}</td><td className="p-3 text-[10px] text-slate-500">{new Date(r.created_at).toLocaleString()}</td><td className="p-3"><button type="button" disabled={workingId==='delete:'+r.attendance_id} onClick={()=>runDelete('attendance',r.attendance_id,r.student_name+' · '+r.course,()=>db.adminDeleteAttendance(r.attendance_id))} className="text-rose-600 hover:text-rose-700 text-xs font-bold inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td></tr>)}</tbody></table>{recentAttendance.length===0 && <p className="py-6 text-center text-xs text-slate-500">No attendance records returned.</p>}</div>
          </section>
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div><h2 className="font-extrabold text-slate-900 dark:text-white">Attendance sessions</h2><p className="text-[11px] text-slate-500 mt-1">Recent QR/attendance sessions and their current state.</p></div>
            <div className="space-y-2">{recentSessions.map((s:any)=><article key={s.session_id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"><div className="min-w-0"><strong className="block text-xs text-slate-800 dark:text-white">{s.title || s.course}</strong><p className="text-[10px] text-slate-500 mt-1">{s.course} · {s.lecturer_name || 'Unknown lecturer'} · {s.attendance_count} check-ins</p><p className="text-[10px] text-slate-400">{new Date(s.created_at).toLocaleString()}{s.ends_at ? ` · Ends ${new Date(s.ends_at).toLocaleString()}` : ''}</p></div><div className="flex items-center gap-3 shrink-0"><span className={`text-[10px] font-bold ${s.revoked || (s.ends_at && new Date(s.ends_at)<new Date()) ? 'text-slate-500' : 'text-emerald-600'}`}>{s.revoked ? 'Revoked' : s.ends_at && new Date(s.ends_at)<new Date() ? 'Expired' : 'Active'}</span><button type="button" disabled={workingId==='delete:'+s.session_id} onClick={()=>runDelete('session',s.session_id,s.title||s.course,()=>db.adminDeleteSession(s.session_id))} className="text-rose-600 hover:text-rose-700 text-xs font-bold inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/>Delete</button></div></article>)}{recentSessions.length===0 && <p className="py-6 text-center text-xs text-slate-500">No attendance sessions returned.</p>}</div>
          </section>
        </div>
      ) : tab === 'lecturers' ? (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-900 dark:text-white">Lecturer accounts</h2><p className="text-[11px] text-slate-500 mt-1">Verify academic staff before they can use lecturer tools.</p></div><div className="relative w-full sm:max-w-xs"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or course" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs" /></div></div>
          <div className="overflow-x-auto"><table className="w-full text-left min-w-[680px]"><thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-3">Lecturer</th><th className="p-3">Department</th><th className="p-3">Course</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{visibleLecturers.map((lecturer) => <tr key={lecturer.lecturer_id}><td className="p-3"><strong className="block text-xs text-slate-800 dark:text-white">{lecturer.name}</strong><span className="text-[10px] text-slate-500">{lecturer.email}</span></td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{lecturer.dept}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{lecturer.course}</td><td className="p-3">{lecturer.is_verified ? <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"><BadgeCheck className="w-4 h-4" />Verified</span> : <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"><AlertCircle className="w-4 h-4" />Pending</span>}</td><td className="p-3 text-right"><button disabled={workingId === lecturer.lecturer_id} onClick={() => changeVerification(lecturer)} className={`px-3 py-2 rounded-lg text-[10px] font-extrabold disabled:opacity-50 ${lecturer.is_verified ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900' : 'bg-emerald-900 text-amber-300 border border-emerald-700'}`}>{workingId === lecturer.lecturer_id ? 'Saving…' : lecturer.is_verified ? 'Withdraw access' : 'Verify lecturer'}</button><button type="button" disabled={workingId==='delete:'+lecturer.lecturer_id} onClick={()=>runDelete("lecturer",lecturer.lecturer_id,lecturer.name,()=>db.adminDeleteLecturer(lecturer.lecturer_id))} className="ml-2 px-2 py-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40" title="Delete lecturer account"><Trash2 className="w-4 h-4"/></button></td></tr>)}</tbody></table>{visibleLecturers.length === 0 && <p className="py-8 text-center text-xs text-slate-500">No lecturer accounts match that search.</p>}</div>
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
            <div><h3 className="font-extrabold text-sm text-slate-900 dark:text-white">Lecturer course assignments</h3><p className="text-[11px] text-slate-500 mt-1">Choose a lecturer to manage the courses they are authorised to teach.</p></div>
            <select value={assignmentLecturer} onChange={e=>loadLecturerAssignments(e.target.value)} className="w-full sm:max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs">
              <option value="">Choose lecturer</option>{lecturers.map((l:any)=><option key={l.lecturer_id} value={l.lecturer_id}>{l.name} · {l.email}</option>)}
            </select>
            {assignmentLecturer && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {assignmentLoading ? <p className="text-xs text-slate-500">Loading assignments…</p> : catalogCourses.map((course:any)=><label key={course.id} className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={assignedCourseIds.includes(course.id)} disabled={workingId===`assignment:${course.id}` || !course.is_active} onChange={e=>toggleLecturerCourse(course.id,e.target.checked)}/>
                <span className="min-w-0"><strong className="block">{course.code} · {course.title}</strong><span className="text-[10px] text-slate-500">{course.department_name}{!course.is_active ? ' · Inactive' : ''}</span></span>
              </label>)}
              {!catalogCourses.length && <p className="text-xs text-slate-500">Add courses to the catalogue before assigning them.</p>}
            </div>}
          </div>
        </section>
      ) : tab === 'announcements' ? (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4">
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div><h2 className="font-extrabold text-slate-900 dark:text-white">{announcementForm.id ? 'Edit announcement' : 'Compose announcement'}</h2><p className="text-[11px] text-slate-500 mt-1">Write updates for verified lecturers or approved student accounts. Drafts remain private to administrators until published.</p></div>
            {announcementForm.id && <div className="flex items-center justify-between rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 text-[11px] text-amber-800 dark:text-amber-200"><span>Editing selected announcement</span><button type="button" onClick={resetAnnouncementForm} className="font-bold underline">Cancel</button></div>}
            <div className="space-y-3">
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Title</span><input maxLength={120} value={announcementForm.title} onChange={e=>setAnnouncementForm({...announcementForm,title:e.target.value})} placeholder="e.g. Semester attendance policy update" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Message</span><textarea maxLength={5000} rows={7} value={announcementForm.body} onChange={e=>setAnnouncementForm({...announcementForm,body:e.target.value})} placeholder="Write the announcement details…" className="mt-1 w-full resize-y rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Audience</span><select value={announcementForm.audienceType} onChange={e=>setAnnouncementForm({...announcementForm,audienceType:e.target.value,departmentId:'',courseId:''})} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"><option value="all_lecturers">All verified lecturers</option><option value="all_students">All approved students</option><option value="department">Lecturers in one department</option><option value="course">Lecturers assigned to one course</option></select></label>
              {announcementForm.audienceType === 'department' && <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Department</span><select value={announcementForm.departmentId} onChange={e=>setAnnouncementForm({...announcementForm,departmentId:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"><option value="">Choose department</option>{departments.filter(d=>d.is_active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
              {announcementForm.audienceType === 'course' && <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Course</span><select value={announcementForm.courseId} onChange={e=>setAnnouncementForm({...announcementForm,courseId:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"><option value="">Choose course</option>{catalogCourses.filter(c=>c.is_active).map(c=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select></label>}
              <p className="text-[10px] text-slate-500">Maximum 120 characters in the title and 5,000 in the message. Publishing sends an in-app notification to matching verified lecturer accounts.</p>
              <div className="flex flex-col sm:flex-row gap-2"><button type="button" disabled={workingId==='announcement' || !announcementForm.title.trim() || !announcementForm.body.trim() || (announcementForm.audienceType==='department' && !announcementForm.departmentId) || (announcementForm.audienceType==='course' && !announcementForm.courseId)} onClick={()=>saveAnnouncement(false)} className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40">Save draft</button><button type="button" disabled={workingId==='announcement' || !announcementForm.title.trim() || !announcementForm.body.trim() || (announcementForm.audienceType==='department' && !announcementForm.departmentId) || (announcementForm.audienceType==='course' && !announcementForm.courseId)} onClick={()=>saveAnnouncement(true)} className="flex-1 rounded-xl bg-emerald-900 px-4 py-3 text-xs font-bold text-amber-300 disabled:opacity-40">{workingId==='announcement' ? 'Saving…' : 'Publish announcement'}</button></div>
            </div>
          </section>
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2"><div><h2 className="font-extrabold text-slate-900 dark:text-white">Announcement history</h2><p className="text-[11px] text-slate-500 mt-1">Edit drafts or published messages and review delivery/read counts.</p></div><button type="button" onClick={()=>refresh(false)} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2" aria-label="Refresh announcements"><RefreshCw className="w-4 h-4"/></button></div>
            {announcements.length===0 ? <p className="py-10 text-center text-xs text-slate-500">No announcements yet. Compose one to get started.</p> : <div className="space-y-3">{announcements.map((item:any)=><article key={item.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-2"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="text-sm font-extrabold text-slate-900 dark:text-white break-words">{item.title}</h3><p className="text-[10px] text-slate-500 mt-1">{item.audience_type==='all_lecturers'?'All verified lecturers':item.audience_type==='all_students'?'All approved students':item.audience_type==='department'?(departments.find(d=>d.id===item.department_id)?.name || 'Selected department'):(catalogCourses.find(c=>c.id===item.course_id)?.code || 'Selected course')} · Updated {new Date(item.updated_at).toLocaleString()}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${item.status==='published'?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{item.status==='published'?'Published':'Draft'}</span></div><p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap line-clamp-4">{item.body}</p>{item.status==='published' && <div className="flex gap-4 text-[10px] text-slate-500"><span>{item.recipient_count} delivered</span><span>{item.read_count} read</span></div>}<div className="flex flex-wrap gap-2 pt-1"><button type="button" onClick={()=>editAnnouncement(item)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-200"><Pencil className="w-3 h-3 inline mr-1"/>Edit</button><button type="button" disabled={workingId==='announcement-delete'} onClick={()=>removeAnnouncement(item)} className="rounded-lg border border-rose-200 dark:border-rose-900 px-3 py-2 text-[10px] font-bold text-rose-700 dark:text-rose-300"><Trash2 className="w-3 h-3 inline mr-1"/>Delete</button></div></article>)}</div>}
          </section>
        </div>
      ) : (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"><div className="mb-4"><h2 className="font-extrabold text-slate-900 dark:text-white">Audit history</h2><p className="text-[11px] text-slate-500 mt-1">Recent enrolment, verification and attendance changes. Biometric descriptors and photos are never included.</p></div>
          {audit.length === 0 ? <p className="py-10 text-center text-xs text-slate-500">No audit events recorded yet. New sensitive actions will appear here.</p> : <div className="space-y-2">{audit.map((event) => <article key={event.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1"><strong className="text-xs text-slate-800 dark:text-slate-100">{String(event.action).replace(/\./g, ' ')}</strong><time className="text-[10px] text-slate-500">{new Date(event.created_at).toLocaleString()}</time></div><p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{event.entity_type}{event.course ? ` · ${event.course}` : ''}{event.actor_email ? ` · by ${event.actor_email}` : ''}</p><pre className="mt-2 text-[10px] text-slate-500 whitespace-pre-wrap break-words">{JSON.stringify(event.details, null, 2)}</pre></article>)}</div>}
        </section>
      )}
      <p className="text-[10px] text-slate-400 text-center">Administrator actions are enforced by Supabase policies and server-side functions, not by this interface alone.</p>
    </div>
  );
}
