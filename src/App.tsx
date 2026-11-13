import React, { useState, useEffect, useRef } from 'react';
import { 
  QrCode, 
  UserCheck, 
  ShieldAlert, 
  RefreshCw, 
  Lock, 
  Download, 
  Maximize2, 
  Minimize2, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Camera, 
  Award, 
  Database, 
  ExternalLink, 
  Users, 
  FileCheck, 
  Scan, 
  Building, 
  Key, 
  UserPlus, 
  Trash2, 
  ShieldCheck, 
  LogOut,
  BookOpen,
  ArrowRight,
  Pencil,
  ClipboardList,
  Check,
  X,
  Sparkles,
  Clock3,
  MonitorUp,
  Sun,
  Moon
} from 'lucide-react';
import { buildCheckin, parseCheckin, currentSlot, secondsUntilNextSlot, DEFAULT_QR_INTERVAL_SECONDS, QR_GRACE_SECONDS } from './checkin';
import { downloadCsv } from './auth';
import { supabase } from './supabase';
import { QRCodeImage, QRScanner, FaceCapture } from './CameraParts';
import * as db from './db';
import { getBestFix } from './geo';
import { QR_DISPLAY_CHANNEL } from './QRDisplayWindow';
import AdminWorkspace, { NotificationBell } from './AdminWorkspace';

/* ==========================================================================
   LOGO COMPONENT (Matching Forest Green & Academic Gold Emblem)
   ========================================================================== */
function CampusSignLogo({ className = "w-10 h-10" }) {
  return (
    <svg className={className} viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path 
        d="M250 40 C340 40 430 80 430 80 V260 C430 360 330 430 250 460 C170 430 70 360 70 260 V80 C70 80 160 40 250 40 Z" 
        fill="#064e3b" 
        stroke="#f59e0b" 
        strokeWidth="12"
      />
      <path 
        d="M250 85 L263 125 H305 L271 150 L284 190 L250 165 L216 190 L229 150 L195 125 H237 Z" 
        fill="#f59e0b" 
      />
      <g stroke="#f59e0b" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M140 180 Q250 200 250 330 Q250 200 360 180 V320 Q250 340 250 340 Q250 340 140 320 Z" />
        <rect x="170" y="210" width="30" height="30" fill="#f59e0b" />
        <rect x="300" y="210" width="30" height="30" fill="#f59e0b" />
        <line x1="170" y1="260" x2="220" y2="260" />
        <line x1="170" y1="280" x2="220" y2="280" />
        <line x1="280" y1="260" x2="330" y2="260" />
        <line x1="280" y1="280" x2="330" y2="280" />
      </g>
    </svg>
  );
}

/* ==========================================================================
   INITIAL MOCK DATASETS & ACCOUNTS
   ========================================================================== */

// 2 Registered Admin / Lecturer Accounts
const INITIAL_STAFF = [
  {
    id: 'LEC001',
    name: 'Dr. Robert Vance',
    email: 'admin@university.edu',
    passwordHash: 'e1756a9fc05bc2b263b7b2a383bec14600498ca814b9eb83a6670d89a79265fe',
    dept: 'Computer Science',
    course: 'CSC401 - Advanced Algorithms',
    isVerified: true
  },
  {
    id: 'LEC002',
    name: 'Prof. Sarah Jenkins',
    email: 'jenkins@university.edu',
    passwordHash: '519a21b75f53120434130100db0fe86921a10309d605efd6d944546f915222c8',
    dept: 'Software Engineering',
    course: 'ENG301 - Software Architecture',
    isVerified: true
  }
];

// Initial Course-Isolated Student Rosters
const INITIAL_STUDENTS = [
  // CSC401 Students (Dr. Robert Vance)
  { id: 'STU001', name: 'Alexander Wright', dept: 'Computer Science', level: '400', course: 'CSC401 - Advanced Algorithms' },
  { id: 'STU003', name: 'Catherine Brooks', dept: 'Computer Science', level: '400', course: 'CSC401 - Advanced Algorithms' },
  { id: 'STU005', name: 'Ethan Hunt', dept: 'Computer Science', level: '300', course: 'CSC401 - Advanced Algorithms' },
  { id: 'STU007', name: 'George Miller', dept: 'Computer Science', level: '400', course: 'CSC401 - Advanced Algorithms' },
  { id: 'STU009', name: 'Ian Fleming', dept: 'Computer Science', level: '300', course: 'CSC401 - Advanced Algorithms' },
  { id: 'STU011', name: 'Kevin Spacey', dept: 'Computer Science', level: '400', course: 'CSC401 - Advanced Algorithms' },
  { id: 'STU013', name: 'Michael Jordan', dept: 'Computer Science', level: '400', course: 'CSC401 - Advanced Algorithms' },
  { id: 'STU015', name: 'Oliver Twist', dept: 'Computer Science', level: '300', course: 'CSC401 - Advanced Algorithms' },
  { id: 'STU017', name: 'Quentin Tarantino', dept: 'Computer Science', level: '400', course: 'CSC401 - Advanced Algorithms' },
  { id: 'STU019', name: 'Steven Spielberg', dept: 'Computer Science', level: '400', course: 'CSC401 - Advanced Algorithms' },

  // ENG301 Students (Prof. Sarah Jenkins)
  { id: 'STU002', name: 'Beatrice Vance', dept: 'Software Engineering', level: '300', course: 'ENG301 - Software Architecture' },
  { id: 'STU004', name: 'Daniel Craig', dept: 'Software Engineering', level: '300', course: 'ENG301 - Software Architecture' },
  { id: 'STU006', name: 'Fiona Gallagher', dept: 'Software Engineering', level: '300', course: 'ENG301 - Software Architecture' },
  { id: 'STU008', name: 'Hannah Montana', dept: 'Software Engineering', level: '200', course: 'ENG301 - Software Architecture' },
  { id: 'STU010', name: 'Julia Roberts', dept: 'Software Engineering', level: '300', course: 'ENG301 - Software Architecture' },
  { id: 'STU012', name: 'Laura Croft', dept: 'Software Engineering', level: '200', course: 'ENG301 - Software Architecture' },
  { id: 'STU014', name: 'Natalie Portman', dept: 'Software Engineering', level: '300', course: 'ENG301 - Software Architecture' },
  { id: 'STU016', name: 'Penelope Cruz', dept: 'Software Engineering', level: '200', course: 'ENG301 - Software Architecture' },
  { id: 'STU018', name: 'Rachel Green', dept: 'Software Engineering', level: '300', course: 'ENG301 - Software Architecture' },
  { id: 'STU020', name: 'Tina Fey', dept: 'Software Engineering', level: '300', course: 'ENG301 - Software Architecture' },
];

/* ==========================================================================
   MAIN APP COMPONENT
   ========================================================================== */
const FIELD = 'w-full px-3.5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-base sm:text-sm font-semibold focus:ring-2 focus:ring-emerald-600 outline-none';
const LABEL = 'block font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider text-[10px]';
const CHIP = 'px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold';
const STRICTNESS = { lenient: 0.58, standard: 0.5, strict: 0.42 };

const LOC_LABEL = {
  outside: 'Not present in class',
  uncertain: 'Location unconfirmed',
  unavailable: 'Location unavailable'
};

function formatQrInterval(seconds) {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('admin'); // 'admin' | 'student' | 'docs'
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('campussign-theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  });

  // Remember the user's theme preference between visits.
  useEffect(() => {
    try { localStorage.setItem('campussign-theme', isDarkMode ? 'dark' : 'light'); } catch { /* storage may be unavailable */ }
  }, [isDarkMode]);

  // System Core State
  const [staffAccounts, setStaffAccounts] = useState(INITIAL_STAFF);
  const [activeStaff, setActiveStaff] = useState(INITIAL_STAFF[0]); // Default Dr. Vance
  const [studentRegistry, setStudentRegistry] = useState([]);

  // Active Verification Session State
  const [activeSession, setActiveSession] = useState({
    id: 'SESS-8921',
    title: 'CSC401 Final Examination',
    course: 'CSC401 - Advanced Algorithms',
    venue: 'Auditorium Hall B',
    teacher: 'Dr. Robert Vance',
    teacherId: 'LEC001',
    teacherEmail: 'admin@university.edu',
    secret: '',
    isRevoked: false,
    qrIntervalSeconds: DEFAULT_QR_INTERVAL_SECONDS,
    tokenCreatedAt: Date.now()
  });

  // Per-session QR lifetime: 30s by default, or static until the lecturer closes the session.
  const [qrToken, setQrToken] = useState('');
  const [qrPayload, setQrPayload] = useState('');
  const [secondsToRotate, setSecondsToRotate] = useState(30);

  // Result of the last QR scan on this device (signed, time-limited check-in session)
  const [checkin, setCheckin] = useState(null);
  const [checkinError, setCheckinError] = useState('');

  // Attendance Records Log
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  // Lockouts State
  const [lockedOutStudents, setLockedOutStudents] = useState([]);

  // Build the signed QR according to this session's selected lifetime.
  // A 0-second interval means one static QR, invalidated only when the session closes.
  useEffect(() => {
    let cancelled = false;
    let lastSlot = -1;
    setQrPayload('');
    setQrToken('');
    const intervalSeconds = Number(activeSession.qrIntervalSeconds ?? DEFAULT_QR_INTERVAL_SECONDS);
    const tick = async () => {
      const slot = currentSlot(Date.now(), intervalSeconds);
      setSecondsToRotate(secondsUntilNextSlot(Date.now(), intervalSeconds));
      if (slot !== lastSlot) {
        lastSlot = slot;
        if (!activeSession.secret) {
          setQrPayload('');
          setQrToken('');
          return;
        }
        try {
          const { url, token } = await buildCheckin(
            { id: activeSession.id, secret: activeSession.secret },
            intervalSeconds
          );
          if (!cancelled) {
            setQrPayload(url);
            setQrToken(token);
          }
        } catch (e) {
          console.error('Could not build QR code', e);
        }
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeSession.id, activeSession.secret, activeSession.qrIntervalSeconds]);

  // Validate a scanned QR (from the in-app scanner or a phone's camera app)
  const handleQrScanned = async (raw) => {
    const parsed = await parseCheckin(raw);
    if (parsed.ok === false) {
      setCheckinError(parsed.message);
      return parsed;
    }
    try {
      // The server verifies the signature and freshness, then returns a 10-minute ticket
      const info = await db.sessionInfo(parsed.code);
      setCheckin({
        session: {
          id: parsed.code.i, course: info.course, teacher: info.teacher, title: info.title,
          faceRequired: info.face_required, locationMode: info.location_mode, radius: info.radius_m
        },
        ticket: { exp: info.exp, sig: info.ticket },
        validatedAt: Date.now()
      });
      setCheckinError('');
      return { ok: true };
    } catch (e) {
      const message = db.friendly(e);
      setCheckinError(message);
      return { ok: false, message };
    }
  };

  // If the site was opened by scanning the QR with a phone's normal camera app
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('checkin')) return;
    const link = window.location.href;
    window.history.replaceState({}, '', window.location.pathname);
    setActiveTab('student');
    handleQrScanned(link);
  }, []);

  // Admin shortcut: run this QR through the student check-in on the same device
  const handleSimulateScan = async () => {
    await handleQrScanned(qrPayload);
    setActiveTab('student');
  };

  return (
    <div className={`campus-app-shell min-h-screen ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} transition-colors duration-200 font-sans`}>
      
      {/* HEADER / NAVIGATION BAR */}
      <header className="sticky top-0 z-40 bg-emerald-950/90 backdrop-blur-md border-b border-emerald-900 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
          
          {/* Logo & Brand Name */}
          <div className="flex items-center gap-3">
            <CampusSignLogo className="w-9 h-9" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-white text-lg tracking-tight">CampusSign</span>
                <span className="hidden sm:inline-block bg-amber-500 text-emerald-950 font-extrabold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                  SECURE ATTENDANCE
                </span>
              </div>
              <p className="hidden sm:block text-[10px] text-emerald-200 font-medium">QR Biometric Student Verification System</p>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-2 sm:gap-4">
            
            {/* Mode Switcher Buttons */}
            <div className="bg-emerald-900/80 p-1 rounded-xl border border-emerald-800 flex items-center">
              <button
                onClick={() => setActiveTab('admin')}
                aria-pressed={activeTab === 'admin'}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'admin'
                    ? 'bg-amber-500 text-emerald-950 shadow-md'
                    : 'text-emerald-200 hover:text-white'
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lecturer Portal</span>
              </button>

              <button
                onClick={() => setActiveTab('student')}
                aria-pressed={activeTab === 'student'}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'student'
                    ? 'bg-amber-500 text-emerald-950 shadow-md'
                    : 'text-emerald-200 hover:text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Student Portal</span>
              </button>

              <button
                onClick={() => setActiveTab('docs')}
                aria-pressed={activeTab === 'docs'}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'docs'
                    ? 'bg-amber-500 text-emerald-950 shadow-md'
                    : 'text-emerald-200 hover:text-white'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Docs</span>
              </button>
            </div>

            {/* Dark / Light Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="theme-toggle p-2 text-emerald-200 hover:text-amber-400 bg-emerald-900/50 hover:bg-emerald-900 border border-emerald-800 rounded-xl transition-colors"
              title={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-pressed={isDarkMode}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

          </div>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main key={activeTab} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 page-enter" aria-live="polite">
        {activeTab === 'admin' && (
          <AdminPortal 
            activeSession={activeSession}
            setActiveSession={setActiveSession}
            qrToken={qrToken}
            qrPayload={qrPayload}
            secondsToRotate={secondsToRotate}
            attendanceLogs={attendanceLogs}
            setAttendanceLogs={setAttendanceLogs}
            lockedOutStudents={lockedOutStudents}
            studentRegistry={studentRegistry}
            setStudentRegistry={setStudentRegistry}
            staffAccounts={staffAccounts}
            setStaffAccounts={setStaffAccounts}
            activeStaff={activeStaff}
            setActiveStaff={setActiveStaff}
            onSimulateScan={handleSimulateScan}
            isDarkMode={isDarkMode}
          />
        )}

        {activeTab === 'student' && (
          <StudentPortal 
            activeSession={activeSession}
            checkin={checkin}
            checkinError={checkinError}
            onQrScanned={handleQrScanned}
            attendanceLogs={attendanceLogs}
            setAttendanceLogs={setAttendanceLogs}
            lockedOutStudents={lockedOutStudents}
            setLockedOutStudents={setLockedOutStudents}
            studentRegistry={studentRegistry}
            isDarkMode={isDarkMode}
          />
        )}

        {activeTab === 'docs' && (
          <DocumentationView isDarkMode={isDarkMode} />
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 mt-12 text-center text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <CampusSignLogo className="w-5 h-5" />
            <span className="font-bold text-slate-700 dark:text-slate-300">CampusSign Verification Hub</span>
          </div>
          <p>© 2026 CampusSign · QR attendance and biometric verification</p>
        </div>
      </footer>

    </div>
  );
}

/* ==========================================================================
   ADMIN PORTAL COMPONENT
   ========================================================================== */
function AdminPortal({ 
  activeSession, 
  setActiveSession, 
  qrToken, 
  qrPayload,
  secondsToRotate, 
  attendanceLogs, 
  setAttendanceLogs,
  lockedOutStudents,
  studentRegistry,
  setStudentRegistry,
  staffAccounts,
  setStaffAccounts,
  activeStaff,
  setActiveStaff,
  onSimulateScan,
  isDarkMode 
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [staffIdInput, setStaffIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [failedLogins, setFailedLogins] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [loginError, setLoginError] = useState('');
  const [assignedCourses, setAssignedCourses] = useState<any[]>([]);
  const [isFullscreenQR, setIsFullscreenQR] = useState(false);
  const [displayWindowOpen, setDisplayWindowOpen] = useState(false);
  const displayChannelRef = useRef<BroadcastChannel | null>(null);
  const displaySnapshotRef = useRef<any>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [sessionList, setSessionList] = useState([]);
  const [viewSessionId, setViewSessionId] = useState('');
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [retentionDays, setRetentionDays] = useState(30);
  const [enrollmentRequests, setEnrollmentRequests] = useState([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [reviewingRequestId, setReviewingRequestId] = useState('');
  const [editingLog, setEditingLog] = useState(null);
  const [editAttendanceForm, setEditAttendanceForm] = useState({ studentName: '', dept: '', status: 'Verified' });

  const [adminTab, setAdminTab] = useState('roster'); // 'roster' | 'registry' | 'requests'

  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [newStudentForm, setNewStudentForm] = useState({
    id: '',
    name: '',
    dept: 'Computer Science',
    level: '300',
    course: activeStaff ? activeStaff.course : ''
  });
  const [registrySearch, setRegistrySearch] = useState('');

  // Face enrollment (templates are stored on the server)
  const enrolledIds = studentRegistry.filter(st => st.faceEnrolled).map(st => String(st.id).toUpperCase());
  const [enrollTarget, setEnrollTarget] = useState(null);
  const [enrollSaved, setEnrollSaved] = useState(false);

  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newStaffForm, setNewStaffForm] = useState({
    name: '',
    email: '',
    password: '',
    dept: '',
    course: ''
  });
  const [academicDepartments, setAcademicDepartments] = useState<any[]>([]);
  const [academicCourses, setAcademicCourses] = useState<any[]>([]);
  const [newStaffCourses, setNewStaffCourses] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([db.loadCatalogDepartments(), db.loadCatalogCourses(null)])
      .then(([departments, courses]) => { if (!cancelled) { setAcademicDepartments(departments); setAcademicCourses(courses); } })
      .catch(() => { /* The legacy sign-in flow remains usable if catalogue is unavailable. */ });
    return () => { cancelled = true; };
  }, []);

  const [sessionForm, setSessionForm] = useState({
    title: '',
    course: activeStaff ? activeStaff.course : '',
    venue: '',
    faceRequired: true,
    strictness: 'standard',
    locationMode: 'flag',
    radius: 15,
    duration: 0,
    qrIntervalSeconds: String(DEFAULT_QR_INTERVAL_SECONDS),
  });

  useEffect(() => {
    if (activeStaff) {
      setSessionForm(prev => ({ ...prev, course: activeStaff.course }));
    }
  }, [activeStaff]);

  // Turn a Supabase profile row into the staff object the dashboard uses
  const refreshSessions = async () => {
    try { setSessionList(await db.loadSessions()); } catch (e) { console.error(e); }
  };

  // Start a brand-new session (with its own, empty attendance list)
  const beginSession = async (admin, f) => {
    const base = {
      title: f.title, course: admin.course, venue: f.venue,
      teacher: admin.name, teacherId: admin.id, teacherEmail: admin.email,
      isRevoked: false, tokenCreatedAt: Date.now(), anchorAcc: null, anchorSetAt: null,
      locationMode: f.locationMode, radius: f.radius, faceRequired: f.faceRequired,
      qrIntervalSeconds: f.qrIntervalSeconds,
      endsAt: f.durationMin ? Date.now() + f.durationMin * 60000 : null
    };
    try {
      // starting a new session ends the previous one
      if (activeSession.id && !activeSession.isRevoked) {
        try { await db.setRevoked(activeSession.id, true); } catch (e) { console.error(e); }
      }
      const row = await db.createSession({
        course: admin.course, title: f.title, venue: f.venue, locationMode: f.locationMode,
        radius: f.radius, faceRequired: f.faceRequired, threshold: f.threshold, endsAt: base.endsAt,
        qrIntervalSeconds: f.qrIntervalSeconds
      });
      setActiveSession(prev => ({ ...prev, ...base, id: row.id, secret: row.secret }));
      setViewSessionId('');
      await refreshSessions();
      return true;
    } catch (e) {
      alert('Could not start the session: ' + db.friendly(e));
      return false;
    }
  };

  const refreshRegistry = async () => {
    try { setStudentRegistry(await db.loadStudents()); } catch (e) { console.error(e); }
  };
  const refreshLogs = async () => {
    try { setAttendanceLogs(await db.loadAttendance()); } catch (e) { console.error(e); }
  };
  const refreshEnrollmentRequests = async () => {
    try { setEnrollmentRequests(await db.loadEnrollmentRequests()); } catch (e) { console.error(e); }
  };
  const refreshNotifications = async () => {
    try { setNotifications(await db.loadNotifications(20)); } catch (e) { console.error('Could not load notifications', e); }
  };
  const handleReadNotification = async (id: string) => {
    try { await db.markNotificationRead(id); await refreshNotifications(); }
    catch (e) { console.error('Could not update notification', e); }
  };
  const handleReadAllNotifications = async () => {
    try { await db.markAllNotificationsRead(); await refreshNotifications(); }
    catch (e) { console.error('Could not update notifications', e); }
  };

  // Load the roster + attendance once signed in, then refresh attendance every 5 seconds
  useEffect(() => {
    if (!isAuthenticated || !activeStaff?.isVerified) return;
    refreshRegistry();
    refreshLogs();
    refreshSessions();
    refreshEnrollmentRequests();
    refreshNotifications();
    const t = setInterval(() => { refreshLogs(); refreshSessions(); refreshEnrollmentRequests(); }, 7000);
    const n = setInterval(refreshNotifications, 20000);
    return () => { clearInterval(t); clearInterval(n); };
    // eslint-disable-next-line
  }, [isAuthenticated, activeStaff?.isVerified]);

  useEffect(() => {
    if (!isAuthenticated || !activeStaff?.isVerified || activeStaff?.role === 'admin') { setAssignedCourses([]); return; }
    let cancelled = false;
    db.loadMyAssignedCourses().then(rows => { if (!cancelled) setAssignedCourses(rows); }).catch(err => console.warn('Could not load assigned courses', err));
    return () => { cancelled = true; };
  }, [isAuthenticated, activeStaff?.id, activeStaff?.isVerified, activeStaff?.role]);

  const switchLecturerCourse = async (course: string) => {
    if (!course || !activeStaff || course === activeStaff.course) return;
    setActiveStaff({ ...activeStaff, course });
    setActiveSession(prev => ({ ...prev, id: '', secret: '', title: '', course, teacher: activeStaff.name, teacherId: activeStaff.id, teacherEmail: activeStaff.email, isRevoked: false, endsAt: null }));
    try {
      const last = await db.latestSession(course);
      const live = last && !last.revoked && (!last.ends_at || new Date(last.ends_at).getTime() > Date.now());
      if (live) setActiveSession(prev => ({ ...prev, id:last.id, secret:last.secret, title:last.title, course, venue:last.venue, teacher:activeStaff.name, teacherId:activeStaff.id, teacherEmail:activeStaff.email, isRevoked:false, anchorAcc:last.anchor_acc, anchorSetAt:last.anchor_set_at ? new Date(last.anchor_set_at).getTime() : null, locationMode:last.location_mode, radius:last.radius_m, faceRequired:last.face_required, qrIntervalSeconds:Number(last.qr_interval_seconds ?? DEFAULT_QR_INTERVAL_SECONDS), endsAt:last.ends_at ? new Date(last.ends_at).getTime() : null, tokenCreatedAt:Date.now() }));
    } catch (err) { console.warn('Could not resume course session', err); }
    await refreshRegistry(); await refreshLogs(); await refreshSessions(); await refreshEnrollmentRequests();
  };

  // Turn a Supabase profile row into the staff object the dashboard uses
  const startStaffSession = async (profile) => {
    const admin = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      dept: profile.dept,
      course: profile.course,
      isVerified: profile.is_verified,
      role: profile.role || 'lecturer'
    };
    setStaffAccounts(prev => prev.some(x => x.id === admin.id) ? prev : [...prev, admin]);
    setActiveStaff(admin);
    setIsAuthenticated(true);
    setLoginError('');
    if (!admin.isVerified) {
      setActiveSession(prev => ({ ...prev, id: '', secret: '', title: '', isRevoked: false, endsAt: null, course: admin.course, teacher: admin.name, teacherId: admin.id, teacherEmail: admin.email }));
      return;
    }
    // Resume a session that is still live; otherwise wait for the lecturer to start a new one
    try {
      const last = await db.latestSession(admin.course);
      const fresh = last && Date.now() - new Date(last.created_at).getTime() < 12 * 3600 * 1000;
      const notEnded = last && !last.revoked && (!last.ends_at || new Date(last.ends_at).getTime() > Date.now());
      if (last && fresh && notEnded) {
        setActiveSession(prev => ({
          ...prev,
          id: last.id,
          secret: last.secret,
          title: last.title,
          course: admin.course,
          venue: last.venue,
          teacher: admin.name,
          teacherId: admin.id,
          teacherEmail: admin.email,
          isRevoked: false,
          anchorAcc: last.anchor_acc,
          anchorSetAt: last.anchor_set_at ? new Date(last.anchor_set_at).getTime() : null,
          locationMode: last.location_mode,
          radius: last.radius_m,
          faceRequired: last.face_required,
          qrIntervalSeconds: Number(last.qr_interval_seconds ?? DEFAULT_QR_INTERVAL_SECONDS),
          endsAt: last.ends_at ? new Date(last.ends_at).getTime() : null,
          tokenCreatedAt: Date.now()
        }));
        return;
      }
    } catch (e) {
      console.error(e);
    }
    setActiveSession(prev => ({
      ...prev, id: '', secret: '', title: '', isRevoked: false, endsAt: null, anchorAcc: null, anchorSetAt: null,
      course: admin.course, teacher: admin.name, teacherId: admin.id, teacherEmail: admin.email
    }));
  };

  const loadProfile = async (userId) => {
    const { data, error } = await supabase.from('lecturers').select('*').eq('id', userId).maybeSingle();
    if (error) throw new Error('Profile error: ' + error.message);
    if (!data) throw new Error('No lecturer profile found. Run the latest supabase-setup.sql in Supabase, then sign in again.');
    return data;
  };

  // Stay signed in after a page refresh
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        try { startStaffSession(await loadProfile(data.session.user.id)); } catch { /* ignore */ }
      }
    });
    // eslint-disable-next-line
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (Date.now() < lockedUntil) {
      setLoginError(`Too many failed attempts. Try again in ${Math.ceil((lockedUntil - Date.now()) / 1000)} seconds.`);
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: staffIdInput.trim().toLowerCase(),
      password: passwordInput
    });
    if (error || !data.user) {
      const attempts = failedLogins + 1;
      setFailedLogins(attempts);
      if (attempts >= 5) {
        setLockedUntil(Date.now() + 60000);
        setFailedLogins(0);
        setLoginError('Too many failed attempts. Login is locked for 60 seconds.');
      } else {
        setLoginError(error?.message?.includes('not confirmed') ? 'Please confirm your email first (check your inbox).' : 'Invalid email or password.');
      }
      return;
    }
    setFailedLogins(0);
    setPasswordInput('');
    try {
      startStaffSession(await loadProfile(data.user.id));
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setStaffIdInput('');
    setPasswordInput('');
  };

  const handleRegisterStaff = async (e) => {
    e.preventDefault();
    if (!newStaffForm.email.trim() || !newStaffForm.name.trim()) return;
    if (!newStaffCourses.length) { alert('Select at least one course you teach.'); return; }
    if (newStaffForm.password.length < 8) {
      alert('Password must be at least 8 characters.');
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: newStaffForm.email.trim().toLowerCase(),
      password: newStaffForm.password,
      options: {
        data: {
          name: newStaffForm.name.trim(),
          dept: newStaffForm.dept.trim(),
          course: newStaffCourses[0],
          courses: newStaffCourses
        }
      }
    });
    if (error) {
      alert(error.message);
      return;
    }
    setNewStaffForm({ name: '', email: '', password: '', dept: '', course: '' });
    setNewStaffCourses([]);
    setIsAddStaffOpen(false);
    if (data.session) {
      try { startStaffSession(await loadProfile(data.user.id)); } catch (err) { alert(err.message); }
      alert('Account created. It is PENDING VERIFICATION by the administrator.');
    } else {
      alert('Account created. Check your email to confirm it, then sign in.');
    }
  };

  const handleSelectLecturer = (staffId) => {
    const selected = staffAccounts.find(s => s.id === staffId);
    if (selected) {
      setActiveStaff(selected);
      const newSessId = 'SESS-' + Math.floor(1000 + Math.random() * 9000);
      setActiveSession({
        ...activeSession,
        id: newSessId,
        title: `${selected.course} Attendance`,
        course: selected.course,
        teacher: selected.name,
        teacherId: selected.id,
        teacherEmail: selected.email,
        isRevoked: false,
        tokenCreatedAt: Date.now()
      });
    }
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    if (!sessionForm.title.trim()) {
      alert('Give the session a name, for example "Test attendance".');
      return;
    }
    const ok = await beginSession(activeStaff, {
      title: sessionForm.title.trim(),
      venue: sessionForm.venue.trim(),
      locationMode: sessionForm.locationMode,
      radius: Math.min(1000, Math.max(5, Number(sessionForm.radius) || 15)),
      faceRequired: sessionForm.faceRequired,
      threshold: STRICTNESS[sessionForm.strictness] || 0.5,
      durationMin: Number(sessionForm.duration) || 0,
      qrIntervalSeconds: Number(sessionForm.qrIntervalSeconds)
    });
    if (ok) {
      setShowSessionForm(false);
      setSessionForm(prev => ({ ...prev, title: '' }));
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentForm.id.trim() || !newStudentForm.name.trim()) return;
    const assignedCourse = newStudentForm.course || (activeStaff ? activeStaff.course : '');
    try {
      await db.addStudent({
        course: assignedCourse,
        id: newStudentForm.id.trim().toUpperCase(),
        name: newStudentForm.name.trim(),
        dept: newStudentForm.dept,
        level: newStudentForm.level
      });
    } catch (err) {
      alert(db.friendly(err));
      return;
    }
    await refreshRegistry();
    setNewStudentForm({ id: '', name: '', dept: 'Computer Science', level: '300', course: activeStaff ? activeStaff.course : '' });
    setIsAddStudentOpen(false);
  };

  const handleDeleteStudent = async (rowId, studentId, studentName) => {
    if (!window.confirm(`Delete ${studentName} (${studentId}) from this roster? Their enrolled face is deleted too.`)) return;
    try {
      await db.deleteStudent(rowId);
      await refreshRegistry();
    } catch (err) {
      alert(db.friendly(err));
    }
  };

  const handleReviewEnrollment = async (request, decision, overrideDuplicate = false) => {
    const action = decision === 'approve' ? 'approve' : 'reject';
    if (action === 'reject' && !window.confirm(`Reject ${request.student_name}'s request for ${request.course}? The submitted face template will be deleted.`)) return;

    let overrideReason = '';
    if (action === 'approve' && overrideDuplicate) {
      const candidateName = request.duplicate_candidate_name || 'an existing student';
      const candidateId = request.duplicate_candidate_student_id || 'unknown ID';
      const confirmed = window.confirm(
        `CampusSign found a POSSIBLE face match with ${candidateName} (${candidateId}). This is not proof that the students are the same person.

Before continuing, verify the student's official university ID in person. Only proceed if you have confirmed that these are two different people.

Continue to record a reviewed override?`
      );
      if (!confirmed) return;
      overrideReason = window.prompt('Record how you verified that these are two different students (at least 15 characters). Do not enter sensitive ID numbers:') || '';
      if (overrideReason.trim().length < 15) {
        alert('Please provide a brief verification reason of at least 15 characters. No enrolment changes were made.');
        return;
      }
    }

    setReviewingRequestId(request.id);
    try {
      const result = await db.reviewEnrollmentRequest(request.id, action, overrideDuplicate, overrideReason.trim());
      if (result?.status === 'possible_duplicate') {
        await refreshEnrollmentRequests();
        alert(
          `CampusSign found a possible face match with ${result.candidate_name} (${result.candidate_student_id}).

The request has NOT been rejected or approved. Check the student's official university ID in person. If they are different people, use the "Confirm different person & approve" button. If you cannot confidently establish their identity, reject the request and ask the student to enrol again in good lighting with nobody else in the camera frame.`
        );
        return;
      }
      await Promise.all([refreshEnrollmentRequests(), refreshRegistry()]);
    } catch (err) {
      alert('Could not review this request: ' + db.friendly(err));
    } finally {
      setReviewingRequestId('');
    }
  };

  const openAttendanceEditor = (log) => {
    setEditingLog(log);
    setEditAttendanceForm({ studentName: log.registeredName || '', dept: log.dept || '', status: log.status || 'Verified' });
  };

  const handleSaveAttendanceEdit = async (e) => {
    e.preventDefault();
    if (!editingLog || !editAttendanceForm.studentName.trim()) return;
    try {
      await db.updateAttendance(editingLog.id, editAttendanceForm);
      setEditingLog(null);
      await refreshLogs();
    } catch (err) {
      alert('Could not update attendance: ' + db.friendly(err));
    }
  };

  const handleDeleteAttendance = async (log) => {
    if (!log.id || !window.confirm(`Permanently delete ${log.registeredName}'s attendance record (${log.receiptNo})?`)) return;
    try {
      await db.deleteAttendance(log.id);
      await refreshLogs();
    } catch (err) {
      alert('Could not delete attendance: ' + db.friendly(err));
    }
  };

  const handleSetLocation = async () => {
    if (!activeSession.id) return;
    setLocBusy(true);
    const fix = await getBestFix(12000, 10);
    if (!fix) {
      setLocBusy(false);
      alert('Could not get your location. Allow location access for this site in your browser, then try again.');
      return;
    }
    try {
      await db.setAnchor(activeSession.id, fix);
      setActiveSession(prev => ({ ...prev, anchorAcc: fix.acc, anchorSetAt: Date.now() }));
    } catch (e) {
      alert(db.friendly(e));
    }
    setLocBusy(false);
  };

  const handleEndSession = async () => {
    if (!window.confirm('End this session? Students will no longer be able to check in. To take attendance again, start a new session (it gets a fresh list).')) return;
    try {
      await db.setRevoked(activeSession.id, true);
      setActiveSession(prev => ({ ...prev, isRevoked: true }));
      setShowSessionForm(false);
      await refreshSessions();
    } catch (e) {
      alert(db.friendly(e));
    }
  };

  // Filter attendance logs STRICTLY for the active lecturer's course/session
  const shownSessionId = viewSessionId || activeSession.id;
  const lecturerAttendanceLogs = attendanceLogs.filter(log => log.sessionId === shownSessionId);
  const sessionLive = !!activeSession.id && !activeSession.isRevoked && !(activeSession.endsAt && Date.now() > activeSession.endsAt);
  const displaySnapshot = {
    sessionLive,
    qrPayload,
    qrToken,
    title: activeSession.title || '',
    course: activeSession.course || (activeStaff ? activeStaff.course : ''),
    teacher: activeSession.teacher || (activeStaff ? activeStaff.name : ''),
    venue: activeSession.venue || '',
    qrIntervalSeconds: Number(activeSession.qrIntervalSeconds ?? DEFAULT_QR_INTERVAL_SECONDS),
    secondsToRotate,
  };
  displaySnapshotRef.current = displaySnapshot;

  // The projector tab receives only the rendered QR payload and display labels—never the session secret.
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel(QR_DISPLAY_CHANNEL);
    displayChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'ready' && displaySnapshotRef.current) {
        channel.postMessage({ type: 'state', payload: displaySnapshotRef.current });
      }
      if (event.data?.type === 'closed') setDisplayWindowOpen(false);
    };
    return () => {
      channel.close();
      displayChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    displayChannelRef.current?.postMessage({ type: 'state', payload: displaySnapshot });
  }, [sessionLive, qrPayload, qrToken, activeSession.title, activeSession.course, activeSession.teacher,
    activeSession.venue, activeSession.qrIntervalSeconds, activeStaff?.course, activeStaff?.name, secondsToRotate]);

  const openQrDisplay = () => {
    if (!('BroadcastChannel' in window)) {
      alert('This browser does not support the separate projector display. Please use a recent version of Chrome, Edge, Firefox or Safari.');
      return;
    }
    const displayUrl = new URL(window.location.href);
    displayUrl.searchParams.delete('checkin');
    displayUrl.searchParams.set('display', 'qr');
    const popup = window.open(displayUrl.toString(), 'campussign-qr-display', 'popup=yes,width=1200,height=900');
    if (!popup) {
      alert('The projector window was blocked. Allow pop-ups for CampusSign, then click Open projector view again.');
      return;
    }
    setDisplayWindowOpen(true);
    popup.focus();
  };

  const shownSession = sessionList.find(x => x.id === shownSessionId);
  const sessionOptions = sessionList
    .filter(x => !activeStaff?.course || x.course === activeStaff.course)
    .map(x => {
      const when = new Date(x.created_at);
      const n = attendanceLogs.filter(l => l.sessionId === x.id).length;
      return {
        id: x.id,
        label: `${x.title || 'Untitled'} · ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${n} present`
      };
    });

  const selectedSession = sessionList.find(x => x.id === shownSessionId);
  const selectedSessionIsLive = !!selectedSession && !selectedSession.revoked &&
    (!selectedSession.ends_at || new Date(selectedSession.ends_at).getTime() > Date.now());

  const handleDeleteSession = async () => {
    if (!selectedSession) {
      alert('Select an attendance list first.');
      return;
    }
    if (selectedSessionIsLive) {
      alert('End the live attendance session before deleting its list.');
      return;
    }

    const recordCount = attendanceLogs.filter(log => log.sessionId === selectedSession.id).length;
    const sessionDate = new Date(selectedSession.created_at).toLocaleString();
    const sessionName = selectedSession.title || selectedSession.course || 'Untitled session';
    const detail = recordCount === 1 ? '1 student attendance record' : `${recordCount} student attendance records`;
    const confirmed = window.confirm(
      `Permanently delete the entire attendance list?\n\n${sessionName}\n${sessionDate}\n${detail} will also be permanently deleted.\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await db.deleteSession(selectedSession.id);
      setSessionList(prev => prev.filter(session => session.id !== selectedSession.id));
      setAttendanceLogs(prev => prev.filter(log => log.sessionId !== selectedSession.id));
      if (viewSessionId === selectedSession.id) setViewSessionId('');
      if (activeSession.id === selectedSession.id) {
        setActiveSession(prev => ({ ...prev, id: '', secret: '', title: '', isRevoked: false, endsAt: null }));
      }
    } catch (err) {
      alert('Could not delete the attendance list: ' + db.friendly(err));
    }
  };

  const exportToCSV = () => {
    const headers = ["Student ID", "Registered Name", "Course", "Department", "Time", "Status", "Receipt Ref"];
    const rows = lecturerAttendanceLogs.map(log => [
      log.studentId,
      `"${log.registeredName}"`,
      `"${log.course || activeSession.course}"`,
      `"${log.dept}"`,
      log.time,
      log.status,
      log.receiptNo
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `CampusSign_Attendance_${activeSession.course.replace(/\s+/g, '_')}_${activeSession.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportLogsCsv = () => {
    const safeCourse = String((shownSession && shownSession.title) || 'session').replace(/[^a-z0-9]+/gi, '_');
    downloadCsv(
      `attendance_${safeCourse}_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Student ID', 'Name', 'Course', 'Department', 'Date & Time', 'Status', 'Location', 'Distance (m)', 'Face Score', 'Receipt Ref', 'Session ID'],
      filteredLogs.map(l => [l.studentId, l.registeredName, l.course, l.dept, l.isoTime || l.time, l.status, l.locationStatus || '', l.distanceM ?? '', l.faceScore ?? '', l.receiptNo, l.sessionId])
    );
  };

  const filteredLogs = lecturerAttendanceLogs.filter(log => 
    log.registeredName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.studentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.dept.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter student database STRICTLY for the active lecturer's course roster
  const filteredRegistry = studentRegistry.filter(s =>
    (activeStaff ? s.course === activeStaff.course : true) &&
    (s.name.toLowerCase().includes(registrySearch.toLowerCase()) ||
     s.id.toLowerCase().includes(registrySearch.toLowerCase()) ||
     s.dept.toLowerCase().includes(registrySearch.toLowerCase()))
  );

  if (isAuthenticated && activeStaff && !activeStaff.isVerified) {
    return (
      <div className="max-w-xl mx-auto my-12 bg-white dark:bg-slate-900 rounded-3xl p-7 sm:p-9 border border-amber-300 dark:border-amber-900 shadow-xl text-center space-y-5 animate-fade-up">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center mx-auto">
          <Clock3 className="w-8 h-8" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-black text-amber-700 dark:text-amber-400">Account review in progress</p>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-2">Your lecturer account is pending verification</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">Hello {activeStaff.name}. Your account has been created, but an administrator must verify your academic profile before you can access attendance sessions, student records, or other lecturer tools.</p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 text-left text-xs space-y-1">
          <div className="flex justify-between gap-3"><span className="text-slate-500">Academic email</span><strong className="text-slate-800 dark:text-slate-100">{activeStaff.email}</strong></div>
          <div className="flex justify-between gap-3"><span className="text-slate-500">Department</span><strong className="text-slate-800 dark:text-slate-100">{activeStaff.dept}</strong></div>
          <div className="flex justify-between gap-3"><span className="text-slate-500">Submitted course</span><strong className="text-slate-800 dark:text-slate-100">{activeStaff.course}</strong></div>
        </div>
        <button onClick={handleLogout} className="w-full py-3 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-amber-400 font-extrabold text-sm transition-all hover:-translate-y-0.5">Sign out</button>
      </div>
    );
  }

  if (isAuthenticated && activeStaff?.role === 'admin') {
    return <AdminWorkspace activeStaff={activeStaff} onLogout={handleLogout} />;
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl">
        <div className="text-center mb-6">
          <CampusSignLogo className="w-16 h-16 mx-auto mb-3" />
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Staff & Lecturer Login</h2>
          <p className="text-xs text-slate-500 mt-1">Sign in with your academic email</p>
        </div>

        {loginError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{loginError}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Academic Email</label>
            <input 
              type="email" 
              required
              placeholder="you@university.edu"
              value={staffIdInput}
              onChange={e => setStaffIdInput(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold focus:ring-2 focus:ring-emerald-600 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Password</label>
            <input 
              type="password" 
              required
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
            />
          </div>
          <button 
            type="submit"
            className="w-full py-3 bg-emerald-900 hover:bg-emerald-800 text-amber-400 font-bold rounded-xl text-sm transition-colors shadow-md border border-emerald-700 flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4 text-amber-400" />
            <span>Sign In to Staff Dashboard</span>
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col items-center gap-3">
          <button
            onClick={() => setIsAddStaffOpen(true)}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-emerald-950 font-extrabold rounded-xl text-xs shadow transition-colors flex items-center justify-center gap-2 border border-amber-300"
          >
            <UserPlus className="w-4 h-4" /> Register New Lecturer Account
          </button>

        </div>

        {/* REGISTER NEW LECTURER MODAL */}
        {isAddStaffOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full space-y-5 text-left">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-700" /> Register Lecturer Account
                </h3>
                <button 
                  onClick={() => setIsAddStaffOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-800 dark:text-amber-300">
                ⚠️ Account will be registered with <strong>PENDING ADMIN VERIFICATION</strong> status for central system approval.
              </div>

              <form onSubmit={handleRegisterStaff} className="space-y-4 text-xs">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Full Lecturer Name *
                  </label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Dr. Alan Turing"
                    value={newStaffForm.name}
                    onChange={e => setNewStaffForm({ ...newStaffForm, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Academic Email *
                  </label>
                  <input 
                    type="email" 
                    required
                    placeholder="e.g. turing@university.edu"
                    value={newStaffForm.email}
                    onChange={e => setNewStaffForm({ ...newStaffForm, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Department</label>
                    <select required value={newStaffForm.dept} onChange={e => { const dept=e.target.value; const first=academicCourses.find(c=>c.department_name===dept); setNewStaffForm({ ...newStaffForm, dept, course:first ? `${first.code} - ${first.title}` : '' }); setNewStaffCourses(first ? [`${first.code} - ${first.title}`] : []); }} className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:ring-2 focus:ring-emerald-600 outline-none"><option value="">Choose department</option>{academicDepartments.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}</select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Assigned Course Code</label>
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 space-y-1">{academicCourses.filter(c=>c.department_name===newStaffForm.dept && c.is_active).map(c=>{const value=`${c.code} - ${c.title}`;const checked=newStaffCourses.includes(value);return <label key={c.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] cursor-pointer"><input type="checkbox" checked={checked} onChange={e=>{const next=e.target.checked?[...newStaffCourses,value]:newStaffCourses.filter(x=>x!==value);setNewStaffCourses(next);setNewStaffForm({...newStaffForm,course:next[0]||''});}}/><span>{c.code} · {c.title}</span></label>;})}{!academicCourses.some(c=>c.department_name===newStaffForm.dept && c.is_active)&&<p className="p-2 text-[10px] text-amber-700">No active courses in this department yet.</p>}</div><p className="mt-1 text-[10px] text-slate-500">Select every course you teach. Your first selection is your default course.</p>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Password</label>
                  <input 
                    type="password" 
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={newStaffForm.password}
                    onChange={e => setNewStaffForm({ ...newStaffForm, password: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setIsAddStaffOpen(false)}
                    className="w-1/2 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="w-1/2 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-amber-400 rounded-xl text-xs font-bold shadow border border-emerald-700"
                  >
                    Submit for Approval
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-8">
      
      {/* ACCOUNT BAR */}
      <div className="bg-emerald-900 text-white rounded-2xl px-4 py-3 border border-emerald-800 shadow-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-emerald-950 rounded-xl border border-emerald-700 text-amber-400 shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-amber-400 text-sm truncate">{activeStaff ? activeStaff.name : 'Staff'}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              {assignedCourses.length > 1 ? <select aria-label="Active teaching course" value={activeStaff?.course || ''} onChange={e=>switchLecturerCourse(e.target.value)} className="max-w-[230px] px-2 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-200 rounded text-[10px] font-bold"><option value="">Choose active course</option>{assignedCourses.map(item=><option key={item.course} value={item.course} className="text-slate-900">{item.course}{item.is_primary ? ' · Default' : ''}</option>)}</select> : <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded text-[10px] font-bold">{activeStaff ? activeStaff.course : ''}</span>}
              {activeStaff && !activeStaff.isVerified && (
                <span className="px-2 py-0.5 bg-rose-500/20 border border-rose-400/40 text-rose-300 rounded text-[10px] font-bold">PENDING APPROVAL</span>
              )}
            </div>
          </div>
        </div>
        <NotificationBell notifications={notifications} onRead={handleReadNotification} onReadAll={handleReadAllNotifications} />
        <button
          onClick={handleLogout}
          className="p-2.5 sm:px-4 sm:py-2 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-200 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shrink-0"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>

      {/* QUICK STATUS OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3 interactive-card">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center"><Users className="w-5 h-5" /></div>
          <div><div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{filteredRegistry.length}</div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Course roster</div></div>
        </div>
        <div className="rounded-2xl p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3 interactive-card">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center justify-center"><FileCheck className="w-5 h-5" /></div>
          <div><div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{lecturerAttendanceLogs.length}</div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Attendance records</div></div>
        </div>
        <button onClick={() => setAdminTab('requests')} className="rounded-2xl p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3 text-left interactive-card">
          <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 flex items-center justify-center"><ClipboardList className="w-5 h-5" /></div>
          <div className="flex-1"><div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{enrollmentRequests.length}</div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pending enrolments</div></div><ArrowRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* SESSION + QR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8">

        {/* Session card */}
        <div className="lg:col-span-5">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            {sessionLive && !showSessionForm ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
                  </span>
                  {activeSession.endsAt && (
                    <span className="text-[11px] font-mono text-slate-500">
                      Ends in {Math.max(0, Math.ceil((activeSession.endsAt - Date.now()) / 60000))} min
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight">{activeSession.title}</h3>
                  {activeSession.venue && <p className="text-xs text-slate-500 mt-0.5">{activeSession.venue}</p>}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <span className={CHIP}>{activeSession.faceRequired ? 'Face check on' : 'Face check off'}</span>
                  <span className={CHIP}>
                    {activeSession.locationMode === 'off'
                      ? 'Location off'
                      : `${activeSession.locationMode === 'block' ? 'Blocks' : 'Flags'} outside ${activeSession.radius} m`}
                  </span>
                  <span className={CHIP}>
                    {Number(activeSession.qrIntervalSeconds ?? DEFAULT_QR_INTERVAL_SECONDS) === 0
                      ? 'Static QR until session closes'
                      : `QR changes every ${formatQrInterval(Number(activeSession.qrIntervalSeconds ?? DEFAULT_QR_INTERVAL_SECONDS))}`}
                  </span>
                </div>

                {activeSession.locationMode !== 'off' && (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300">Classroom location</span>
                      <span className={`font-mono font-bold ${activeSession.anchorAcc == null ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {activeSession.anchorAcc != null ? `Set (±${Math.round(activeSession.anchorAcc)} m)` : 'Not set'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSetLocation}
                      disabled={locBusy}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-emerald-950 font-extrabold rounded-xl text-sm border border-amber-300"
                    >
                      {locBusy ? 'Getting location…' : activeSession.anchorAcc != null ? 'Update classroom location' : 'Set classroom location here'}
                    </button>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {activeSession.anchorAcc == null
                        ? 'Stand in the classroom and tap this. Until you do, students are not checked against a location. A phone gives the best accuracy.'
                        : 'Tap again to refresh it. A phone is far more accurate than a laptop.'}
                    </p>
                    {activeSession.anchorAcc != null && activeSession.anchorAcc > 50 && (
                      <p className="text-[11px] text-rose-600 font-bold">
                        Accuracy is low (±{Math.round(activeSession.anchorAcc)} m), so many students will show as "unconfirmed". Try again on your phone, near a window.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleEndSession}
                    className="py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold"
                  >
                    End session
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSessionForm(true)}
                    className="py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    New session
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">{activeSession.id ? 'Start a new session' : 'Start a session'}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Each session gets its own attendance list.{sessionLive ? ' Starting a new one ends the current session.' : ''}
                  </p>
                </div>

                <form onSubmit={handleCreateSession} className="space-y-4">
                  <div>
                    <label className={LABEL}>Session name</label>
                    <input
                      type="text"
                      required
                      placeholder='e.g. "Test attendance"'
                      value={sessionForm.title}
                      onChange={e => setSessionForm({ ...sessionForm, title: e.target.value })}
                      className={FIELD}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>Venue (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Hall B"
                      value={sessionForm.venue}
                      onChange={e => setSessionForm({ ...sessionForm, venue: e.target.value })}
                      className={FIELD}
                    />
                  </div>

                  <details className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <summary className="px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                      Session settings
                    </summary>
                    <div className="px-4 pb-4 pt-1 space-y-4">
                      <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Require face check
                        <input
                          type="checkbox"
                          checked={sessionForm.faceRequired}
                          onChange={e => setSessionForm({ ...sessionForm, faceRequired: e.target.checked })}
                          className="w-5 h-5 accent-emerald-700"
                        />
                      </label>

                      {sessionForm.faceRequired && (
                        <div>
                          <label className={LABEL}>Face strictness</label>
                          <select
                            value={sessionForm.strictness}
                            onChange={e => setSessionForm({ ...sessionForm, strictness: e.target.value })}
                            className={FIELD}
                          >
                            <option value="lenient">Lenient (fewer rejections)</option>
                            <option value="standard">Standard</option>
                            <option value="strict">Strict (fewer false matches)</option>
                          </select>
                        </div>
                      )}

                      <div>
                        <label className={LABEL}>Location check</label>
                        <select
                          value={sessionForm.locationMode}
                          onChange={e => setSessionForm({ ...sessionForm, locationMode: e.target.value })}
                          className={FIELD}
                        >
                          <option value="off">Off</option>
                          <option value="flag">Flag students who are outside</option>
                          <option value="block">Block students who are outside</option>
                        </select>
                      </div>

                      {sessionForm.locationMode !== 'off' && (
                        <div>
                          <label className={LABEL}>Allowed distance (metres)</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="5"
                            max="1000"
                            value={sessionForm.radius}
                            onChange={e => setSessionForm({ ...sessionForm, radius: e.target.value })}
                            className={FIELD}
                          />
                        </div>
                      )}

                      <div>
                        <label className={LABEL}>QR code lifetime</label>
                        <select
                          value={sessionForm.qrIntervalSeconds}
                          onChange={e => setSessionForm({ ...sessionForm, qrIntervalSeconds: e.target.value })}
                          className={FIELD}
                        >
                          <option value="30">30 seconds (default)</option>
                          <option value="60">1 minute</option>
                          <option value="120">2 minutes</option>
                          <option value="300">5 minutes</option>
                          <option value="600">10 minutes</option>
                          <option value="0">Never rotate — until session closes</option>
                        </select>
                        <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                          A recently expired QR gets a {QR_GRACE_SECONDS}-second grace period for slow scans. A static QR remains valid only while this attendance session is open, so avoid it if students may share screenshots outside the classroom.
                        </p>
                      </div>

                      <div>
                        <label className={LABEL}>Auto-end after</label>
                        <select
                          value={sessionForm.duration}
                          onChange={e => setSessionForm({ ...sessionForm, duration: e.target.value })}
                          className={FIELD}
                        >
                          <option value="0">Never (I will end it)</option>
                          <option value="15">15 minutes</option>
                          <option value="30">30 minutes</option>
                          <option value="60">1 hour</option>
                          <option value="120">2 hours</option>
                        </select>
                      </div>
                    </div>
                  </details>

                  <div className="flex gap-2">
                    {sessionLive && (
                      <button
                        type="button"
                        onClick={() => setShowSessionForm(false)}
                        className="px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      className="flex-1 py-3 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-amber-400 text-sm font-extrabold border border-emerald-700"
                    >
                      Start session
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>

        {/* QR card */}
        <div className="lg:col-span-7">
          <div className={`h-full bg-gradient-to-br from-emerald-950 to-slate-950 text-white rounded-3xl p-5 sm:p-8 border border-emerald-900 shadow-lg flex flex-col relative overflow-hidden ${isFullscreenQR ? 'fixed inset-0 z-50 rounded-none border-none overflow-auto' : ''}`}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h4 className="font-extrabold text-sm text-amber-400 truncate">{activeSession.id ? activeSession.title : 'Check-in QR'}</h4>
                <p className="text-xs text-emerald-200 truncate">
                  {activeStaff ? activeStaff.course : activeSession.course}{activeSession.teacher ? ` • ${activeSession.teacher}` : ''}
                </p>
              </div>
              {sessionLive && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={openQrDisplay}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-emerald-950 rounded-xl text-xs font-extrabold transition-colors"
                    title="Open a clean QR-only window for the classroom projector"
                  >
                    <MonitorUp className="w-4 h-4" />
                    <span className="hidden sm:inline">{displayWindowOpen ? 'Open display again' : 'Projector view'}</span>
                    <span className="sm:hidden">Display</span>
                  </button>
                  <button
                    onClick={() => setIsFullscreenQR(!isFullscreenQR)}
                    className="p-2 bg-emerald-900/60 hover:bg-emerald-800 border border-emerald-700 rounded-xl text-amber-300 transition-colors"
                    title={isFullscreenQR ? 'Exit fullscreen' : 'Fullscreen QR card'}
                  >
                    {isFullscreenQR ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                  </button>
                </div>
              )}
            </div>

            <div className="my-auto flex flex-col items-center justify-center text-center py-2">
              {!activeSession.id ? (
                <div className="max-w-xs py-8">
                  <QrCode className="w-14 h-14 text-emerald-700 mx-auto mb-3" />
                  <h3 className="text-base font-extrabold text-white">No active session</h3>
                  <p className="text-xs text-emerald-200 mt-1">Start a session and the check-in QR code appears here.</p>
                </div>
              ) : !sessionLive ? (
                <div className="p-6 bg-rose-950/80 rounded-3xl border border-rose-800 max-w-sm">
                  <ShieldAlert className="w-14 h-14 text-rose-400 mx-auto mb-3" />
                  <h3 className="text-base font-extrabold text-white">Session ended</h3>
                  <p className="text-xs text-rose-200 mt-1">
                    {attendanceLogs.filter(l => l.sessionId === activeSession.id).length} student(s) checked in. Start a new session for a new attendance list.
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-4 sm:p-5 bg-white rounded-3xl shadow-2xl border-4 border-amber-500 inline-block max-w-full">
                    {qrPayload ? <QRCodeImage value={qrPayload} size={isFullscreenQR ? 420 : 240} /> : <div className="w-[240px] h-[240px] grid place-items-center text-slate-500 text-xs">Preparing secure QR…</div>}
                  </div>
                  <div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-900/80 border border-emerald-700 text-xs text-amber-300">
                    {Number(activeSession.qrIntervalSeconds ?? DEFAULT_QR_INTERVAL_SECONDS) === 0
                      ? <Lock className="w-3.5 h-3.5" />
                      : <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{Number(activeSession.qrIntervalSeconds ?? DEFAULT_QR_INTERVAL_SECONDS) === 0
                      ? 'This QR stays valid until the session closes'
                      : <>New code in <strong>{secondsToRotate}s</strong></>}</span>
                  </div>
                  <button
                    onClick={() => onSimulateScan()}
                    className="mt-3 w-full sm:w-auto px-5 py-3 bg-amber-500 hover:bg-amber-400 text-emerald-950 rounded-xl font-extrabold text-sm shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 border border-amber-300"
                  >
                    <ExternalLink className="w-4 h-4" /> Test check-in on this device
                  </button>
                </>
              )}
            </div>

            <div className="hidden sm:flex pt-4 border-t border-emerald-900/80 items-center justify-between text-xs text-emerald-200 gap-2">
              <div className="flex items-center gap-1 font-mono text-[11px]">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>Token: <strong className="text-white">{qrToken}</strong></span>
              </div>
              <span>{Number(activeSession.qrIntervalSeconds ?? DEFAULT_QR_INTERVAL_SECONDS) === 0 ? 'Static until session closes' : `Rotates every ${formatQrInterval(Number(activeSession.qrIntervalSeconds ?? DEFAULT_QR_INTERVAL_SECONDS))} · ${QR_GRACE_SECONDS}s scan grace`}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ADMIN SUB-TABS: ISOLATED SESSION ATTENDANCE vs LECTURER'S OWN COURSE ROSTER */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 sm:space-y-5">
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          {/* Sub Tab Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl w-full sm:w-auto">
            <button
              onClick={() => setAdminTab('roster')}
              className={`px-3 sm:px-4 py-2.5 sm:py-2 text-xs font-bold rounded-xl transition-all flex flex-1 sm:flex-none justify-center items-center gap-2 ${
                adminTab === 'roster'
                  ? 'bg-emerald-900 text-amber-400 shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4" />
              <span className="sm:hidden">Attendance ({lecturerAttendanceLogs.length})</span>
              <span className="hidden sm:inline">Session Attendance Log ({lecturerAttendanceLogs.length})</span>
            </button>

            <button
              onClick={() => setAdminTab('registry')}
              className={`px-3 sm:px-4 py-2.5 sm:py-2 text-xs font-bold rounded-xl transition-all flex flex-1 sm:flex-none justify-center items-center gap-2 ${
                adminTab === 'registry'
                  ? 'bg-emerald-900 text-amber-400 shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Database className="w-4 h-4" />
              <span className="sm:hidden">Roster ({filteredRegistry.length})</span>
              <span className="hidden sm:inline">{activeStaff ? activeStaff.name.split(' ')[0] : 'Lecturer'}'s Student Roster ({filteredRegistry.length})</span>
            </button>

            <button
              onClick={() => setAdminTab('requests')}
              className={`px-3 sm:px-4 py-2.5 sm:py-2 text-xs font-bold rounded-xl transition-all flex flex-1 sm:flex-none justify-center items-center gap-2 ${
                adminTab === 'requests'
                  ? 'bg-emerald-900 text-amber-400 shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>Requests ({enrollmentRequests.length})</span>
            </button>
          </div>

          {/* Action Buttons */}
          {adminTab === 'roster' ? (
            <button
              onClick={exportLogsCsv}
              disabled={filteredLogs.length === 0}
              className="w-full sm:w-auto justify-center px-4 py-2.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-amber-400 text-xs font-bold rounded-xl shadow transition-colors flex items-center gap-2 border border-emerald-700"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          ) : adminTab === 'registry' ? (
            <button
              onClick={() => setIsAddStudentOpen(true)}
              className="w-full sm:w-auto justify-center px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-emerald-950 text-xs font-extrabold rounded-xl shadow transition-colors flex items-center gap-2 border border-amber-300"
            >
              <UserPlus className="w-4 h-4" /> Add Student to {activeStaff ? activeStaff.course.split(' ')[0] : 'Course'}
            </button>
          ) : (
            <button
              onClick={refreshEnrollmentRequests}
              className="w-full sm:w-auto justify-center px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl flex items-center gap-2 border border-slate-200 dark:border-slate-700"
            >
              <RefreshCw className="w-4 h-4" /> Refresh requests
            </button>
          )}
        </div>

        {/* TAB 1: ISOLATED SESSION ATTENDANCE LOG */}
        {adminTab === 'roster' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <select
                value={shownSessionId}
                onChange={e => setViewSessionId(e.target.value)}
                className={FIELD + ' sm:max-w-sm'}
              >
                {sessionOptions.length === 0 && <option value="">No sessions yet</option>}
                {sessionOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <button
                type="button"
                onClick={handleDeleteSession}
                disabled={!selectedSession || selectedSessionIsLive}
                title={selectedSessionIsLive ? 'End the live session before deleting its list' : 'Permanently delete this entire attendance list'}
                className="w-full sm:w-auto px-3.5 py-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs font-extrabold hover:bg-rose-100 dark:hover:bg-rose-950 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Delete entire list
              </button>
              <div className="relative w-full sm:max-w-xs">
                <Search className="w-4 h-4 absolute left-3.5 top-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name or ID"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-base sm:text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Delete entire list removes the selected session and all check-ins saved under it. Live sessions must be ended first.
            </p>

            {filteredLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <FileCheck className="w-12 h-12 mx-auto mb-2 opacity-30 text-emerald-600" />
                <p>Nobody has checked in to this session yet.</p>
              </div>
            ) : (
              <>
              <div className="md:hidden space-y-2.5">
                {filteredLogs.map((log, idx) => (
                  <div key={log.id || idx} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                    {log.facePhoto ? (
                      <img src={log.facePhoto} alt="" className="w-11 h-11 rounded-full object-cover border-2 border-emerald-600 shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-slate-900 dark:text-white truncate">{log.registeredName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{log.studentId} · {log.time}</div>
                    </div>
                    {log.status === 'Flagged' ? (
                      <span className="shrink-0 px-2 py-1 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                        {LOC_LABEL[log.locationStatus] || 'Flagged'}{log.distanceM != null ? ` · ${log.distanceM} m` : ''}
                      </span>
                    ) : log.status === 'Verified' ? (
                      <span className="shrink-0 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">Verified</span>
                    ) : (
                      <span className="shrink-0 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">{log.status || 'Reviewed'}</span>
                    )}
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openAttendanceEditor(log)} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700" aria-label="Edit attendance"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDeleteAttendance(log)} className="p-2 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950" aria-label="Delete attendance"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                    <tr>
                      <th className="p-3 rounded-l-xl">Face Signature</th>
                      <th className="p-3">Student Name & ID</th>
                      <th className="p-3">Course</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Verified Time</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Receipt Ref</th>
                      <th className="p-3 text-right rounded-r-xl">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {filteredLogs.map((log, idx) => (
                      <tr key={log.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="p-3">
                          {log.facePhoto ? <img src={log.facePhoto} alt="Biometric Signature" className="w-10 h-10 rounded-full object-cover border-2 border-emerald-600 shadow-sm" /> : <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700" />}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900 dark:text-white">{log.registeredName}</div>
                          <div className="text-[10px] font-mono text-slate-400">{log.studentId}</div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded font-mono text-[10px]">
                            {log.course || activeSession.course}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">{log.dept}</td>
                        <td className="p-3 text-slate-500 font-mono">{log.time}</td>
                        <td className="p-3">
                          {log.status === 'Flagged' ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> {LOC_LABEL[log.locationStatus] || 'Flagged'}{log.distanceM != null ? ` (${log.distanceM} m)` : ''}
                            </span>
                          ) : log.status === 'Verified' ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-600" /> Verified</span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">{log.status || 'Reviewed'}</span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-[10px] text-slate-400">{log.receiptNo}</td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => openAttendanceEditor(log)} className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700" title="Edit attendance"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDeleteAttendance(log)} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950" title="Delete attendance"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: SELF-ENROLMENT REQUESTS */}
        {adminTab === 'requests' && (
          <div className="space-y-4 animate-fade-up">
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
              <ClipboardList className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">Student enrolment inbox</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">Students who select your course appear here. Approving a request adds the student to your roster and securely activates their submitted face template.</p>
              </div>
            </div>
            {enrollmentRequests.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-30 text-emerald-600" />
                <p>No pending student requests. New requests will appear here automatically.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {enrollmentRequests.map(request => (
                  <article key={request.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 p-4 space-y-3 transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-slate-900 dark:text-white truncate">{request.student_name}</h4>
                        <p className="text-xs font-mono text-emerald-800 dark:text-emerald-400 mt-0.5">{request.student_id}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${request.duplicate_candidate_student_id ? 'bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-900' : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900'}`}>
                        {request.duplicate_candidate_student_id ? 'Possible match' : 'Pending'}
                      </span>
                    </div>
                    {request.duplicate_candidate_student_id && (
                      <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 text-[11px] leading-relaxed text-orange-900 dark:text-orange-200">
                        <div className="flex items-center gap-2 font-extrabold mb-1"><AlertTriangle className="w-4 h-4 shrink-0" /> Possible face match — not a confirmed duplicate</div>
                        <p>Closest existing roster entry: <strong>{request.duplicate_candidate_name}</strong> ({request.duplicate_candidate_student_id}). Verify the student's official university ID in person before deciding. Do not rely on the automated match alone. If unrelated students repeatedly match this same roster entry, pause and ask an administrator to investigate the existing template before approving more overrides.</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="block text-slate-400">Department</span><strong className="text-slate-700 dark:text-slate-200">{request.dept}</strong></div>
                      <div><span className="block text-slate-400">Level</span><strong className="text-slate-700 dark:text-slate-200">{request.level} Level</strong></div>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between gap-2"><span className="truncate">{request.course}</span><span className="shrink-0">{new Date(request.created_at).toLocaleDateString()}</span></div>
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <button disabled={reviewingRequestId === request.id} onClick={() => handleReviewEnrollment(request, 'approve', Boolean(request.duplicate_candidate_student_id))} className="flex-1 py-2.5 rounded-xl bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-amber-300 font-extrabold text-xs inline-flex items-center justify-center gap-1.5 transition-colors">
                        <Check className="w-4 h-4" /> {request.duplicate_candidate_student_id ? 'Confirm different person & approve' : 'Approve & enrol'}
                      </button>
                      <button disabled={reviewingRequestId === request.id} onClick={() => handleReviewEnrollment(request, 'reject')} className="px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950 disabled:opacity-50 font-bold text-xs inline-flex items-center justify-center gap-1.5"><X className="w-4 h-4" /> Reject</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LECTURER-SPECIFIC COURSE STUDENT DATABASE */}
        {adminTab === 'registry' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="relative max-w-sm w-full">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search course roster by ID, Name, Dept..."
                  value={registrySearch}
                  onChange={e => setRegistrySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Active Lecturer Roster: <strong className="text-emerald-800 dark:text-emerald-400 font-bold">{activeStaff ? activeStaff.course : 'All Courses'}</strong> ({filteredRegistry.length} Enrolled Students)
              </div>
            </div>

            {filteredRegistry.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-30 text-emerald-600" />
                <p>No students enrolled under <strong>{activeStaff ? activeStaff.course : 'this course'}</strong> yet.</p>
                <button
                  onClick={() => setIsAddStudentOpen(true)}
                  className="mt-3 px-4 py-2 bg-amber-500 text-emerald-950 text-xs font-bold rounded-xl shadow"
                >
                  + Add First Student
                </button>
              </div>
            ) : (
              <>
              <div className="md:hidden space-y-2.5">
                {filteredRegistry.map((student) => {
                  const enrolled = enrolledIds.includes(student.id.toUpperCase());
                  return (
                    <div key={`${student.id}-${student.course}`} className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-900 dark:text-white truncate">{student.name}</div>
                          <div className="text-[11px] font-mono text-emerald-800 dark:text-emerald-400">{student.id}</div>
                        </div>
                        <span className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-bold border ${enrolled ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'}`}>
                          {enrolled ? 'Enrolled' : 'Not enrolled'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEnrollSaved(false); setEnrollTarget(student); }}
                          className="flex-1 py-2.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-xl inline-flex items-center justify-center gap-1.5"
                        >
                          <Camera className="w-4 h-4" /> {enrolled ? 'Re-enroll face' : 'Enroll face'}
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(student.rowId, student.id, student.name)}
                          className="px-3.5 text-rose-600 border border-rose-200 dark:border-rose-900 rounded-xl"
                          aria-label="Delete student"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                    <tr>
                      <th className="p-3 rounded-l-xl">Student ID</th>
                      <th className="p-3">Full Registered Name</th>
                      <th className="p-3">Course Assigned</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Academic Level</th>
                      <th className="p-3">Face</th>
                      <th className="p-3 text-right rounded-r-xl">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {filteredRegistry.map((student) => (
                      <tr key={`${student.id}-${student.course}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="p-3 font-mono font-bold text-emerald-800 dark:text-emerald-400">{student.id}</td>
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{student.name}</td>
                        <td className="p-3"><span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded font-mono text-[10px]">{student.course}</span></td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">{student.dept}</td>
                        <td className="p-3 text-slate-500">{student.level} Level</td>
                        <td className="p-3">
                          {enrolledIds.includes(student.id.toUpperCase()) ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">Enrolled</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">Not enrolled</span>
                          )}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => { setEnrollSaved(false); setEnrollTarget(student); }}
                            className="px-2.5 py-1.5 mr-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-800 rounded-lg inline-flex items-center gap-1"
                            title="Enroll this student's face"
                          >
                            <Camera className="w-3.5 h-3.5" /> {enrolledIds.includes(student.id.toUpperCase()) ? 'Re-enroll' : 'Enroll Face'}
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(student.rowId, student.id, student.name)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors"
                            title="Delete Student Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}

      </div>

      {/* FACE ENROLLMENT MODAL */}
      {enrollTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full space-y-4 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-emerald-700" /> Enroll Face: {enrollTarget.name} ({enrollTarget.id})
              </h3>
              <button
                onClick={() => setEnrollTarget(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {enrollSaved ? (
              <div className="text-center space-y-4 py-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                <p className="text-sm font-bold text-slate-900 dark:text-white">Face enrolled for {enrollTarget.id}.</p>
                <p className="text-xs text-slate-500">A numeric face template was saved securely on the server. No photo is stored.</p>
                <button
                  onClick={() => setEnrollTarget(null)}
                  className="px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-amber-400 font-extrabold rounded-xl text-xs border border-emerald-700"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  The student must be present. They look straight at the camera while 5 samples are captured. Only a numeric template is saved, securely on the server.
                </p>
                <FaceCapture
                  mode="enroll"
                  onEnrolled={async ({ descriptors }) => {
                    try {
                      await db.enrollFace(enrollTarget.rowId, descriptors);
                      await refreshRegistry();
                      setEnrollSaved(true);
                    } catch (err) {
                      alert('Could not save the face template: ' + db.friendly(err));
                      setEnrollTarget(null);
                    }
                  }}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* REGISTER NEW LECTURER / STAFF MODAL OVERLAY */}
      {isAddStaffOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-700" /> Register New Lecturer
              </h3>
              <button 
                onClick={() => setIsAddStaffOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRegisterStaff} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Full Lecturer Name *
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Dr. Alan Turing"
                  value={newStaffForm.name}
                  onChange={e => setNewStaffForm({ ...newStaffForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Academic Email *
                </label>
                <input 
                  type="email" 
                  required
                  placeholder="e.g. turing@university.edu"
                  value={newStaffForm.email}
                  onChange={e => setNewStaffForm({ ...newStaffForm, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Department</label>
                  <select required value={newStaffForm.dept} onChange={e => { const dept=e.target.value; const first=academicCourses.find(c=>c.department_name===dept); setNewStaffForm({ ...newStaffForm, dept, course:first ? `${first.code} - ${first.title}` : '' }); setNewStaffCourses(first ? [`${first.code} - ${first.title}`] : []); }} className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:ring-2 focus:ring-emerald-600 outline-none"><option value="">Choose department</option>{academicDepartments.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}</select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Assigned Course Code</label>
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 space-y-1">{academicCourses.filter(c=>c.department_name===newStaffForm.dept && c.is_active).map(c=>{const value=`${c.code} - ${c.title}`;const checked=newStaffCourses.includes(value);return <label key={c.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] cursor-pointer"><input type="checkbox" checked={checked} onChange={e=>{const next=e.target.checked?[...newStaffCourses,value]:newStaffCourses.filter(x=>x!==value);setNewStaffCourses(next);setNewStaffForm({...newStaffForm,course:next[0]||''});}}/><span>{c.code} · {c.title}</span></label>;})}{!academicCourses.some(c=>c.department_name===newStaffForm.dept && c.is_active)&&<p className="p-2 text-[10px] text-amber-700">No active courses in this department yet.</p>}</div><p className="mt-1 text-[10px] text-slate-500">Select every course you teach. Your first selection is your default course.</p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Default Password</label>
                <input 
                  type="text" 
                  required
                  minLength={8}
                    placeholder="At least 8 characters"
                    value={newStaffForm.password}
                  onChange={e => setNewStaffForm({ ...newStaffForm, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsAddStaffOpen(false)}
                  className="w-1/2 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="w-1/2 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-amber-400 rounded-xl text-xs font-bold shadow border border-emerald-700"
                >
                  Save Lecturer Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD STUDENT MODAL OVERLAY */}
      {isAddStudentOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-700" /> Add Student to Course Roster
              </h3>
              <button 
                onClick={() => setIsAddStudentOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStudent} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Assigned Course Roster *
                </label>
                <select
                  value={newStudentForm.course || (activeStaff ? activeStaff.course : '')}
                  onChange={e => setNewStudentForm({ ...newStudentForm, course: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold focus:ring-2 focus:ring-emerald-600 outline-none"
                >
                  {assignedCourses.length > 0
                    ? assignedCourses.map(item => (
                        <option key={item.course} value={item.course}>
                          {item.course}{item.is_primary ? ' (Default)' : ''}
                        </option>
                      ))
                    : staffAccounts.map(staff => (
                        <option key={staff.id} value={staff.course}>
                          {staff.course} ({staff.name})
                        </option>
                      ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Matriculation / Student ID *
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. STU021"
                  value={newStudentForm.id}
                  onChange={e => setNewStudentForm({ ...newStudentForm, id: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold uppercase focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Full Registered Name *
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Grace Hopper"
                  value={newStudentForm.name}
                  onChange={e => setNewStudentForm({ ...newStudentForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Department</label>
                  <input 
                    type="text" 
                    required
                    value={newStudentForm.dept}
                    onChange={e => setNewStudentForm({ ...newStudentForm, dept: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Academic Level</label>
                  <select
                    value={newStudentForm.level}
                    onChange={e => setNewStudentForm({ ...newStudentForm, level: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold focus:ring-2 focus:ring-emerald-600 outline-none"
                  >
                    <option value="100">100 Level</option>
                    <option value="200">200 Level</option>
                    <option value="300">300 Level</option>
                    <option value="400">400 Level</option>
                    <option value="500">500 Level</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsAddStudentOpen(false)}
                  className="w-1/2 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="w-1/2 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-amber-400 rounded-xl text-xs font-bold shadow border border-emerald-700"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ATTENDANCE MODAL */}
      {editingLog && (
        <div className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Edit attendance record">
          <form onSubmit={handleSaveAttendanceEdit} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full space-y-4 animate-fade-up">
            <div className="flex items-center justify-between gap-3">
              <div><h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Edit attendance</h3><p className="text-[11px] text-slate-500 font-mono">{editingLog.studentId} · {editingLog.receiptNo}</p></div>
              <button type="button" onClick={() => setEditingLog(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close editor"><X className="w-4 h-4" /></button>
            </div>
            <div><label className={LABEL}>Student name</label><input required value={editAttendanceForm.studentName} onChange={e => setEditAttendanceForm(prev => ({ ...prev, studentName: e.target.value }))} className={FIELD} /></div>
            <div><label className={LABEL}>Department</label><input value={editAttendanceForm.dept} onChange={e => setEditAttendanceForm(prev => ({ ...prev, dept: e.target.value }))} className={FIELD} /></div>
            <div><label className={LABEL}>Attendance status</label><select value={editAttendanceForm.status} onChange={e => setEditAttendanceForm(prev => ({ ...prev, status: e.target.value }))} className={FIELD}><option value="Verified">Verified</option><option value="Flagged">Flagged</option><option value="Excused">Excused</option><option value="Absent">Absent</option></select></div>
            <p className="text-[11px] text-slate-500">Student ID, course, receipt reference, and original check-in time remain unchanged for audit consistency.</p>
            <div className="flex gap-2"><button type="button" onClick={() => setEditingLog(null)} className="flex-1 py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold">Cancel</button><button type="submit" className="flex-1 py-3 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-amber-300 text-xs font-extrabold">Save changes</button></div>
          </form>
        </div>
      )}

    </div>
  );
}

/* ==========================================================================
   STUDENT PORTAL COMPONENT
   ========================================================================== */
function StudentPortal({ 
  activeSession,
  checkin,
  checkinError,
  onQrScanned,
  attendanceLogs, 
  setAttendanceLogs,
  lockedOutStudents,
  setLockedOutStudents,
  studentRegistry,
  isDarkMode 
}) {
  const [step, setStep] = useState(1); // 1: Scan QR -> 2: Lookup ID -> 3: Consent -> 4: Face Scan -> 5: Receipt
  
  // Student Lookup Form Data
  const [studentIdInput, setStudentIdInput] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [lookupError, setLookupError] = useState('');
  const [matchedStudent, setMatchedStudent] = useState(null);

  // Real camera QR scanner
  const [isScanningQR, setIsScanningQR] = useState(false);

  // Real face scan state
  const [faceAttempt, setFaceAttempt] = useState(0);
  const [faceError, setFaceError] = useState('');
  const [faceRetries, setFaceRetries] = useState(0);
  const [receiptData, setReceiptData] = useState(null);
  const locRef = useRef(null); // location lookup started at the consent step
  const [submitting, setSubmitting] = useState(false);

  // Student self-enrolment is independent of the live QR check-in flow.
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [enrollmentStage, setEnrollmentStage] = useState('profile');
  const [availableCourses, setAvailableCourses] = useState([]);
  const [availableDepartments, setAvailableDepartments] = useState<any[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [studentEnrollmentForm, setStudentEnrollmentForm] = useState({
    studentId: '', name: '', dept: '', level: '100'
  });
  const [enrollmentError, setEnrollmentError] = useState('');
  const [enrollmentResult, setEnrollmentResult] = useState(null);
  const [enrollmentSubmitting, setEnrollmentSubmitting] = useState(false);
  const [enrollmentFaceAttempt, setEnrollmentFaceAttempt] = useState(0);

  // The session comes from the QR the student actually scanned (signed + time-limited)
  const session = checkin ? checkin.session : null;
  const faceRequired = !session || session.faceRequired !== false;
  const locationMode = (session && session.locationMode) || 'flag';
  const radius = (session && session.radius) || 15;
  const CHECKIN_WINDOW_MS = 10 * 60 * 1000;
  const isTokenValid =
    !!checkin &&
    Date.now() - checkin.validatedAt < CHECKIN_WINDOW_MS &&
    !(activeSession.isRevoked && activeSession.id === session.id);

  // Face template enrolled on this device for the matched student
  const enrollment = matchedStudent && matchedStudent.faceEnrolled ? true : null;

  const handleQrCode = async (raw) => {
    const result = await onQrScanned(raw);
    if (result.ok) setIsScanningQR(false);
  };

  // Handle Student Lookup bound to the scanned session's course
  const handleVerifyStudentId = async (e) => {
    e.preventDefault();
    const cleanId = studentIdInput.trim().toUpperCase();
    if (!isTokenValid) {
      setStep(1);
      return;
    }
    try {
      const st = await db.lookupStudent(session.id, checkin.ticket, cleanId);
      setMatchedStudent({ id: st.student_id, name: st.name, dept: st.dept, level: st.level, faceEnrolled: st.face_enrolled });
      setLookupError('');
      setFaceError('');
      setFaceRetries(0);
      setStep(3); // Proceed to consent
    } catch (err) {
      if (err && err.message === 'not_found') {
        const n = retryCount + 1;
        setRetryCount(n);
        setLookupError(`${db.friendly(err)} (try ${n})`);
      } else {
        setLookupError(db.friendly(err));
      }
    }
  };

  // The face (if required) and location are checked on the server; this device never sees any template.
  const submitCheckIn = async (photo, descriptors) => {
    try {
      const fix = locationMode === 'off' ? null : await (locRef.current || getBestFix(8000, 15));
      const r = await db.checkIn(session.id, checkin.ticket, matchedStudent.id, descriptors, photo, fix);
      if (r.status === 'ok') {
        finishVerification(r, photo);
      } else if (r.status === 'mismatch') {
        setFaceError(`Your face did not match the enrolled record (score ${r.distance}). ${r.remaining} attempt${r.remaining === 1 ? '' : 's'} left.`);
      } else if (r.status === 'blocked_location') {
        setFaceError(r.location === 'unavailable'
          ? 'This session needs your location. Allow location access for this site in your browser settings, then try again.'
          : `You appear to be outside the classroom (about ${r.distance_m} m away). Move closer to the lecturer and try again.`);
      } else if (r.status === 'locked' || r.status === 'already') {
        setMatchedStudent(null);
        setStep(2);
        setLookupError(db.friendly({ message: r.status }));
      } else {
        setFaceError(db.friendly({ message: r.status }));
      }
    } catch (err) {
      setFaceError(db.friendly(err));
    }
  };

  const handleFaceCaptured = ({ photo, descriptors }) => submitCheckIn(photo, descriptors);

  const startStudentEnrollment = async () => {
    setShowEnrollment(true);
    setEnrollmentStage('profile');
    setEnrollmentError('');
    setEnrollmentResult(null);
    if (!availableDepartments.length) {
      setCoursesLoading(true);
      try {
        setAvailableDepartments(await db.loadCatalogDepartments());
      } catch (err) {
        setEnrollmentError('Could not load departments: ' + db.friendly(err));
      } finally {
        setCoursesLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!showEnrollment || !studentEnrollmentForm.dept) { setAvailableCourses([]); return; }
    let cancelled = false;
    setCoursesLoading(true);
    db.loadDepartmentCourses(studentEnrollmentForm.dept)
      .then(rows => { if (!cancelled) { setAvailableCourses(rows.map(row => row.course)); setSelectedCourses([]); } })
      .catch(err => { if (!cancelled) setEnrollmentError('Could not load department courses: ' + db.friendly(err)); })
      .finally(() => { if (!cancelled) setCoursesLoading(false); });
    return () => { cancelled = true; };
  }, [showEnrollment, studentEnrollmentForm.dept]);

  const toggleCourseSelection = (course) => {
    setSelectedCourses(prev => prev.includes(course) ? prev.filter(c => c !== course) : [...prev, course]);
  };

  const continueToFaceEnrollment = (e) => {
    e.preventDefault();
    if (!studentEnrollmentForm.studentId.trim() || !studentEnrollmentForm.name.trim() || !studentEnrollmentForm.dept.trim()) {
      setEnrollmentError('Complete your student ID, full name, and department.');
      return;
    }
    if (!selectedCourses.length) {
      setEnrollmentError('Select at least one course before continuing.');
      return;
    }
    setEnrollmentError('');
    setEnrollmentStage('face');
  };

  const handleStudentFaceEnrollment = async ({ descriptors }) => {
    setEnrollmentSubmitting(true);
    setEnrollmentError('');
    try {
      const result = await db.submitStudentEnrollment({
        studentId: studentEnrollmentForm.studentId.trim().toUpperCase(),
        name: studentEnrollmentForm.name.trim(),
        dept: studentEnrollmentForm.dept.trim(),
        level: studentEnrollmentForm.level,
        courses: selectedCourses,
        descriptors,
      });
      setEnrollmentResult(result);
      setEnrollmentStage('success');
    } catch (err) {
      setEnrollmentError(db.friendly(err));
      setEnrollmentFaceAttempt(n => n + 1);
    } finally {
      setEnrollmentSubmitting(false);
    }
  };

  const handleNoFaceCheckIn = async () => {
    setSubmitting(true);
    await submitCheckIn(null, null);
    setSubmitting(false);
  };

  const finishVerification = (r, photoUrl) => {
    setReceiptData({
      sessionId: session.id,
      course: session.course,
      studentId: r.student_id,
      registeredName: r.name,
      dept: r.dept,
      facePhoto: photoUrl,
      time: new Date(r.created_at).toLocaleTimeString(),
      isoTime: r.created_at,
      status: r.flag || 'Verified',
      locationStatus: r.location,
      distanceM: r.distance_m,
      receiptNo: r.receipt_no
    });
    setStep(5); // Go to receipt screen
  };

  if (showEnrollment) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 page-enter">
        <div className="rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 text-white p-6 sm:p-8 border border-emerald-800 shadow-xl relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-amber-400/10 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <span className="text-[10px] uppercase tracking-[0.22em] font-black text-amber-300">CampusSign · Student onboarding</span>
              <h2 className="text-2xl sm:text-3xl font-black mt-2">Your courses. Your identity. One enrolment.</h2>
              <p className="text-xs sm:text-sm text-emerald-100/80 mt-2 max-w-xl">Create your student profile, choose your courses, and securely enrol your face. Each selected course sends an approval request to its lecturer.</p>
            </div>
            <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-amber-400/15 border border-amber-300/30 items-center justify-center shrink-0"><Sparkles className="w-7 h-7 text-amber-300" /></div>
          </div>
          <div className="relative flex items-center gap-2 mt-6 text-[10px] font-bold text-emerald-100">
            <span className={`px-3 py-1.5 rounded-full ${enrollmentStage === 'profile' ? 'bg-amber-400 text-emerald-950' : 'bg-white/10'}`}>1 · Profile & courses</span>
            <span className="h-px flex-1 bg-emerald-700" />
            <span className={`px-3 py-1.5 rounded-full ${enrollmentStage === 'face' ? 'bg-amber-400 text-emerald-950' : enrollmentStage === 'success' ? 'bg-emerald-700 text-white' : 'bg-white/10'}`}>2 · Face enrolment</span>
            <span className="h-px flex-1 bg-emerald-700" />
            <span className={`px-3 py-1.5 rounded-full ${enrollmentStage === 'success' ? 'bg-amber-400 text-emerald-950' : 'bg-white/10'}`}>3 · Submit</span>
          </div>
        </div>

        {enrollmentError && <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /><span>{enrollmentError}</span></div>}

        {enrollmentStage === 'profile' && (
          <form onSubmit={continueToFaceEnrollment} className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-lg space-y-5">
            <div><h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Student information</h3><p className="text-xs text-slate-500 mt-1">Enter your details exactly as they appear in your institution's records.</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={LABEL}>Matriculation / Student ID *</label><input required value={studentEnrollmentForm.studentId} onChange={e => setStudentEnrollmentForm(prev => ({ ...prev, studentId: e.target.value.toUpperCase() }))} placeholder="e.g. CSC/2024/001" className={FIELD} /></div>
              <div><label className={LABEL}>Full registered name *</label><input required value={studentEnrollmentForm.name} onChange={e => setStudentEnrollmentForm(prev => ({ ...prev, name: e.target.value }))} placeholder="As shown on your student ID" className={FIELD} /></div>
              <div><label className={LABEL}>Department *</label><select required value={studentEnrollmentForm.dept} onChange={e => setStudentEnrollmentForm(prev => ({ ...prev, dept: e.target.value }))} className={FIELD}><option value="">Choose your department</option>{availableDepartments.map(dept => <option key={dept.id} value={dept.name}>{dept.name}</option>)}</select></div>
              <div><label className={LABEL}>Academic level *</label><select value={studentEnrollmentForm.level} onChange={e => setStudentEnrollmentForm(prev => ({ ...prev, level: e.target.value }))} className={FIELD}><option value="100">100 Level</option><option value="200">200 Level</option><option value="300">300 Level</option><option value="400">400 Level</option><option value="500">500 Level</option><option value="600">600 Level</option></select></div>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-extrabold text-sm text-slate-900 dark:text-white">Choose your courses</h3><p className="text-[11px] text-slate-500 mt-0.5">Select only the courses you are actually registered for. You do not have to select every course in your department.</p></div><span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">{selectedCourses.length} selected</span></div>
              {coursesLoading ? <div className="py-8 text-center text-xs text-slate-500"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Loading courses for your department…</div> : availableCourses.length === 0 ? <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">No active courses are available for this department yet. Ask your department administrator to publish its courses and assign verified lecturers.</div> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{availableCourses.map(course => { const selected = selectedCourses.includes(course); return <button key={course} type="button" onClick={() => toggleCourseSelection(course)} className={`text-left p-3.5 rounded-2xl border transition-all ${selected ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 shadow-sm' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-emerald-300'}`}><span className="flex items-center gap-2"><span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${selected ? 'bg-emerald-700 border-emerald-700 text-white' : 'border-slate-300 dark:border-slate-600'}`}>{selected && <Check className="w-3.5 h-3.5" />}</span><span className="text-xs font-bold text-slate-800 dark:text-slate-100">{course}</span></span></button>; })}</div>}
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 leading-relaxed"><Lock className="w-4 h-4 inline mr-1.5 text-emerald-700" />Face data is processed into numeric templates for verification. The template is delivered securely to the selected course lecturers' protected review queues and is not visible as a photo.</div>
            <div className="flex flex-col-reverse sm:flex-row gap-2"><button type="button" onClick={() => setShowEnrollment(false)} className="flex-1 py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold">Back to check-in</button><button type="submit" disabled={coursesLoading || !studentEnrollmentForm.dept || !availableCourses.length} className="flex-1 py-3 rounded-xl bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-amber-300 font-extrabold text-xs shadow-lg">Continue to face enrolment <ArrowRight className="w-4 h-4 inline ml-1" /></button></div>
          </form>
        )}

        {enrollmentStage === 'face' && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-lg space-y-5 text-center">
            <div><h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Enrol your face</h3><p className="text-xs text-slate-500 mt-1">Position your face in the frame and follow the prompts to capture multiple samples.</p></div>
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-left text-xs text-emerald-800 dark:text-emerald-300"><strong>{studentEnrollmentForm.name}</strong> · {studentEnrollmentForm.studentId.toUpperCase()}<br />Submitting for {selectedCourses.length} course(s): {selectedCourses.join(', ')}</div>
            {enrollmentSubmitting ? <div className="py-8 text-xs text-slate-500"><RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />Submitting your enrolment requests securely…</div> : <FaceCapture key={enrollmentFaceAttempt} mode="enroll" onEnrolled={handleStudentFaceEnrollment} />}
            <button type="button" onClick={() => setEnrollmentStage('profile')} className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">Back to profile</button>
          </div>
        )}

        {enrollmentStage === 'success' && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-7 sm:p-9 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-5 animate-fade-up">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto"><Check className="w-8 h-8" /></div>
            <div><h3 className="text-xl font-black text-slate-900 dark:text-white">Enrolment requests submitted!</h3><p className="text-sm text-slate-500 mt-2">Your profile and face template have been sent to the lecturers responsible for your selected courses.</p></div>
            <div className="grid grid-cols-2 gap-3"><div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800"><strong className="block text-2xl text-emerald-700 dark:text-emerald-400">{enrollmentResult?.requests_sent ?? selectedCourses.length}</strong><span className="text-[10px] text-slate-500">Lecturer requests</span></div><div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800"><strong className="block text-2xl text-emerald-700 dark:text-emerald-400">{selectedCourses.length}</strong><span className="text-[10px] text-slate-500">Courses selected</span></div></div>
            <p className="text-xs text-slate-500">Your lecturers must approve each request before you can use face-verified attendance for that course.</p>
            <button onClick={() => { setShowEnrollment(false); setEnrollmentStage('profile'); setStudentEnrollmentForm({ studentId: '', name: '', dept: '', level: '100' }); setSelectedCourses([]); }} className="w-full py-3.5 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-amber-300 font-extrabold text-sm">Return to student check-in</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 page-enter">
      
      {/* STEP PROGRESS BAR */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-2">
          <span className={step >= 1 ? 'text-emerald-800 dark:text-emerald-400' : ''}>1. Token</span>
          <span className={step >= 2 ? 'text-emerald-800 dark:text-emerald-400' : ''}>2. ID Match</span>
          <span className={step >= 3 ? 'text-emerald-800 dark:text-emerald-400' : ''}>3. Consent</span>
          <span className={step >= 4 ? 'text-emerald-800 dark:text-emerald-400' : ''}>4. Biometric</span>
          <span className={step >= 5 ? 'text-emerald-800 dark:text-emerald-400' : ''}>5. Receipt</span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-emerald-800 to-amber-500 h-full transition-all duration-300"
            style={{ width: `${(step / 5) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* STEP 1: REAL QR SCAN */}
      {step === 1 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-lg text-center space-y-6">
          <CampusSignLogo className="w-16 h-16 mx-auto" />
          
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Student Verification Check-In</h2>
            <p className="text-xs text-slate-500 mt-1">
              {session ? (
                <>{session.title ? <><strong>{session.title}</strong> • </> : null}Course: <strong className="text-emerald-800 dark:text-emerald-400">{session.course}</strong> • Invigilator: <strong>{session.teacher}</strong></>
              ) : (
                <>Scan the QR code on the lecturer's screen to begin.</>
              )}
            </p>
          </div>

          {/* QR Status Badge */}
          {isTokenValid ? (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>QR code verified for {session.course}.</span>
            </div>
          ) : checkinError ? (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{checkinError}</span>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-center gap-2">
              <Scan className="w-5 h-5 shrink-0" />
              <span>{checkin ? 'Your check-in window expired. Scan the QR code again.' : 'No QR code scanned yet.'}</span>
            </div>
          )}

          {/* REAL CAMERA QR SCANNER */}
          {isScanningQR && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-800 text-white space-y-3 relative">
              <QRScanner onCode={handleQrCode} />
              <button 
                onClick={() => setIsScanningQR(false)}
                className="w-full py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-700"
              >
                Close Camera
              </button>
            </div>
          )}

          <div className="space-y-3">
            {!isScanningQR && (
              <button
                onClick={() => setIsScanningQR(true)}
                className="w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-2xl text-xs flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-700"
              >
                <Scan className="w-4 h-4 text-emerald-700 dark:text-amber-400" /> Open Camera to Scan QR Code
              </button>
            )}

            <button
              onClick={() => setStep(2)}
              disabled={!isTokenValid}
              className="w-full py-3.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-amber-400 font-extrabold rounded-2xl text-sm transition-colors shadow-lg border border-emerald-700 flex items-center justify-center gap-2"
            >
              <span>Proceed to Student Verification</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 mb-2">First time using CampusSign?</p>
              <button onClick={startStudentEnrollment} className="w-full py-3 rounded-xl border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-extrabold text-xs transition-all hover:-translate-y-0.5">Create student profile & enrol courses <ArrowRight className="w-4 h-4 inline ml-1" /></button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: STUDENT ID LOOKUP */}
      {step === 2 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-lg space-y-6">
          <div className="text-center">
            <UserCheck className="w-12 h-12 text-emerald-700 dark:text-amber-400 mx-auto mb-2" />
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Enter Student Identification</h2>
            <p className="text-xs text-slate-500">System will cross-reference your ID against the academic registry.</p>
          </div>

          {lookupError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{lookupError}</span>
            </div>
          )}

          <form onSubmit={handleVerifyStudentId} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Matriculation / Student ID</label>
              <input 
                type="text" 
                required
                placeholder="e.g. STU001"
                value={studentIdInput}
                onChange={e => setStudentIdInput(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono font-bold uppercase focus:ring-2 focus:ring-emerald-600 outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-emerald-900 hover:bg-emerald-800 text-amber-400 font-extrabold rounded-2xl text-sm transition-colors shadow-lg border border-emerald-700"
            >
              Verify Record Matches Roster
            </button>
          </form>

          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300 text-center">
            <span>Demo Quick IDs to Test: <strong>STU001</strong>, <strong>STU002</strong>, <strong>STU003</strong></span>
          </div>
        </div>
      )}

      {/* STEP 3: MATCH CONFIRMATION & PRIVACY CONSENT */}
      {step === 3 && matchedStudent && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-lg space-y-6">
          <div className="text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Confirm Identity & Privacy</h2>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Registered Student Name:</span>
              <strong className="text-slate-900 dark:text-white font-bold">{matchedStudent.name}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Student ID:</span>
              <strong className="font-mono text-emerald-800 dark:text-emerald-400">{matchedStudent.id}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Department:</span>
              <strong className="text-slate-700 dark:text-slate-300">{matchedStudent.dept}</strong>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-950 text-white border border-emerald-800 text-xs space-y-2">
            <div className="font-bold text-amber-400 flex items-center gap-1.5">
              <Lock className="w-4 h-4" /> Biometric Privacy Notice
            </div>
            <p className="text-[11px] text-emerald-200 leading-relaxed">
              {[faceRequired && 'Your face is captured on this device and compared with the template enrolled for your ID on the secure server. A small photo of your face is attached to your attendance record.', locationMode !== 'off' && `Your phone's location is checked once to confirm you are in the classroom (within about ${radius} m of the lecturer). Only the distance and a pass/flag are saved, never your coordinates.`, !faceRequired && locationMode === 'off' && 'Only your Student ID is recorded for this session.'].filter(Boolean).join(' ')}
            </p>
          </div>

          {faceError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs">{faceError}</div>
          )}

          {enrollment || !faceRequired ? (
            <button
              disabled={submitting}
              onClick={() => {
                locRef.current = locationMode !== 'off' ? getBestFix(10000, 10) : Promise.resolve(null); // asks for location now
                setFaceError('');
                if (!faceRequired) { handleNoFaceCheckIn(); return; }
                setFaceAttempt(a => a + 1);
                setStep(4);
              }}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-emerald-950 font-extrabold rounded-2xl text-sm transition-colors shadow-lg border border-amber-300"
            >
              {faceRequired ? 'I Consent - Start Face Scan' : submitting ? 'Checking in…' : 'I Consent - Check In'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>No face is enrolled for <strong>{matchedStudent.id}</strong> yet. Ask the invigilator to enroll you first (Lecturer Portal &rarr; Student Roster &rarr; Enroll Face).</span>
              </div>
              <button
                onClick={() => { setMatchedStudent(null); setStep(2); }}
                className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold rounded-2xl text-xs border border-slate-300 dark:border-slate-700"
              >
                Back
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: REAL FACE SCAN + LIVENESS */}
      {step === 4 && matchedStudent && enrollment && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-lg text-center space-y-6">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Face Liveness Scan</h2>
            <p className="text-xs text-slate-500 mt-1">Follow the prompts: look straight, blink once, then turn your head and come back.</p>
          </div>

          {faceError ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 text-left">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{faceError}</span>
              </div>
              <button
                onClick={() => { setFaceError(''); setFaceAttempt(a => a + 1); }}
                className="px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-amber-400 font-extrabold rounded-xl text-xs border border-emerald-700"
              >
                Try Again
              </button>
            </div>
          ) : (
            <FaceCapture
              key={faceAttempt}
              mode="verify"
              onCaptured={handleFaceCaptured}
            />
          )}

          <button
            onClick={() => setStep(3)}
            className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* STEP 5: DIGITAL VERIFICATION RECEIPT */}
      {step === 5 && receiptData && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-300 dark:border-emerald-800">
              <Award className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Attendance Receipt Issued</h2>
            {receiptData.status === 'Flagged' ? (
              <p className="text-xs text-rose-600 font-bold">
                Face matched, but your location could not be confirmed in the classroom. Your attendance is flagged for the lecturer to review.
              </p>
            ) : (
              <p className="text-xs text-slate-500">Face match and liveness check passed</p>
            )}
          </div>

          <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950 to-slate-950 text-white border border-emerald-900 shadow-md space-y-3 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-emerald-800">
              <div className="flex items-center gap-2">
                <CampusSignLogo className="w-6 h-6" />
                <span className="font-extrabold text-amber-400">CampusSign Token</span>
              </div>
              <span className="font-mono text-[10px] text-emerald-300">{receiptData.receiptNo}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-emerald-300 block">Student:</span>
                <strong className="text-white text-xs">{receiptData.registeredName}</strong>
              </div>
              <div>
                <span className="text-emerald-300 block">Student ID:</span>
                <strong className="font-mono text-white text-xs">{receiptData.studentId}</strong>
              </div>
              <div>
                <span className="text-emerald-300 block">Course Code:</span>
                <strong className="text-white text-xs">{receiptData.course}</strong>
              </div>
              <div>
                <span className="text-emerald-300 block">Verification Time:</span>
                <strong className="font-mono text-white text-xs">{receiptData.time}</strong>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setStep(1);
              setStudentIdInput('');
              setMatchedStudent(null);
              setRetryCount(0);
              setFaceRetries(0);
            }}
            className="w-full py-3 bg-emerald-900 hover:bg-emerald-800 text-amber-400 font-extrabold rounded-2xl text-xs transition-colors shadow border border-emerald-700"
          >
            Done - Scan Another Student
          </button>
        </div>
      )}

    </div>
  );
}

/* ==========================================================================
   DOCUMENTATION & ARCHITECTURE VIEW
   ========================================================================== */
function DocumentationView({ isDarkMode }) {
  return (
    <div className="max-w-4xl mx-auto space-y-8 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-md">
      
      <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <CampusSignLogo className="w-12 h-12" />
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">CampusSign Architecture Guide</h2>
          <p className="text-xs text-slate-500">Integration, Real Database Connectors & API Specifications</p>
        </div>
      </div>

      <div className="space-y-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-700" /> Plugging in Your Production School Database
        </h3>
        <p>
          To replace the included mock service (`INITIAL_STUDENTS`) with a live enterprise database (PostgreSQL, Supabase, or MySQL), update the `handleVerifyStudentId` endpoint connector:
        </p>

        <pre className="p-4 rounded-2xl bg-slate-950 text-emerald-400 font-mono text-[11px] overflow-x-auto border border-emerald-900">
{`// Example API Integration Handler (Node / Express / Supabase)
app.post('/api/v1/verify-student', async (req, res) => {
  const { studentId, sessionToken, courseCode } = req.body;
  
  // 1. Validate Session Token Rotation
  const isTokenActive = await checkTokenRotation(sessionToken);
  if (!isTokenActive) return res.status(401).json({ error: 'Token Expired' });

  // 2. Query Course-Specific Master Roster
  const { data: student, error } = await supabase
    .from('course_enrolments')
    .select('id, full_name, department, level, course_code')
    .eq('student_id', studentId)
    .eq('course_code', courseCode)
    .single();

  if (error || !student) {
    return res.status(444).json({ error: 'Student Record Not Enrolled in Course' });
  }

  res.json({ success: true, student });
});`}
        </pre>
      </div>

      <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-6 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><ClipboardList className="w-4 h-4 text-emerald-700" /> Student self-enrolment and lecturer approval</h3>
        <p>Run <strong>supabase-step6-self-enrollment.sql</strong> in the Supabase SQL Editor after steps 1–5. Students can then create their profile, select one or more courses, and complete face enrolment from the Student Portal. CampusSign places one private request in each verified lecturer's inbox for the selected course(s).</p>
        <p>Lecturers open <strong>Requests</strong> in their portal to approve or reject enrolments. Approval adds the student to that lecturer's course roster and moves the protected face template into the face verification store. Students cannot check in to that course until approval is complete.</p>
        <p>New lecturer accounts remain locked to a pending-verification screen. An administrator must verify the lecturer in Supabase by setting <code>public.lecturers.is_verified</code> to <code>true</code>. The database policies continue to enforce this restriction even if someone bypasses the interface.</p>
        <p>Attendance records can be edited (name, department, and status) or deleted from the session attendance table. Student ID, course, receipt number, and original check-in time are kept fixed for audit consistency.</p>
      </div>

    </div>
  );
}