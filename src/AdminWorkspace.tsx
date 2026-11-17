import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, BarChart3, BadgeCheck, Bell, BookOpen, CheckCheck, Check, X,
  ClipboardList, History, LogOut, QrCode, RefreshCw, Search, ShieldAlert, Palette, ImagePlus, Save,
  ShieldCheck, UserCog, Users, Building2, GraduationCap, Plus, Pencil, BookMarked, Trash2, Activity, UserRound
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
  const [branding, setBranding] = useState<any>(db.DEFAULT_CAMPUS_BRANDING);
  const [brandingBusy, setBrandingBusy] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState('');
  const [brandingError, setBrandingError] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [brandingWorkspace, setBrandingWorkspace] = useState<'student' | 'staff'>('student');
  useEffect(() => { db.loadCampusBranding().then(setBranding).catch(e => setBrandingError(db.friendly(e))); }, []);
  const saveBranding = async () => {
    setBrandingBusy(true); setBrandingError(''); setBrandingMessage('');
    try {
      const saved = await db.saveCampusBranding(branding);
      setBranding(saved);
      try { if (saved.logo_url) localStorage.setItem('campussign-brand-logo', saved.logo_url); else localStorage.removeItem('campussign-brand-logo'); } catch {}
      setBrandingMessage('Branding saved successfully. Student and Staff workspaces will use their own saved appearance on next load.');
    } catch (e) { setBrandingError(db.friendly(e)); }
    finally { setBrandingBusy(false); }
  };
  const uploadBrandLogo = async (file?: File, workspace: 'student' | 'staff' = brandingWorkspace) => {
    if (!file) return;
    setLogoBusy(true); setBrandingError('');
    try {
      const logo_url = await db.uploadCampusLogo(file);
      setBranding(prev => ({ ...prev, [workspace + '_logo_url']: logo_url }));
      setBrandingMessage(`${workspace === 'student' ? 'Student' : 'Staff'} logo uploaded. Save branding to publish it.`);
    } catch (e) { setBrandingError(db.friendly(e)); }
    finally { setLogoBusy(false); }
  };
  const workspacePrefix = brandingWorkspace === 'student' ? 'student' : 'staff';
  const workspaceLogo = branding[workspacePrefix + '_logo_url'] || branding.logo_url;
  const uploadInstitutionLogo = async (file?: File) => {
    if (!file) return;
    setLogoBusy(true); setBrandingError('');
    try {
      const logo_url = await db.uploadCampusLogo(file);
      setBranding(prev => ({ ...prev, logo_url }));
      setBrandingMessage('Institution logo uploaded. It will be used wherever a workspace-specific logo is not set. Save branding to publish it.');
    } catch (e) { setBrandingError(db.friendly(e)); }
    finally { setLogoBusy(false); }
  };
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState<any>(null);
  const [lecturers, setLecturers] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [announcementForm, setAnnouncementForm] = useState({ id: '', title: '', body: '', audienceType: 'all_staff', departmentId: '', courseId: '', studentUserId: '' });
  const [departments, setDepartments] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [facultyForm, setFacultyForm] = useState({ id: '', code: '', name: '', active: true });
  const [catalogCourses, setCatalogCourses] = useState<any[]>([]);
  const [studentEnrolments, setStudentEnrolments] = useState<any[]>([]);
  const [studentAccounts, setStudentAccounts] = useState<any[]>([]);
  const [rerollRequests, setRerollRequests] = useState<any[]>([]);
  const [studentAccountView, setStudentAccountView] = useState<'accounts' | 'rerolls'>('accounts');
  const [rerollSearch, setRerollSearch] = useState('');
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [attendanceTrends, setAttendanceTrends] = useState<any[]>([]);
  const [courseActivity, setCourseActivity] = useState<any[]>([]);
  const [analyticsDays, setAnalyticsDays] = useState(14);
  const [assignmentLecturer, setAssignmentLecturer] = useState('');
  const [assignedCourseIds, setAssignedCourseIds] = useState<string[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [enrolmentSearch, setEnrolmentSearch] = useState('');
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [deptForm, setDeptForm] = useState({ id: '', code: '', name: '', facultyId: '', active: true });
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
  const refreshPending = useRef(false);
  const refreshPendingLoader = useRef(false);
  const refresh = async (showLoader = false) => {
    // Coalesce overlapping refresh requests instead of silently dropping them.
    // This matters when a user saves/reviews something while the 30-second
    // background refresh is still running.
    if (refreshInFlight.current) {
      refreshPending.current = true;
      refreshPendingLoader.current = refreshPendingLoader.current || showLoader;
      return;
    }
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
      ['faculties', db.loadCatalogFaculties, setFaculties],
      ['course catalogue', () => db.loadCatalogCourses(null), setCatalogCourses],
      ['student enrolments', () => db.loadAdminStudentEnrolments(150), setStudentEnrolments],
      ['student accounts', db.loadAdminStudentAccounts, setStudentAccounts],
      ['department change requests', db.loadAdminDepartmentRerolls, setRerollRequests],
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
      if (refreshPending.current) {
        const showPendingLoader = refreshPendingLoader.current;
        refreshPending.current = false;
        refreshPendingLoader.current = false;
        void refresh(showPendingLoader);
      }
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

  const reviewDepartmentReroll = async (request: any, decision: 'approve' | 'reject') => {
    const label = `${request.full_name} (${request.student_id})`;
    if (!window.confirm(`${decision === 'approve' ? 'Approve' : 'Reject'} the department change for ${label}?${decision === 'approve' ? ` The student may then apply the move from ${request.current_department} to ${request.requested_department}. Old course enrolments and face registration are cleared only when they apply it.` : ''}`)) return;
    setWorkingId('reroll:' + request.request_id);
    try { await db.reviewDepartmentReroll(request.request_id, decision); setMessage(`Department change ${decision === 'approve' ? 'approved' : 'rejected'}.`); await refresh(false); }
    catch (e) { setError(db.friendly(e)); }
    finally { setWorkingId(''); }
  };

  const reviewStudentAccount = async (account: any, decision: 'approve' | 'reject') => {
    const action = decision === 'approve' ? 'approve' : 'reject';
    const prompt = action === 'approve'
      ? 'Approve the student account for ' + account.full_name + ' (' + account.student_id + ')? This grants access to their matched course and attendance history.'
      : 'Reject the student account for ' + account.full_name + ' (' + account.student_id + ')? They will not be able to view student records.';
    if (!window.confirm(prompt)) return;
    setWorkingId('student-account:' + account.user_id);
    try {
      await db.reviewStudentAccount(account.user_id, action);
      setMessage(action === 'approve' ? 'Student account approved.' : 'Student account rejected.');
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

  const saveFaculty = async (event: React.FormEvent) => {
    event.preventDefault(); setWorkingId('faculty'); setCatalogMessage('');
    try {
      await db.saveCatalogFaculty({ id: facultyForm.id || null, code: facultyForm.code, name: facultyForm.name, active: facultyForm.active });
      setFacultyForm({ id: '', code: '', name: '', active: true });
      setCatalogMessage('Faculty saved successfully.'); await refresh(false);
    } catch (e) { setError(db.friendly(e)); } finally { setWorkingId(''); }
  };

  const saveDepartment = async (event: React.FormEvent) => {
    event.preventDefault(); setWorkingId('department'); setCatalogMessage('');
    try {
      const savedId = await db.saveCatalogDepartment({ id: deptForm.id || null, code: deptForm.code, name: deptForm.name, active: deptForm.active });
      await db.assignDepartmentFaculty(deptForm.id || savedId, deptForm.facultyId || null);
      setDeptForm({ id: '', code: '', name: '', facultyId: '', active: true }); setCatalogMessage('Department saved successfully.'); await refresh(false);
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
      : kind === 'student account'
      ? 'Permanently delete the student account for "' + label + '"? They will be removed from every lecturer course roster, and their course requests and face templates will be deleted. Historical attendance records will remain.'
      : kind === 'student'
      ? 'Remove student "' + label + '"? Their face template will be deleted, but historical attendance will remain.'
      : kind === 'lecturer'
      ? 'Permanently delete lecturer "' + label + '"? This is allowed only when they have no students, sessions, attendance or pending enrolment requests. Their sign-in account will also be removed.'
      : 'Delete ' + kind + ' "' + label + '" permanently? This cannot be undone.';
    if (!window.confirm(warning)) return;
    setWorkingId('delete:' + id);
    try {
      const result = await action();
      const extra = result?.roster_entries_deleted !== undefined ? ` ${result.roster_entries_deleted} course roster entr${result.roster_entries_deleted === 1 ? 'y' : 'ies'} removed; historical attendance preserved.` : result?.enrollment_requests_deleted !== undefined ? ' ' + result.enrollment_requests_deleted + ' course requests removed.'
        : result?.attendance_rows_deleted ? ' ' + result.attendance_rows_deleted + ' attendance rows removed.'
        : result?.historical_attendance_preserved ? ' ' + result.historical_attendance_preserved + ' historical attendance rows preserved.' : '';
      setMessage(kind.charAt(0).toUpperCase() + kind.slice(1) + ' deleted successfully.' + extra);
      if (deptForm.id === id) setDeptForm({id:'',code:'',name:'',facultyId:'',active:true});
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
  const resetAnnouncementForm = () => setAnnouncementForm({ id: '', title: '', body: '', audienceType: 'all_staff', departmentId: '', courseId: '', studentUserId: '' });
  const editAnnouncement = (item: any) => {
    setAnnouncementForm({ id: item.id, title: item.title, body: item.body, audienceType: item.audience_type, departmentId: item.department_id || '', courseId: item.course_id || '', studentUserId: item.student_user_id || '' });
    setTab('announcements');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const saveAnnouncement = async (publish: boolean) => {
    setWorkingId('announcement');
    try {
      const result = await db.saveAdminAnnouncement({ ...announcementForm, publish });
      setMessage(publish
        ? Number(result?.recipient_count || 0) > 0
          ? `Announcement published and delivered to ${result.recipient_count} account(s).`
          : 'Announcement published, but no accounts matched this audience. Check account approval and department selection.'
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
  const visibleStudentEnrolments = studentEnrolments.filter((item) =>
    [item.student_name, item.student_id, item.department, item.course, item.lecturer_name].some((value) => String(value || '').toLowerCase().includes(enrolmentSearch.toLowerCase().trim()))
  );
  const visibleRecentAttendance = recentAttendance.filter((item) =>
    [item.student_name, item.student_id, item.course, item.session_title, item.lecturer_name].some((value) => String(value || '').toLowerCase().includes(attendanceSearch.toLowerCase().trim()))
  );
  const visibleRerollRequests = rerollRequests.filter((item) =>
    [item.full_name,item.student_id,item.email,item.current_department,item.requested_department,item.status].some((value) => String(value || '').toLowerCase().includes(rerollSearch.toLowerCase().trim()))
  );
  const visibleStudentAccounts = studentAccounts.filter((item) =>
    [item.full_name, item.student_id, item.email, item.department, item.status].some((value) => String(value || '').toLowerCase().includes(accountSearch.toLowerCase().trim()))
  );
  const visibleCatalogCourses = catalogCourses.filter((item) =>
    [item.code, item.title, item.department_name, item.level].some((value) => String(value || '').toLowerCase().includes(catalogSearch.toLowerCase().trim()))
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
    <div className="cs-admin-workspace space-y-5 sm:space-y-7 animate-fade-up">
      <section className="cs-admin-welcome rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-[10px] uppercase tracking-[.16em] text-emerald-200 font-black">Administration</p><h1 className="text-base sm:text-lg font-extrabold text-white mt-0.5">Welcome, {activeStaff.name}</h1></div>
          <div className="flex items-center gap-2 self-end sm:self-auto"><NotificationBell notifications={notifications} onRead={readOne} onReadAll={readAll} onUnread={unreadOne} onDelete={deleteOneNotification} onOpen={openNotification} /><button onClick={() => refresh(true)} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15" aria-label="Refresh dashboard"><RefreshCw className="w-4 h-4" /></button><button onClick={onLogout} className="px-3 py-2.5 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-700 text-rose-100 text-xs font-bold inline-flex items-center gap-2"><LogOut className="w-4 h-4" />Sign out</button></div>
        </div>
      </section>

      {message && <div role="status" className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs font-semibold">{message}</div>}
      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-200 text-xs">{error}</div>}

      <div className="sm:hidden">
        <label className="sr-only" htmlFor="admin-section-select">Dashboard section</label>
        <select id="admin-section-select" value={tab} onChange={e=>setTab(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3 text-sm font-bold">
          <option value="overview">Overview</option><option value="academic">Departments & courses</option><option value="lecturers">Lecturers</option><option value="enrolments">Enrolments</option><option value="student-accounts">Student accounts</option><option value="monitoring">Attendance & sessions</option><option value="announcements">Announcements</option><option value="audit">Audit history</option><option value="branding">Branding studio</option>
        </select>
      </div>
      <nav aria-label="Admin dashboard sections" className="cs-admin-nav hidden sm:flex gap-2">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'academic', label: 'Departments & courses', icon: BookMarked },
          { id: 'lecturers', label: 'Lecturers', icon: UserCog },
          { id: 'enrolments', label: 'Enrolments', icon: Users },
          { id: 'student-accounts', label: 'Student accounts', icon: UserRound },
          { id: 'monitoring', label: 'Attendance & sessions', icon: ClipboardList },
          { id: 'announcements', label: 'Announcements', icon: Bell },
          { id: 'audit', label: 'Audit history', icon: History },
          { id: 'branding', label: 'Branding studio', icon: Palette },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            data-admin-section={id}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); setTab(id); }}
            aria-current={tab === id ? 'page' : undefined}
            aria-pressed={tab === id}
            className={`cs-admin-nav-button min-w-0 rounded-xl border px-3 py-3 text-left text-xs font-bold inline-flex items-center gap-2 transition-colors ${tab === id ? 'is-active' : ''}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </nav>

      {loading ? <div className="py-16 text-center text-sm text-slate-500"><RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />Loading system overview…</div> : tab === 'overview' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{statCards.map((card) => <button type="button" key={card.label} onClick={() => setTab(card.tab)} className="text-left rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-500 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500"><div className="flex items-center justify-between gap-2"><span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400">{card.label}</span><span className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 grid place-items-center"><card.icon className="w-4 h-4" /></span></div><p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tabular-nums">{card.value}</p></button>)}</div>
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div><h2 className="font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-600"/> Attendance analytics</h2></div>
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
        <div className="space-y-4">
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="font-extrabold text-slate-900 dark:text-white">Faculties</h2><p className="text-xs text-slate-500 mt-1">Create faculties first, then assign departments to them below.</p></div>
              <GraduationCap className="w-5 h-5 text-emerald-600" />
            </div>
            <form onSubmit={saveFaculty} className="grid grid-cols-1 sm:grid-cols-[110px_1fr_auto] gap-2">
              <input required maxLength={12} value={facultyForm.code} onChange={e=>setFacultyForm({...facultyForm,code:e.target.value.toUpperCase()})} placeholder="Code e.g. ENG" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-mono font-bold"/>
              <input required value={facultyForm.name} onChange={e=>setFacultyForm({...facultyForm,name:e.target.value})} placeholder="Faculty name e.g. Faculty of Engineering" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs"/>
              <button disabled={workingId==='faculty'} className="px-4 py-2.5 rounded-xl bg-emerald-900 text-amber-300 text-xs font-bold disabled:opacity-50">{facultyForm.id ? 'Update faculty' : 'Add faculty'}</button>
            </form>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {faculties.length === 0 ? <p className="text-xs text-slate-500">No faculties created yet.</p> : faculties.map(f=><div key={f.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3"><div className="min-w-0"><strong className="block text-xs text-slate-800 dark:text-white truncate">{f.name}</strong><span className="text-[10px] text-slate-500 font-mono">{f.code} · {f.is_active ? 'Active' : 'Inactive'}</span></div><button type="button" onClick={()=>setFacultyForm({id:f.id,code:f.code,name:f.name,active:f.is_active})} className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Edit</button></div>)}
            </div>
            {facultyForm.id && <div className="flex flex-wrap items-center gap-3 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={facultyForm.active} onChange={e=>setFacultyForm({...facultyForm,active:e.target.checked})}/> Faculty active</label><button type="button" onClick={()=>setFacultyForm({id:'',code:'',name:'',active:true})} className="underline text-slate-500">Cancel edit</button></div>}
          </section>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-slate-900 dark:text-white">Departments</h2><p className="text-xs text-slate-500 mt-1">Each department can belong to a faculty.</p>
                
              </div>
              <Building2 className="w-5 h-5 text-emerald-600" />
            </div>
            {catalogMessage && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">{catalogMessage}</p>}
            <form onSubmit={saveDepartment} className="space-y-3">
              {deptForm.id && (
                <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300">
                  <span>Editing department: <strong>{deptForm.name || deptForm.code}</strong></span>
                  <button type="button" onClick={() => setDeptForm({ id: '', code: '', name: '', facultyId: '', active: true })} className="font-bold underline ml-2">Cancel edit</button>
                </div>
              )}
              <select value={deptForm.facultyId} onChange={e=>setDeptForm({...deptForm,facultyId:e.target.value})} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs"><option value="">No faculty assigned</option>{faculties.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
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
                    <span className="text-[10px] font-mono text-slate-500">{d.code}{d.faculty_name ? ' · ' + d.faculty_name : ' · Faculty not assigned'}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0"><button type="button" onClick={()=>setDeptForm({id:d.id,code:d.code,name:d.name,facultyId:d.faculty_id || '',active:d.is_active})} className="text-xs text-emerald-700 dark:text-emerald-300 font-bold">
                    <Pencil className="w-3.5 h-3.5 inline mr-1"/>Edit</button><button type="button" disabled={workingId===`delete:${d.id}`} onClick={()=>runDelete("department",d.id,d.name,()=>db.adminDeleteDepartment(d.id))} title="Delete department" className="text-rose-600 hover:text-rose-700 disabled:opacity-40"><Trash2 className="w-4 h-4"/></button></div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-slate-900 dark:text-white">Course catalogue</h2>
                
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
              <div className="relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400"/><input value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)} placeholder="Search courses or departments" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"/></div>
              {visibleCatalogCourses.length === 0 ? <p className="py-4 text-center text-xs text-slate-500">{catalogCourses.length ? 'No courses match your search.' : 'No courses registered in the catalogue yet.'}</p> : visibleCatalogCourses.map(c=>(
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
        </div>
      ) : tab === 'enrolments' ? (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><h2 className="font-extrabold text-slate-900 dark:text-white">Student enrolments</h2></div>
            <input value={enrolmentSearch} onChange={e=>setEnrolmentSearch(e.target.value)} placeholder="Search student, ID, course…" className="w-full sm:max-w-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs"/>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-3">Student</th><th className="p-3">Department / level</th><th className="p-3">Course</th><th className="p-3">Lecturer</th><th className="p-3">Face setup</th><th className="p-3">Added</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleStudentEnrolments.map((r:any)=><tr key={r.enrolment_id}><td className="p-3"><strong className="block text-xs text-slate-800 dark:text-white">{r.student_name}</strong><span className="text-[10px] text-slate-500">{r.student_id}</span></td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{r.department} · {r.level}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{r.course}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{r.lecturer_name}</td><td className="p-3 text-[10px] font-bold">{r.face_enrolled ? <span className="text-emerald-600">Enrolled</span> : <span className="text-amber-600">Not enrolled</span>}</td><td className="p-3 text-[10px] text-slate-500">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td><td className="p-3"><button type="button" disabled={workingId==='delete:'+r.enrolment_id} onClick={()=>runDelete('student',r.enrolment_id,r.student_name,()=>db.adminDeleteStudent(r.enrolment_id))} className="text-rose-600 hover:text-rose-700 text-xs font-bold inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td></tr>)}
          </tbody></table>{visibleStudentEnrolments.length===0 && <p className="py-8 text-center text-xs text-slate-500">{studentEnrolments.length ? 'No student enrolments match your search.' : 'No student enrolment records returned.'}</p>}</div>
        </section>

      ) : tab === 'student-accounts' ? (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="font-extrabold text-slate-900 dark:text-white">Student accounts</h2>
            <button type="button" onClick={()=>refresh(false)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold"><RefreshCw className="w-3.5 h-3.5 inline mr-1"/>Refresh</button>
          </div>
          <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button type="button" onClick={()=>setStudentAccountView('accounts')} className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-bold ${studentAccountView==='accounts'?'bg-emerald-900 text-amber-300':'text-slate-600 dark:text-slate-300'}`}>Accounts ({studentAccounts.length})</button>
            <button type="button" onClick={()=>setStudentAccountView('rerolls')} className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-bold ${studentAccountView==='rerolls'?'bg-emerald-900 text-amber-300':'text-slate-600 dark:text-slate-300'}`}>Department changes ({rerollRequests.filter(r=>r.status==='pending').length})</button>
          </div>
          {studentAccountView==='accounts' ? <>
            <div className="relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400"/><input value={accountSearch} onChange={e=>setAccountSearch(e.target.value)} placeholder="Search student name, ID, email or department" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"/></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-3">Student</th><th className="p-3">Contact</th><th className="p-3">Academic details</th><th className="p-3">Existing roster</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleStudentAccounts.map((account:any)=><tr key={account.user_id}>
              <td className="p-3"><strong className="block text-xs text-slate-900 dark:text-white">{account.full_name}</strong><span className="text-[10px] text-slate-500">{account.student_id}</span></td>
              <td className="p-3 text-xs">{account.email}</td>
              <td className="p-3 text-xs">{account.department}<span className="block text-[10px] text-slate-500">{account.level} Level</span></td>
              <td className="p-3"><strong className="text-xs tabular-nums">{account.matching_roster_count}</strong><span className="block max-w-[240px] text-[10px] text-slate-500">{(account.matching_courses||[]).join(', ')||'No existing roster record yet'}</span></td>
              <td className="p-3"><span className={"rounded-full px-2 py-1 text-[9px] font-bold " + (account.status==='approved'?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':account.status==='rejected'?'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200':'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200')}>{account.status}</span><span className="block text-[9px] text-slate-500 mt-1">{new Date(account.created_at).toLocaleDateString()}</span></td>
              <td className="p-3"><div className="flex flex-wrap gap-2">{account.status==='pending' && <><button type="button" disabled={workingId==='student-account:'+account.user_id} onClick={()=>reviewStudentAccount(account,'approve')} className="rounded-lg bg-emerald-800 text-white px-3 py-2 text-[10px] font-bold disabled:opacity-40"><Check className="w-3 h-3 inline mr-1"/>Approve</button><button type="button" disabled={workingId==='student-account:'+account.user_id} onClick={()=>reviewStudentAccount(account,'reject')} className="rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 px-3 py-2 text-[10px] font-bold">Reject</button></>}<button type="button" disabled={workingId==='delete:'+account.user_id} onClick={()=>runDelete('student account',account.user_id,account.full_name,()=>db.adminDeleteStudentAccount(account.user_id))} className="rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 px-3 py-2 text-[10px] font-bold disabled:opacity-40"><Trash2 className="w-3 h-3 inline mr-1"/>Delete account</button></div></td>
            </tr>)}
            </tbody></table>{visibleStudentAccounts.length===0&&<p className="py-10 text-center text-xs text-slate-500">{studentAccounts.length ? 'No student accounts match your search.' : 'No student accounts have been created yet.'}</p>}</div>
          </> : <>
            <div className="relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400"/><input value={rerollSearch} onChange={e=>setRerollSearch(e.target.value)} placeholder="Search student, ID or department" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"/></div>
            <div className="space-y-3">
              {visibleRerollRequests.map((request:any)=><article key={request.request_id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2"><div className="min-w-0"><h3 className="font-bold text-sm text-slate-900 dark:text-white break-words">{request.full_name}</h3><p className="text-[11px] text-slate-500 break-all">{request.student_id} · {request.email}</p></div><span className={`self-start rounded-full px-2.5 py-1 text-[10px] font-bold ${request.status==='pending'?'bg-amber-100 text-amber-800':request.status==='approved'?'bg-emerald-100 text-emerald-800':request.status==='rejected'?'bg-rose-100 text-rose-800':'bg-slate-100 text-slate-700'}`}>{request.status}</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs"><div><span className="text-slate-500">Current</span><p className="font-semibold mt-1">{request.current_department}</p></div><div><span className="text-slate-500">Requested</span><p className="font-semibold mt-1">{request.requested_department}</p></div></div>
                <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{request.reason}</p>
                {request.admin_note&&<p className="text-[11px] text-slate-500">Admin note: {request.admin_note}</p>}
                {request.status==='pending'&&<div className="flex gap-2"><button type="button" disabled={workingId==='reroll:'+request.request_id} onClick={()=>reviewDepartmentReroll(request,'approve')} className="flex-1 sm:flex-none rounded-xl bg-emerald-800 text-white px-4 py-2.5 text-xs font-bold disabled:opacity-50">Approve</button><button type="button" disabled={workingId==='reroll:'+request.request_id} onClick={()=>reviewDepartmentReroll(request,'reject')} className="flex-1 sm:flex-none rounded-xl border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 px-4 py-2.5 text-xs font-bold disabled:opacity-50">Reject</button></div>}
              </article>)}
              {visibleRerollRequests.length===0&&<p className="py-10 text-center text-xs text-slate-500">{rerollRequests.length?'No department change requests match your search.':'No department change requests yet.'}</p>}
            </div>
          </>}
        </section>
      ) : tab === 'monitoring' ? (
        <div className="space-y-4">
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div><h2 className="font-extrabold text-slate-900 dark:text-white">Recent attendance</h2></div>
            <div className="relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400"/><input value={attendanceSearch} onChange={e=>setAttendanceSearch(e.target.value)} placeholder="Search student, ID, course or lecturer" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"/></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-3">Student</th><th className="p-3">Course</th><th className="p-3">Session</th><th className="p-3">Lecturer</th><th className="p-3">Status</th><th className="p-3">Time</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{visibleRecentAttendance.map((r:any)=><tr key={r.attendance_id}><td className="p-3"><strong className="block text-xs text-slate-800 dark:text-white">{r.student_name}</strong><span className="text-[10px] text-slate-500">{r.student_id}</span></td><td className="p-3 text-xs">{r.course}</td><td className="p-3 text-xs">{r.session_title || r.session_id || '—'}</td><td className="p-3 text-xs">{r.lecturer_name || '—'}</td><td className="p-3 text-xs">{r.status || 'Recorded'}</td><td className="p-3 text-[10px] text-slate-500">{new Date(r.created_at).toLocaleString()}</td><td className="p-3"><button type="button" disabled={workingId==='delete:'+r.attendance_id} onClick={()=>runDelete('attendance',r.attendance_id,r.student_name+' · '+r.course,()=>db.adminDeleteAttendance(r.attendance_id))} className="text-rose-600 hover:text-rose-700 text-xs font-bold inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td></tr>)}</tbody></table>{visibleRecentAttendance.length===0 && <p className="py-6 text-center text-xs text-slate-500">{recentAttendance.length ? 'No attendance records match your search.' : 'No attendance records returned.'}</p>}</div>
          </section>
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div><h2 className="font-extrabold text-slate-900 dark:text-white">Attendance sessions</h2></div>
            <div className="space-y-2">{recentSessions.map((s:any)=><article key={s.session_id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"><div className="min-w-0"><strong className="block text-xs text-slate-800 dark:text-white">{s.title || s.course}</strong><p className="text-[10px] text-slate-500 mt-1">{s.course} · {s.lecturer_name || 'Unknown lecturer'} · {s.attendance_count} check-ins</p><p className="text-[10px] text-slate-400">{new Date(s.created_at).toLocaleString()}{s.ends_at ? ` · Ends ${new Date(s.ends_at).toLocaleString()}` : ''}</p></div><div className="flex items-center gap-3 shrink-0"><span className={`text-[10px] font-bold ${s.revoked || (s.ends_at && new Date(s.ends_at)<new Date()) ? 'text-slate-500' : 'text-emerald-600'}`}>{s.revoked ? 'Revoked' : s.ends_at && new Date(s.ends_at)<new Date() ? 'Expired' : 'Active'}</span><button type="button" disabled={workingId==='delete:'+s.session_id} onClick={()=>runDelete('session',s.session_id,s.title||s.course,()=>db.adminDeleteSession(s.session_id))} className="text-rose-600 hover:text-rose-700 text-xs font-bold inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/>Delete</button></div></article>)}{recentSessions.length===0 && <p className="py-6 text-center text-xs text-slate-500">No attendance sessions returned.</p>}</div>
          </section>
        </div>
      ) : tab === 'lecturers' ? (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-900 dark:text-white">Lecturer accounts</h2></div><div className="relative w-full sm:max-w-xs"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or course" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs" /></div></div>
          <div className="overflow-x-auto"><table className="w-full text-left min-w-[680px]"><thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-3">Lecturer</th><th className="p-3">Department</th><th className="p-3">Course</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{visibleLecturers.map((lecturer) => <tr key={lecturer.lecturer_id}><td className="p-3"><strong className="block text-xs text-slate-800 dark:text-white">{lecturer.name}</strong><span className="text-[10px] text-slate-500">{lecturer.email}</span></td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{lecturer.dept}</td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{lecturer.course}</td><td className="p-3">{lecturer.is_verified ? <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"><BadgeCheck className="w-4 h-4" />Verified</span> : <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"><AlertCircle className="w-4 h-4" />Pending</span>}</td><td className="p-3 text-right"><button disabled={workingId === lecturer.lecturer_id} onClick={() => changeVerification(lecturer)} className={`px-3 py-2 rounded-lg text-[10px] font-extrabold disabled:opacity-50 ${lecturer.is_verified ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900' : 'bg-emerald-900 text-amber-300 border border-emerald-700'}`}>{workingId === lecturer.lecturer_id ? 'Saving…' : lecturer.is_verified ? 'Withdraw access' : 'Verify lecturer'}</button><button type="button" disabled={workingId==='delete:'+lecturer.lecturer_id} onClick={()=>runDelete("lecturer",lecturer.lecturer_id,lecturer.name,()=>db.adminDeleteLecturer(lecturer.lecturer_id))} className="ml-2 px-2 py-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40" title="Delete lecturer account"><Trash2 className="w-4 h-4"/></button></td></tr>)}</tbody></table>{visibleLecturers.length === 0 && <p className="py-8 text-center text-xs text-slate-500">No lecturer accounts match that search.</p>}</div>
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
            <div><h3 className="font-extrabold text-sm text-slate-900 dark:text-white">Lecturer course assignments</h3></div>
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
            <div><h2 className="font-extrabold text-slate-900 dark:text-white">{announcementForm.id ? 'Edit announcement' : 'Compose announcement'}</h2></div>
            {announcementForm.id && <div className="flex items-center justify-between rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 text-[11px] text-amber-800 dark:text-amber-200"><span>Editing selected announcement</span><button type="button" onClick={resetAnnouncementForm} className="font-bold underline">Cancel</button></div>}
            <div className="space-y-3">
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Title</span><input maxLength={120} value={announcementForm.title} onChange={e=>setAnnouncementForm({...announcementForm,title:e.target.value})} placeholder="e.g. Semester attendance policy update" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Message</span><textarea maxLength={5000} rows={7} value={announcementForm.body} onChange={e=>setAnnouncementForm({...announcementForm,body:e.target.value})} placeholder="Write the announcement details…" className="mt-1 w-full resize-y rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"/></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Audience</span><select value={announcementForm.audienceType} onChange={e=>setAnnouncementForm({...announcementForm,audienceType:e.target.value,departmentId:'',courseId:'',studentUserId:''})} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm">
                <option value="all_staff">All staff (administrators and lecturers)</option><option value="all_lecturers">All verified lecturers</option><option value="all_students">All students</option><option value="department_students">Students in a department</option><option value="individual_student">A particular student</option><option value="department">Lecturers in one department</option><option value="course">Lecturers assigned to one course</option>
              </select></label>
              {['department','department_students'].includes(announcementForm.audienceType) && <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Department</span><select value={announcementForm.departmentId} onChange={e=>setAnnouncementForm({...announcementForm,departmentId:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"><option value="">Choose department</option>{departments.filter(d=>d.is_active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><span className="text-[10px] text-slate-500">{announcementForm.audienceType==='department_students'?'All non-rejected student accounts in this department will receive it.':'Only verified lecturers assigned to courses in this department will receive it.'}</span></label>}
              {announcementForm.audienceType === 'course' && <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Course</span><select value={announcementForm.courseId} onChange={e=>setAnnouncementForm({...announcementForm,courseId:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"><option value="">Choose course</option>{catalogCourses.filter(c=>c.is_active).map(c=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select></label>}
              {announcementForm.audienceType === 'individual_student' && <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student account</span><select value={announcementForm.studentUserId} onChange={e=>setAnnouncementForm({...announcementForm,studentUserId:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm"><option value="">Choose a student account</option>{studentAccounts.filter(a=>a.status!=='rejected').map(a=><option key={a.user_id} value={a.user_id}>{a.full_name} · {a.student_id}</option>)}</select></label>}
              <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 p-3 text-[10px] text-emerald-900 dark:text-emerald-200">
                {announcementForm.audienceType==='all_staff'?'Recipients: all administrator and lecturer accounts, including unverified lecturers.':
                 announcementForm.audienceType==='all_students'?'Recipients: ' + studentAccounts.filter(a=>a.status!=='rejected').length + ' active student account(s).':
                 announcementForm.audienceType==='department_students'?'Recipients: ' + studentAccounts.filter(a=>a.status!=='rejected' && departments.find(d=>d.id===announcementForm.departmentId)?.name?.trim().toLowerCase()===String(a.department||'').trim().toLowerCase()).length + ' active student account(s) in the selected department.':
                 announcementForm.audienceType==='individual_student'?'Recipients: only the selected student account.':
                 announcementForm.audienceType==='all_lecturers'?'Recipients: all verified lecturers.':
                 announcementForm.audienceType==='department'?'Recipients: verified lecturers assigned to courses in the selected department.':
                 'Recipients: verified lecturers assigned to the selected course.'}
              </div>
              <p className="text-[10px] text-slate-500">Maximum 120 characters in the title and 5,000 in the message. Notifications are delivered inside each recipient's CampusSign account.</p>
              <div className="flex flex-col sm:flex-row gap-2"><button type="button" disabled={workingId==='announcement' || !announcementForm.title.trim() || !announcementForm.body.trim() || (['department','department_students'].includes(announcementForm.audienceType) && !announcementForm.departmentId) || (announcementForm.audienceType==='course' && !announcementForm.courseId) || (announcementForm.audienceType==='individual_student' && !announcementForm.studentUserId)} onClick={()=>saveAnnouncement(false)} className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40">Save draft</button><button type="button" disabled={workingId==='announcement' || !announcementForm.title.trim() || !announcementForm.body.trim() || (['department','department_students'].includes(announcementForm.audienceType) && !announcementForm.departmentId) || (announcementForm.audienceType==='course' && !announcementForm.courseId) || (announcementForm.audienceType==='individual_student' && !announcementForm.studentUserId)} onClick={()=>saveAnnouncement(true)} className="flex-1 rounded-xl bg-emerald-900 px-4 py-3 text-xs font-bold text-amber-300 disabled:opacity-40">{workingId==='announcement' ? 'Publishing…' : 'Publish announcement'}</button></div>
            </div>
          </section>
          <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2"><div><h2 className="font-extrabold text-slate-900 dark:text-white">Announcement history</h2></div><button type="button" onClick={()=>refresh(false)} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2" aria-label="Refresh announcements"><RefreshCw className="w-4 h-4"/></button></div>
            {announcements.length===0 ? <p className="py-10 text-center text-xs text-slate-500">No announcements yet. Compose one to get started.</p> : <div className="space-y-3">{announcements.map((item:any)=><article key={item.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-2"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="text-sm font-extrabold text-slate-900 dark:text-white break-words">{item.title}</h3><p className="text-[10px] text-slate-500 mt-1">{item.audience_type==='all_staff'?'All staff':item.audience_type==='all_lecturers'?'All verified lecturers':item.audience_type==='all_students'?'All students':item.audience_type==='department_students'?'Students · ' + (departments.find(d=>d.id===item.department_id)?.name || 'Selected department'):item.audience_type==='individual_student'?'One student · ' + (studentAccounts.find(a=>a.user_id===item.student_user_id)?.full_name || 'Account removed'):item.audience_type==='department'?(departments.find(d=>d.id===item.department_id)?.name || 'Selected department'):(catalogCourses.find(c=>c.id===item.course_id)?.code || 'Selected course')} · Updated {new Date(item.updated_at).toLocaleString()}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${item.status==='published'?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{item.status==='published'?'Published':'Draft'}</span></div><p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap line-clamp-4">{item.body}</p>{item.status==='published' && <div className="flex gap-4 text-[10px] text-slate-500"><span>{item.recipient_count} delivered</span><span>{item.read_count} read</span></div>}<div className="flex flex-wrap gap-2 pt-1"><button type="button" onClick={()=>editAnnouncement(item)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-200"><Pencil className="w-3 h-3 inline mr-1"/>Edit</button><button type="button" disabled={workingId==='announcement-delete'} onClick={()=>removeAnnouncement(item)} className="rounded-lg border border-rose-200 dark:border-rose-900 px-3 py-2 text-[10px] font-bold text-rose-700 dark:text-rose-300"><Trash2 className="w-3 h-3 inline mr-1"/>Delete</button></div></article>)}</div>}
          </section>
        </div>
      ) : tab === 'branding' ? (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
          <section className="rounded-3xl p-5 sm:p-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div><p className="text-[10px] uppercase tracking-[.2em] font-black text-emerald-700 dark:text-emerald-300">Campus identity</p><h2 className="text-xl font-black mt-1 text-slate-900 dark:text-white">Branding studio</h2><p className="text-xs text-slate-500 mt-2">Set the shared institution identity, then customise the Student and Staff workspaces independently.</p></div>
            {brandingMessage && <p role="status" className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-800 dark:text-emerald-200">{brandingMessage}</p>}
            {brandingError && <p role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-200">{brandingError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Brand name<input value={branding.brand_name} maxLength={48} onChange={e=>setBranding({...branding,brand_name:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3"/></label>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Tagline<input value={branding.tagline} maxLength={100} onChange={e=>setBranding({...branding,tagline:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3"/></label>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Student app name<input value={branding.student_app_name} maxLength={48} onChange={e=>setBranding({...branding,student_app_name:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3"/></label>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Staff app name<input value={branding.staff_app_name} maxLength={64} onChange={e=>setBranding({...branding,staff_app_name:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3"/></label>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 sm:col-span-2">Student welcome message<textarea rows={2} maxLength={180} value={branding.student_welcome} onChange={e=>setBranding({...branding,student_welcome:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3"/></label>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 sm:col-span-2">Staff welcome message<textarea rows={2} maxLength={180} value={branding.staff_welcome} onChange={e=>setBranding({...branding,staff_welcome:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3"/></label>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Support email<input type="email" value={branding.support_email || ''} onChange={e=>setBranding({...branding,support_email:e.target.value})} placeholder="support@institution.edu" className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3"/></label>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">Institution default logo</h3>
              <p className="text-[11px] text-slate-500 mt-1">Used on shared pages and as a fallback when a workspace has no separate logo.</p>
              <div className="flex flex-wrap items-center gap-3 mt-3">{branding.logo_url && <img src={branding.logo_url} alt="Institution logo" className="w-12 h-12 object-contain rounded-lg bg-slate-50 p-1"/>}<label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-xs font-bold cursor-pointer hover:border-emerald-500"><ImagePlus className="w-4 h-4"/>{logoBusy?'Uploading…':'Upload institution logo'}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={logoBusy} onChange={e=>{uploadInstitutionLogo(e.target.files?.[0]);e.currentTarget.value='';}}/></label>{branding.logo_url && <button type="button" onClick={()=>setBranding({...branding,logo_url:null})} className="text-xs font-bold text-rose-600">Remove institution logo</button>}</div>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-4">
              <div><h3 className="font-extrabold text-sm text-slate-900 dark:text-white">Workspace appearance</h3><p className="text-[11px] text-slate-500 mt-1">Student and Staff now have independent colours and logos. Choose a workspace to customise it without changing the other.</p></div>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                <button type="button" onClick={()=>setBrandingWorkspace('student')} className={`rounded-lg px-3 py-2.5 text-xs font-extrabold ${brandingWorkspace==='student'?'bg-white dark:bg-slate-700 text-emerald-800 dark:text-white shadow':'text-slate-500'}`}>Student workspace</button>
                <button type="button" onClick={()=>setBrandingWorkspace('staff')} className={`rounded-lg px-3 py-2.5 text-xs font-extrabold ${brandingWorkspace==='staff'?'bg-white dark:bg-slate-700 text-emerald-800 dark:text-white shadow':'text-slate-500'}`}>Staff workspace</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[[workspacePrefix+'_primary_color','Primary colour'],[workspacePrefix+'_accent_color','Accent colour'],[workspacePrefix+'_background_color','Background colour']].map(([key,label]:any)=><label key={key} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 text-xs font-bold text-slate-600 dark:text-slate-300">{label}<div className="flex items-center gap-2 mt-2"><input type="color" value={branding[key] || '#064E3B'} onChange={e=>setBranding({...branding,[key]:e.target.value.toUpperCase()})} className="w-11 h-10 rounded-lg border-0 bg-transparent"/><input value={branding[key] || ''} maxLength={7} onChange={e=>setBranding({...branding,[key]:e.target.value.toUpperCase()})} className="min-w-0 w-full rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-2 font-mono"/></div></label>)}
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-xs font-extrabold text-slate-800 dark:text-white">{brandingWorkspace==='student'?'Student':'Staff'} logo</h4><p className="text-[11px] text-slate-500 mt-1">PNG, JPG or WebP · maximum 2 MB · falls back to institution logo if empty</p></div>
                  {workspaceLogo && <img src={workspaceLogo} alt={brandingWorkspace+' workspace logo'} className="w-12 h-12 object-contain rounded-lg bg-slate-50 p-1"/>}
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-3"><label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-xs font-bold cursor-pointer hover:border-emerald-500"><ImagePlus className="w-4 h-4"/>{logoBusy?'Uploading…':'Upload '+brandingWorkspace+' logo'}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={logoBusy} onChange={e=>{uploadBrandLogo(e.target.files?.[0],brandingWorkspace);e.currentTarget.value='';}}/></label>{branding[workspacePrefix+'_logo_url'] && <button type="button" onClick={()=>setBranding({...branding,[workspacePrefix+'_logo_url']:null})} className="text-xs font-bold text-rose-600">Use institution logo</button>}</div>
              </div>
            </div>
            <button type="button" onClick={saveBranding} disabled={brandingBusy || logoBusy} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-900 px-6 py-3.5 text-xs font-extrabold text-amber-300 disabled:opacity-50"><Save className="w-4 h-4"/>{brandingBusy?'Saving…':'Save branding changes'}</button>
          </section>
          <aside className="rounded-3xl p-5 bg-slate-950 text-white border border-slate-800 shadow-lg h-fit"><p className="text-[10px] uppercase tracking-[.2em] font-black text-emerald-300">Live preview</p><div className="mt-4 rounded-xl border px-3 py-3 flex items-center gap-2" style={{background:branding[workspacePrefix+'_background_color'],color:branding[workspacePrefix+'_primary_color'],borderColor:branding[workspacePrefix+'_primary_color'] + '30'}}>{workspaceLogo?<img src={workspaceLogo} alt="Brand mark" className="w-8 h-8 object-contain"/>:<div className="w-8 h-8 rounded-lg border-2" style={{borderColor:branding[workspacePrefix+'_accent_color']}}/>}<div className="min-w-0"><strong className="block text-xs font-black truncate">{branding.brand_name || 'Your institution'}</strong><span className="block text-[9px] font-bold tracking-wider opacity-70">{brandingWorkspace.toUpperCase()} SPACE · TOP BAR</span></div></div><div className="mt-5 rounded-2xl p-5" style={{background:branding[workspacePrefix+'_primary_color']}}><div className="w-14 h-14 rounded-2xl bg-white/10 p-2">{workspaceLogo?<img src={workspaceLogo} alt="Brand logo preview" className="w-full h-full object-contain"/>:<div className="w-full h-full rounded-xl border-2" style={{borderColor:branding[workspacePrefix+'_accent_color']}}/>}</div><p className="mt-4 text-xs uppercase tracking-wider opacity-70">{branding.brand_name || 'Your institution'}</p><h3 className="text-2xl font-black mt-1">{brandingWorkspace==='student' ? (branding.student_app_name || 'Student app') : (branding.staff_app_name || 'Staff app')}</h3><p className="text-xs mt-2 opacity-80">{brandingWorkspace==='student' ? branding.student_welcome : branding.staff_welcome}</p><span className="inline-block mt-5 rounded-xl px-4 py-2 text-xs font-extrabold" style={{background:branding[workspacePrefix+'_accent_color'],color:branding[workspacePrefix+'_primary_color']}}>{brandingWorkspace==='student' ? 'Student check-in' : 'Staff workspace'}</span></div><p className="text-[11px] text-slate-400 mt-4">Preview only. Workspace-specific colours and logos apply only to the selected workspace.</p></aside>
        </div>
      ) : tab === 'audit' ? (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"><div className="mb-4"><h2 className="font-extrabold text-slate-900 dark:text-white">Audit history</h2></div>
          {audit.length === 0 ? <p className="py-10 text-center text-xs text-slate-500">No audit events recorded yet. New sensitive actions will appear here.</p> : <div className="space-y-2">{audit.map((event) => <article key={event.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1"><strong className="text-xs text-slate-800 dark:text-slate-100">{String(event.action).replace(/\./g, ' ')}</strong><time className="text-[10px] text-slate-500">{new Date(event.created_at).toLocaleString()}</time></div><p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{event.entity_type}{event.course ? ` · ${event.course}` : ''}{event.actor_email ? ` · by ${event.actor_email}` : ''}</p><pre className="mt-2 text-[10px] text-slate-500 whitespace-pre-wrap break-words">{JSON.stringify(event.details, null, 2)}</pre></article>)}</div>}
        </section>
      ) : (
        <section className="rounded-3xl p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="font-extrabold text-slate-900 dark:text-white">Section unavailable</h2>
          <p className="mt-2 text-xs text-slate-500">The selected admin section could not be recognised. Return to Overview and choose the section again.</p>
          <button type="button" onClick={() => setTab('overview')} className="mt-4 rounded-xl bg-emerald-900 px-4 py-2 text-xs font-bold text-white">Back to Overview</button>
        </section>
      )}
      
    </div>
  );
}
