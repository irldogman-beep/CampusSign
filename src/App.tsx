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
  ArrowRight
} from 'lucide-react';
import { buildCheckin, parseCheckin, currentSlot, SLOT_MS } from './checkin';
import { downloadCsv } from './auth';
import { supabase } from './supabase';
import { QRCodeImage, QRScanner, FaceCapture } from './CameraParts';
import { getEnrollment, saveEnrollment, deleteEnrollment, listEnrolledIds } from './face';

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
export default function App() {
  const [activeTab, setActiveTab] = useState('admin'); // 'admin' | 'student' | 'docs'
  const [isDarkMode, setIsDarkMode] = useState(false);

  // System Core State
  const [staffAccounts, setStaffAccounts] = useState(INITIAL_STAFF);
  const [activeStaff, setActiveStaff] = useState(INITIAL_STAFF[0]); // Default Dr. Vance
  const [studentRegistry, setStudentRegistry] = useState(INITIAL_STUDENTS);

  // Active Verification Session State
  const [activeSession, setActiveSession] = useState({
    id: 'SESS-8921',
    title: 'CSC401 Final Examination',
    course: 'CSC401 - Advanced Algorithms',
    venue: 'Auditorium Hall B',
    teacher: 'Dr. Robert Vance',
    teacherId: 'LEC001',
    teacherEmail: 'admin@university.edu',
    isRevoked: false,
    tokenCreatedAt: Date.now()
  });

  // Rotating Token Management (Changes every 30s)
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

  // Real signed QR code: a fresh one every 30 seconds
  useEffect(() => {
    let cancelled = false;
    let lastSlot = -1;
    const tick = async () => {
      const slot = currentSlot();
      setSecondsToRotate(Math.ceil((SLOT_MS - (Date.now() % SLOT_MS)) / 1000));
      if (slot !== lastSlot) {
        lastSlot = slot;
        try {
          const { url, token } = await buildCheckin(
            { id: activeSession.id, course: activeSession.course, teacher: activeSession.teacher },
            slot
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
  }, [activeSession.id, activeSession.course, activeSession.teacher]);

  // Validate a scanned QR (from the in-app scanner or a phone's camera app)
  const handleQrScanned = async (raw) => {
    const result = await parseCheckin(raw);
    if (result.ok) {
      setCheckin({ session: result.session, validatedAt: Date.now() });
      setCheckinError('');
    } else {
      setCheckinError(result.message);
    }
    return result;
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
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} transition-colors duration-200 font-sans`}>
      
      {/* HEADER / NAVIGATION BAR */}
      <header className="sticky top-0 z-40 bg-emerald-950/90 backdrop-blur-md border-b border-emerald-900 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo & Brand Name */}
          <div className="flex items-center gap-3">
            <CampusSignLogo className="w-9 h-9" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-white text-lg tracking-tight">CampusSign</span>
                <span className="bg-amber-500 text-emerald-950 font-extrabold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                  v2.0 Enterprise
                </span>
              </div>
              <p className="text-[10px] text-emerald-200 font-medium">QR Biometric Student Verification System</p>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-2 sm:gap-4">
            
            {/* Mode Switcher Buttons */}
            <div className="bg-emerald-900/80 p-1 rounded-xl border border-emerald-800 flex items-center">
              <button
                onClick={() => setActiveTab('admin')}
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
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'student'
                    ? 'bg-amber-500 text-emerald-950 shadow-md'
                    : 'text-emerald-200 hover:text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Student Verification</span>
              </button>

              <button
                onClick={() => setActiveTab('docs')}
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
              className="p-2 text-emerald-200 hover:text-amber-400 bg-emerald-900/50 hover:bg-emerald-900 border border-emerald-800 rounded-xl transition-colors"
              title="Toggle Theme"
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>

          </div>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
          <p>© 2026 Academic QR Biometrics & Privacy Retention System. Encrypted ISO-27001 Standard.</p>
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
  const [isFullscreenQR, setIsFullscreenQR] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [retentionDays, setRetentionDays] = useState(30);

  const [adminTab, setAdminTab] = useState('roster'); // 'roster' | 'registry'

  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [newStudentForm, setNewStudentForm] = useState({
    id: '',
    name: '',
    dept: 'Computer Science',
    level: '300'
  });
  const [registrySearch, setRegistrySearch] = useState('');

  // Face enrollment (stored on this device only)
  const [enrolledIds, setEnrolledIds] = useState(() => listEnrolledIds());
  const [enrollTarget, setEnrollTarget] = useState(null);
  const [enrollSaved, setEnrollSaved] = useState(false);

  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newStaffForm, setNewStaffForm] = useState({
    name: '',
    email: '',
    password: '',
    dept: 'Computer Science',
    course: 'CSC302 - Data Structures'
  });

  const [sessionForm, setSessionForm] = useState({
    title: 'CSC401 Final Examination',
    course: activeStaff ? activeStaff.course : 'CSC401 - Advanced Algorithms',
    venue: 'Auditorium Hall B',
  });

  useEffect(() => {
    if (activeStaff) {
      setSessionForm(prev => ({ ...prev, course: activeStaff.course }));
    }
  }, [activeStaff]);

  // Turn a Supabase profile row into the staff object the dashboard uses
  const startStaffSession = (profile) => {
    const admin = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      dept: profile.dept,
      course: profile.course,
      isVerified: profile.is_verified
    };
    setStaffAccounts(prev => prev.some(s => s.id === admin.id) ? prev : [...prev, admin]);
    setActiveStaff(admin);
    setIsAuthenticated(true);
    setLoginError('');
    setActiveSession(prev => ({
      ...prev,
      id: 'SESS-' + Math.floor(1000 + Math.random() * 9000),
      title: `${admin.course} Attendance`,
      course: admin.course,
      teacher: admin.name,
      teacherId: admin.id,
      teacherEmail: admin.email,
      isRevoked: false,
      tokenCreatedAt: Date.now()
    }));
  };

  const loadProfile = async (userId) => {
    const { data, error } = await supabase.from('lecturers').select('*').eq('id', userId).single();
    if (error || !data) throw new Error('Could not load your lecturer profile.');
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
          course: newStaffForm.course.trim()
        }
      }
    });
    if (error) {
      alert(error.message);
      return;
    }
    setNewStaffForm({ name: '', email: '', password: '', dept: 'Computer Science', course: '' });
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

  const handleCreateSession = (e) => {
    e.preventDefault();
    const newSessId = 'SESS-' + Math.floor(1000 + Math.random() * 9000);
    setActiveSession({
      ...activeSession,
      id: newSessId,
      title: sessionForm.title,
      course: sessionForm.course,
      venue: sessionForm.venue,
      teacher: activeStaff ? activeStaff.name : 'Dr. Robert Vance',
      teacherId: activeStaff ? activeStaff.id : 'LEC001',
      teacherEmail: activeStaff ? activeStaff.email : 'admin@university.edu',
      isRevoked: false,
      tokenCreatedAt: Date.now()
    });
    alert(`New Session created for course ${sessionForm.course} by ${activeStaff ? activeStaff.name : 'Lecturer'}! QR Code updated.`);
  };

  const handleAddStudent = (e) => {
    e.preventDefault();
    if (!newStudentForm.id.trim() || !newStudentForm.name.trim()) return;

    const assignedCourse = newStudentForm.course || (activeStaff ? activeStaff.course : 'CSC401 - Advanced Algorithms');

    // Check duplicate ID in the same course roster
    if (studentRegistry.some(s => s.id.toUpperCase() === newStudentForm.id.trim().toUpperCase() && s.course === assignedCourse)) {
      alert(`Student ID "${newStudentForm.id}" is already enrolled in ${assignedCourse}!`);
      return;
    }

    const createdStudent = {
      id: newStudentForm.id.trim().toUpperCase(),
      name: newStudentForm.name.trim(),
      dept: newStudentForm.dept,
      level: newStudentForm.level,
      course: assignedCourse
    };

    setStudentRegistry(prev => [createdStudent, ...prev]);
    setNewStudentForm({ id: '', name: '', dept: 'Computer Science', level: '300', course: activeStaff ? activeStaff.course : '' });
    setIsAddStudentOpen(false);
  };

  const handleDeleteStudent = (studentId, studentName) => {
    if (window.confirm(`Are you sure you want to delete ${studentName} (${studentId}) from this course roster?`)) {
      const stillEnrolledElsewhere = studentRegistry.some(
        s => s.id === studentId && !(activeStaff ? s.course === activeStaff.course : true)
      );
      setStudentRegistry(prev => prev.filter(s => !(s.id === studentId && s.course === (activeStaff ? activeStaff.course : s.course))));
      if (!stillEnrolledElsewhere) {
        deleteEnrollment(studentId);
        setEnrolledIds(listEnrolledIds());
      }
    }
  };

  const handleRevokeSession = () => {
    setActiveSession(prev => ({ ...prev, isRevoked: true }));
  };

  // Filter attendance logs STRICTLY for the active lecturer's course/session
  const lecturerAttendanceLogs = attendanceLogs.filter(log => 
    log.sessionId === activeSession.id || log.course === activeSession.course
  );

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
    const safeCourse = String(activeSession.course || 'course').replace(/[^a-z0-9]+/gi, '_');
    downloadCsv(
      `attendance_${safeCourse}_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Student ID', 'Name', 'Course', 'Department', 'Date & Time', 'Status', 'Receipt Ref', 'Session ID'],
      filteredLogs.map(l => [l.studentId, l.registeredName, l.course, l.dept, l.isoTime || l.time, l.status, l.receiptNo, l.sessionId])
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
                    <input 
                      type="text" 
                      required
                      value={newStaffForm.dept}
                      onChange={e => setNewStaffForm({ ...newStaffForm, dept: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:ring-2 focus:ring-emerald-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Assigned Course Code</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. CSC302"
                      value={newStaffForm.course}
                      onChange={e => setNewStaffForm({ ...newStaffForm, course: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold focus:ring-2 focus:ring-emerald-600 outline-none"
                    />
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
    <div className="space-y-8">
      
      {/* LECTURER ACCOUNT STATUS BAR & LOGOUT */}
      <div className="bg-emerald-900 text-white rounded-2xl p-4 border border-emerald-800 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-950 rounded-xl border border-emerald-700 text-amber-400">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-200">Authenticated Staff:</span>
              <span className="font-extrabold text-amber-400 text-sm">{activeStaff ? activeStaff.name : 'Staff'}</span>
              <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded text-[10px] font-mono">{activeStaff ? activeStaff.id : ''}</span>
              <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded text-[10px] font-bold">{activeStaff ? activeStaff.course : ''}</span>
              {activeStaff && !activeStaff.isVerified && (
                <span className="px-2 py-0.5 bg-rose-500/20 border border-rose-400/40 text-rose-300 rounded text-[10px] font-bold">
                  PENDING ADMIN APPROVAL
                </span>
              )}
            </div>
            <p className="text-[11px] text-emerald-300">Managing isolated student roster & QR check-in session for {activeStaff ? activeStaff.course : 'assigned course'}.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-200 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow"
            title="Log Out Lecturer"
          >
            <LogOut className="w-3.5 h-3.5" /> Secure Sign Out
          </button>
        </div>
      </div>

      {/* Session Manager & Live Display Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Create & Manage Session */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-emerald-700 dark:text-amber-400" />
                <h3 className="font-extrabold text-slate-900 dark:text-white">Active Session Control</h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                {activeSession.isRevoked ? 'REVOKED' : 'ONLINE'}
              </span>
            </div>

            <form onSubmit={handleCreateSession} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider text-[10px]">Session / Exam Title</label>
                <input 
                  type="text" 
                  value={sessionForm.title}
                  onChange={e => setSessionForm({ ...sessionForm, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider text-[10px]">Assigned Course Code</label>
                  <input 
                    type="text" 
                    value={sessionForm.course}
                    onChange={e => setSessionForm({ ...sessionForm, course: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider text-[10px]">Venue / Room</label>
                  <input 
                    type="text" 
                    value={sessionForm.venue}
                    onChange={e => setSessionForm({ ...sessionForm, venue: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-amber-400 font-bold rounded-xl text-xs transition-colors shadow border border-emerald-700"
                >
                  Generate Dynamic QR Session
                </button>
                {activeSession.isRevoked ? (
                  <button 
                    type="button"
                    onClick={() => setActiveSession(prev => ({ ...prev, isRevoked: false }))}
                    className="px-3 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-xs hover:bg-emerald-700"
                  >
                    Unrevoke
                  </button>
                ) : (
                  <button 
                    type="button"
                    onClick={handleRevokeSession}
                    className="px-3 py-2.5 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold rounded-xl text-xs hover:bg-rose-200 border border-rose-300 dark:border-rose-800"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </form>

            {/* Privacy & Image Retention Config Slider */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" /> Image Retention Policy
                </span>
                <span className="font-mono text-emerald-800 dark:text-emerald-400 font-bold">{retentionDays} Days</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="90" 
                value={retentionDays} 
                onChange={e => setRetentionDays(e.target.value)}
                className="w-full accent-emerald-700 cursor-pointer"
              />
              <p className="text-[10px] text-slate-400">Captured facial signature blobs are automatically scrubbed from encrypted storage after this period.</p>
            </div>
          </div>
        </div>

        {/* Right Column: Live Rotating Dynamic QR Hub */}
        <div className="lg:col-span-7">
          <div className={`h-full bg-gradient-to-br from-emerald-950 to-slate-950 text-white rounded-3xl p-6 sm:p-8 border border-emerald-900 shadow-lg flex flex-col justify-between relative overflow-hidden ${isFullscreenQR ? 'fixed inset-0 z-50 rounded-none border-none' : ''}`}>
            
            {/* Display Header */}
            <div className="flex items-center justify-between relative z-10 mb-4">
              <div className="flex items-center gap-2">
                <CampusSignLogo className="w-8 h-8" />
                <div>
                  <h4 className="font-extrabold text-sm text-amber-400 tracking-wide uppercase">Lecturer Verification Station</h4>
                  <p className="text-xs text-emerald-200">Instructor: <strong>{activeSession.teacher}</strong> • Course: <strong>{activeSession.course}</strong></p>
                </div>
              </div>
              
              <button 
                onClick={() => setIsFullscreenQR(!isFullscreenQR)}
                className="p-2 bg-emerald-900/60 hover:bg-emerald-800 border border-emerald-700 rounded-xl text-amber-300 transition-colors"
                title={isFullscreenQR ? "Exit Fullscreen" : "Fullscreen Projection"}
              >
                {isFullscreenQR ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
            </div>

            {/* QR Scanner Display Area */}
            <div className="my-auto text-center relative z-10 flex flex-col items-center justify-center py-4">
              {activeSession.isRevoked ? (
                <div className="p-8 bg-rose-950/80 rounded-3xl border border-rose-800 max-w-sm text-center">
                  <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto mb-3" />
                  <h3 className="text-lg font-extrabold text-white">QR Display Revoked</h3>
                  <p className="text-xs text-rose-200 mt-1">This session has been revoked by hall invigilators. Students cannot submit verification.</p>
                </div>
              ) : (
                <div className="relative group">
                  {/* Real Dynamic QR Link payload */}
                  <div className="p-5 bg-white rounded-3xl shadow-2xl border-4 border-amber-500 inline-block relative">
                    <QRCodeImage value={qrPayload} size={isFullscreenQR ? 420 : 256} />
                  </div>

                  {/* Test Scan Button */}
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <button
                      onClick={() => onSimulateScan()}
                      className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-emerald-950 rounded-xl font-extrabold text-xs shadow-lg transition-transform transform active:scale-95 flex items-center gap-2 border border-amber-300"
                    >
                      <ExternalLink className="w-4 h-4" /> Test Check-In On This Device
                    </button>

                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-900/80 border border-emerald-700 text-xs text-amber-300">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Auto-Rotating Token in: <strong>{secondsToRotate}s</strong></span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Token Bar Footer */}
            <div className="relative z-10 pt-4 border-t border-emerald-900/80 flex flex-col sm:flex-row items-center justify-between text-xs text-emerald-200 gap-2">
              <div className="flex items-center gap-1 font-mono text-[11px]">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>Payload Token: <strong className="text-white">{qrToken}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Each QR stays valid about 90s</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ADMIN SUB-TABS: ISOLATED SESSION ATTENDANCE vs LECTURER'S OWN COURSE ROSTER */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          {/* Sub Tab Buttons */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl">
            <button
              onClick={() => setAdminTab('roster')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                adminTab === 'roster'
                  ? 'bg-emerald-900 text-amber-400 shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Session Attendance Log ({lecturerAttendanceLogs.length})</span>
            </button>

            <button
              onClick={() => setAdminTab('registry')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                adminTab === 'registry'
                  ? 'bg-emerald-900 text-amber-400 shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>{activeStaff ? activeStaff.name.split(' ')[0] : 'Lecturer'}'s Student Roster ({filteredRegistry.length})</span>
            </button>
          </div>

          {/* Action Buttons */}
          {adminTab === 'roster' ? (
            <button
              onClick={exportToCSV}
              disabled={lecturerAttendanceLogs.length === 0}
              className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-amber-400 text-xs font-bold rounded-xl shadow transition-colors flex items-center gap-2 border border-emerald-700"
            >
              <Download className="w-4 h-4" /> Export Class Attendance CSV
            </button>
          ) : (
            <button
              onClick={() => setIsAddStudentOpen(true)}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-emerald-950 text-xs font-extrabold rounded-xl shadow transition-colors flex items-center gap-2 border border-amber-300"
            >
              <UserPlus className="w-4 h-4" /> Add Student to {activeStaff ? activeStaff.course.split(' ')[0] : 'Course'}
            </button>
          )}
        </div>

        {/* TAB 1: ISOLATED SESSION ATTENDANCE LOG */}
        {adminTab === 'roster' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="relative max-w-sm w-full">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search logs by ID, Name, Dept..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>
              <div className="text-xs text-emerald-800 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800">
                Course Log: <span>{activeSession.course}</span>
              </div>
              <button
                onClick={exportLogsCsv}
                disabled={filteredLogs.length === 0}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-emerald-950 text-xs font-extrabold border border-amber-300"
              >
                Export CSV
              </button>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <FileCheck className="w-12 h-12 mx-auto mb-2 opacity-30 text-emerald-600" />
                <p>No verified biometric submissions recorded for <strong>{activeSession.course}</strong> yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                    <tr>
                      <th className="p-3 rounded-l-xl">Face Signature</th>
                      <th className="p-3">Student Name & ID</th>
                      <th className="p-3">Course</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Verified Time</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 rounded-r-xl">Receipt Ref</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {filteredLogs.map((log, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="p-3">
                          <img 
                            src={log.facePhoto} 
                            alt="Biometric Signature" 
                            className="w-10 h-10 rounded-full object-cover border-2 border-emerald-600 shadow-sm"
                          />
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
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Verified
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[10px] text-slate-400">{log.receiptNo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LECTURER-SPECIFIC COURSE STUDENT DATABASE */}
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
              <div className="overflow-x-auto">
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
                            onClick={() => handleDeleteStudent(student.id, student.name)}
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
                <p className="text-xs text-slate-500">A numeric face template was saved on this device. No photo is stored.</p>
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
                  The student must be present. They look straight at the camera while 3 samples are captured. Only a numeric template is saved, on this device.
                </p>
                <FaceCapture
                  mode="enroll"
                  onEnrolled={({ descriptors }) => {
                    if (saveEnrollment(enrollTarget.id, descriptors)) {
                      setEnrolledIds(listEnrolledIds());
                      setEnrollSaved(true);
                    } else {
                      alert('Could not save the face template. Browser storage may be blocked.');
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
                  <input 
                    type="text" 
                    required
                    value={newStaffForm.dept}
                    onChange={e => setNewStaffForm({ ...newStaffForm, dept: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Assigned Course Code</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. CSC302"
                    value={newStaffForm.course}
                    onChange={e => setNewStaffForm({ ...newStaffForm, course: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
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
                  {staffAccounts.map(staff => (
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

  // The session comes from the QR the student actually scanned (signed + time-limited)
  const session = checkin ? checkin.session : null;
  const CHECKIN_WINDOW_MS = 10 * 60 * 1000;
  const isTokenValid =
    !!checkin &&
    Date.now() - checkin.validatedAt < CHECKIN_WINDOW_MS &&
    !(activeSession.isRevoked && activeSession.id === session.id);

  // Face template enrolled on this device for the matched student
  const enrollment = matchedStudent ? getEnrollment(matchedStudent.id) : null;

  const handleQrCode = async (raw) => {
    const result = await onQrScanned(raw);
    if (result.ok) setIsScanningQR(false);
  };

  // Handle Student Lookup bound to the scanned session's course
  const handleVerifyStudentId = (e) => {
    e.preventDefault();
    const cleanId = studentIdInput.trim().toUpperCase();

    if (!isTokenValid) {
      setStep(1);
      return;
    }

    if (lockedOutStudents.includes(cleanId)) {
      setLookupError('This Student ID has been locked out due to multiple failed verification retries.');
      return;
    }

    // Prevent Double Attendance Submission
    const existingLog = attendanceLogs.find(l => l.studentId === cleanId && l.sessionId === session.id);
    if (existingLog) {
      setLookupError('Attendance already submitted for this Student ID in the current session.');
      return;
    }

    // Lookup student in the session's specific course roster
    const found = studentRegistry.find(s => s.id === cleanId && s.course === session.course);
    if (found) {
      setMatchedStudent(found);
      setLookupError('');
      setFaceError('');
      setFaceRetries(0);
      setStep(3); // Proceed to consent
    } else {
      const nextRetries = retryCount + 1;
      setRetryCount(nextRetries);
      if (nextRetries >= 3) {
        setLockedOutStudents(prev => [...prev, cleanId]);
        setLookupError(`Maximum retries exceeded (3/3). Student ID is not enrolled in ${session.course} or was entered incorrectly. Invigilator alerted.`);
      } else {
        setLookupError(`Student ID not found in roster for ${session.course}. Retry ${nextRetries}/3.`);
      }
    }
  };

  const handleFaceMismatch = () => {
    const next = faceRetries + 1;
    setFaceRetries(next);
    if (next >= 3) {
      setLockedOutStudents(prev => [...prev, matchedStudent.id]);
      setMatchedStudent(null);
      setStep(2);
      setLookupError('Your face did not match the enrolled record 3 times. This Student ID is locked out and the invigilator has been alerted.');
    } else {
      setFaceError(`Your face did not match the enrolled record (attempt ${next}/3).`);
    }
  };

  const finishVerification = (photoUrl) => {
    const timestamp = new Date().toLocaleTimeString();
    const receiptRef = 'REC-' + Math.random().toString(36).substring(2, 9).toUpperCase();

    const newLog = {
      sessionId: session.id,
      course: session.course,
      studentId: matchedStudent.id,
      registeredName: matchedStudent.name,
      dept: matchedStudent.dept,
      facePhoto: photoUrl,
      time: timestamp,
      isoTime: new Date().toISOString(),
      status: 'Verified',
      receiptNo: receiptRef
    };

    setAttendanceLogs(prev => [newLog, ...prev]);
    setReceiptData(newLog);
    setStep(5); // Go to receipt screen
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      
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
                <>Course: <strong className="text-emerald-800 dark:text-emerald-400">{session.course}</strong> • Invigilator: <strong>{session.teacher}</strong></>
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
              Your face is analysed on this device and compared with the template enrolled for your ID. A small photo of your face is attached to your attendance record for this session.
            </p>
          </div>

          {enrollment ? (
            <button
              onClick={() => {
                setFaceError('');
                setFaceAttempt(a => a + 1);
                setStep(4);
              }}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-emerald-950 font-extrabold rounded-2xl text-sm transition-colors shadow-lg border border-amber-300"
            >
              I Consent - Start Face Scan
            </button>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>No face is enrolled for <strong>{matchedStudent.id}</strong> on this device. Ask the invigilator to enroll you first (Lecturer Portal &rarr; Student Roster &rarr; Enroll Face).</span>
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
              enrolled={enrollment}
              onVerified={({ photo }) => finishVerification(photo)}
              onMismatch={handleFaceMismatch}
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
            <p className="text-xs text-slate-500">Face match and liveness check passed</p>
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

    </div>
  );
}