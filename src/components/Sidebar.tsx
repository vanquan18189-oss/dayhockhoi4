import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  ClipboardList,
  Database,
  Gamepad2,
  Users,
  SquarePen,
  Coins,
  CheckCircle2,
  GraduationCap,
  ShieldCheck,
  LogOut
} from 'lucide-react';
import { ActiveModule, UserRole, StudentRecord } from '../types';
import { auth } from '../services/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { getStudentAvatarSource } from './common/AnimalAvatars';
import {
  getTeachersFromLocalStorage,
  resolveTeacherNameByEmail,
  getCurrentTeacherProfile,
  TeacherRecord
} from '../services/teacherStorageService';
import { getCurrentStudentSession } from '../services/studentSessionService';
import { StudentProfileModal } from './modals/StudentProfileModal';

export function resolveUserDisplayName(
  email?: string | null,
  displayName?: string | null,
  role: UserRole = 'teacher'
): string {
  if (role === 'student') {
    if (displayName && displayName.trim()) return displayName;
    return 'Học Sinh Tiểu Học';
  }
  return resolveTeacherNameByEmail(email, displayName, getTeachersFromLocalStorage(), role);
}

interface SidebarProps {
  activeModule: ActiveModule;
  onSelectModule: (module: ActiveModule) => void;
  userRole: UserRole;
  badgeCounts?: {
    lessonsCount?: number;
    assignmentsCount?: number;
    questionsCount?: number;
  };
  userName?: string;
  userEmail?: string;
  teacherName?: string;
  teacherEmail?: string;
  currentStudent?: StudentRecord | null;
  currentClass?: string;
  onLogout?: () => void;
  onSwitchRole?: (role: UserRole, targetClass?: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  userRole,
  badgeCounts = {} as NonNullable<SidebarProps['badgeCounts']>,
  userName: propUserName,
  userEmail: propUserEmail,
  teacherName: propTeacherName,
  teacherEmail: propTeacherEmail,
  currentStudent,
  currentClass,
  onLogout,
  onSwitchRole
}) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth?.currentUser || null);
  const [teachersList, setTeachersList] = useState<TeacherRecord[]>(() => getTeachersFromLocalStorage());
  const [isStudentProfileModalOpen, setIsStudentProfileModalOpen] = useState(false);
  const [profileToast, setProfileToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [effectiveStudent, setEffectiveStudent] = useState<StudentRecord | null>(() => {
    return currentStudent || getCurrentStudentSession();
  });

  useEffect(() => {
    if (currentStudent) {
      setEffectiveStudent(currentStudent);
    }
  }, [currentStudent]);

  // Synchronize student data across real-time storage events
  useEffect(() => {
    const handleStudentSessionUpdate = (e: any) => {
      if (e.detail?.student) {
        setEffectiveStudent(e.detail.student);
      } else {
        const session = getCurrentStudentSession();
        if (session) setEffectiveStudent(session);
      }
    };

    const handleStudentsDbUpdate = () => {
      const session = getCurrentStudentSession();
      if (session) setEffectiveStudent(session);
    };

    window.addEventListener('eduplay_student_session_updated', handleStudentSessionUpdate);
    window.addEventListener('student-data-updated', handleStudentsDbUpdate);
    window.addEventListener('eduplay_students_updated', handleStudentsDbUpdate);

    const handleModuleNavigation = (e: any) => {
      const target = e.detail?.module;
      if (target && onSelectModule) {
        onSelectModule(target);
      }
    };
    window.addEventListener('eduplay_navigate_module', handleModuleNavigation);

    return () => {
      window.removeEventListener('eduplay_student_session_updated', handleStudentSessionUpdate);
      window.removeEventListener('student-data-updated', handleStudentsDbUpdate);
      window.removeEventListener('eduplay_students_updated', handleStudentsDbUpdate);
      window.removeEventListener('eduplay_navigate_module', handleModuleNavigation);
    };
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Listen for live updates from User Management Module
  useEffect(() => {
    const handleTeachersUpdate = (e: any) => {
      if (e.detail?.teachers && Array.isArray(e.detail.teachers)) {
        setTeachersList(e.detail.teachers);
      } else {
        setTeachersList(getTeachersFromLocalStorage());
      }
    };

    window.addEventListener('eduplay_teachers_updated', handleTeachersUpdate);
    return () => {
      window.removeEventListener('eduplay_teachers_updated', handleTeachersUpdate);
    };
  }, []);

  // Điều hướng màn hình mặc định sang 'assignment' ("Bài Tập Của Tôi" / "Nhiệm Vụ Học Tập") ngay khi học sinh đăng nhập vào hệ thống
  const handleSelectModuleItem = (moduleId: ActiveModule) => {
    onSelectModule(moduleId);
  };

  const studentMenuItems = [
    {
      id: 'lesson_5e' as ActiveModule,
      label: 'Bài giảng E-Learning',
      shortLabel: 'Bài giảng',
      icon: Sparkles,
      description: 'Kho bài giảng 5E tương tác',
      badge: (badgeCounts?.lessonsCount && badgeCounts.lessonsCount > 0) ? badgeCounts.lessonsCount : undefined,
      colorBg: 'bg-amber-100 text-amber-700 border-amber-200',
      activeColor: 'from-amber-50 to-yellow-50 text-amber-950 border-amber-400',
      roles: ['student']
    },
    {
      id: 'assignment' as ActiveModule,
      label: 'Nhiệm Vụ Học Tập',
      shortLabel: 'Bài tập',
      icon: ClipboardList,
      description: 'Bài tập được giao & nộp bài',
      badge: (badgeCounts?.assignmentsCount && badgeCounts.assignmentsCount > 0) ? badgeCounts.assignmentsCount : undefined,
      colorBg: 'bg-orange-100 text-orange-700 border-orange-200',
      activeColor: 'from-orange-50 to-amber-50 text-orange-950 border-orange-400',
      roles: ['student']
    },
    {
      id: 'interactive_games' as ActiveModule,
      label: 'Đấu Trường Tri Thức',
      shortLabel: 'Trò chơi',
      icon: Gamepad2,
      description: 'Flashcard, đố vui, xếp hạng',
      badge: 'HOT',
      colorBg: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
      activeColor: 'from-fuchsia-50 to-pink-50 text-fuchsia-950 border-fuchsia-400',
      roles: ['student']
    }
  ];

  const teacherMenuItems = [
    {
      id: 'lesson_5e' as ActiveModule,
      label: 'Bài giảng learning',
      shortLabel: 'Bài giảng learning',
      icon: Sparkles,
      description: 'Chuẩn 4 bước sư phạm',
      badge: badgeCounts?.lessonsCount,
      roles: ['admin', 'teacher']
    },
    {
      id: 'question_bank' as ActiveModule,
      label: 'Ngân Hàng Câu Hỏi',
      shortLabel: 'Ngân hàng CH',
      icon: Database,
      description: 'Phân loại 4 mức độ & Excel',
      badge: badgeCounts?.questionsCount,
      roles: ['admin', 'teacher']
    },
    {
      id: 'assignment' as ActiveModule,
      label: 'Quản Lý Bài Tập',
      shortLabel: 'Bài tập',
      icon: ClipboardList,
      description: 'Giao bài & Chấm tự động AI',
      badge: badgeCounts?.assignmentsCount,
      roles: ['admin', 'teacher']
    },
    {
      id: 'interactive_games' as ActiveModule,
      label: 'Trò Chơi Học Tập AI',
      shortLabel: 'Trò chơi AI',
      icon: Gamepad2,
      description: 'Rung chuông vàng & Flashcards',
      roles: ['admin', 'teacher']
    },
    {
      id: 'user_management' as ActiveModule,
      label: 'Quản Lý Người Dùng',
      shortLabel: 'Người dùng',
      icon: Users,
      description: 'Giáo viên, Học sinh & Lớp học',
      roles: ['admin', 'teacher']
    }
  ];

  const menuItems = userRole === 'student' ? studentMenuItems : teacherMenuItems;
  const visibleItems = menuItems.filter(item => item.roles.includes(userRole));

  // Determine separate teacher session vs student session to prevent cross-overriding
  const storedTeacherEmail = typeof window !== 'undefined' ? localStorage.getItem('eduplay_k4_teacher_email') : null;
  const storedTeacherName = typeof window !== 'undefined' ? localStorage.getItem('eduplay_k4_teacher_name') : null;

  const effectiveTeacherEmail =
    propTeacherEmail ||
    firebaseUser?.email ||
    storedTeacherEmail ||
    '';

  const teacherProfile = effectiveTeacherEmail ? getCurrentTeacherProfile(effectiveTeacherEmail) : null;
  const effectiveTeacherRole = teacherProfile?.userRole || (userRole === 'admin' ? 'admin' : 'teacher');

  const effectiveTeacherName = effectiveTeacherEmail
    ? resolveTeacherNameByEmail(
        effectiveTeacherEmail,
        firebaseUser?.displayName || propTeacherName || storedTeacherName || null,
        teachersList,
        userRole === 'admin' || effectiveTeacherRole === 'admin' ? 'admin' : 'teacher'
      )
    : propTeacherName || storedTeacherName || 'Giáo viên';

  const [teacherAvatarImgError, setTeacherAvatarImgError] = useState(false);

  const matchedTeacher = teachersList.find(
    (t) =>
      (t.email && effectiveTeacherEmail && t.email.toLowerCase().trim() === effectiveTeacherEmail.toLowerCase().trim()) ||
      (t.id && teacherProfile?.id && t.id === teacherProfile.id) ||
      (t.name && effectiveTeacherName && t.name.toLowerCase().trim() === effectiveTeacherName.toLowerCase().trim())
  );

  const rawTeacherAvatar =
    matchedTeacher?.avatar ||
    teacherProfile?.avatar ||
    firebaseUser?.photoURL ||
    '';

  useEffect(() => {
    setTeacherAvatarImgError(false);
  }, [rawTeacherAvatar]);

  const isTeacherUrlAvatar = Boolean(
    rawTeacherAvatar &&
    !teacherAvatarImgError &&
    (rawTeacherAvatar.startsWith('http://') ||
      rawTeacherAvatar.startsWith('https://') ||
      rawTeacherAvatar.startsWith('data:image/') ||
      rawTeacherAvatar.startsWith('blob:') ||
      rawTeacherAvatar.startsWith('/'))
  );

  const isTeacherEmojiAvatar = Boolean(
    rawTeacherAvatar &&
    !isTeacherUrlAvatar &&
    /[\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}]/u.test(rawTeacherAvatar)
  );

  const teacherInitialLetter = (
    effectiveTeacherName.trim().charAt(0) ||
    effectiveTeacherEmail.trim().charAt(0) ||
    'U'
  ).toUpperCase();

  // Student specific data
  const activeStudent = effectiveStudent || currentStudent;
  const studentName = activeStudent?.name || activeStudent?.fullName || propUserName || 'Học sinh Lớp 4C';
  const rawStudentClass = activeStudent?.className || currentClass || 'Lớp 4C';
  const cleanStudentClass = rawStudentClass.startsWith('Lớp') ? rawStudentClass : `Lớp ${rawStudentClass}`;
  const studentCoins = activeStudent?.coins ?? 1000;

  // Render avatar supporting animal SVG, custom image, or fallback
  const renderStudentAvatarElement = (sizeClass = 'w-8 h-8 sm:w-9 sm:h-9') => {
    const avatarSource = getStudentAvatarSource(activeStudent, studentName);
    return (
      <img
        src={avatarSource}
        alt={studentName}
        className="w-full h-full rounded-full object-cover shadow-2xs bg-white"
      />
    );
  };

  // Student Horizontal Topbar Navigation
  if (userRole === 'student') {
    return (
      <>
        <div className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-xs z-30">
          <div className="max-w-[1400px] w-full mx-auto px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
            {/* Horizontal Tabs Navigation */}
            <nav
              id="sidebar-navigation"
              aria-label="Điều hướng Cổng Học Sinh"
              className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0 -mb-px"
            >
              {visibleItems.map((item: any) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectModuleItem(item.id)}
                    id={`sidebar-item-${item.id}`}
                    title={item.description}
                    className={`relative flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-3 text-xs sm:text-[13px] whitespace-nowrap shrink-0 border-b-2 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isActive
                        ? 'border-[#4F46E5] text-[#4338CA] font-semibold bg-indigo-50/50'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-[#4F46E5]' : 'text-slate-400'
                      }`}
                    />
                    <span className="sm:hidden">{item.shortLabel || item.label}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                          item.badge === 'HOT'
                            ? isActive
                              ? 'bg-fuchsia-600 text-white'
                              : 'bg-fuchsia-100 text-fuchsia-700'
                            : isActive
                              ? 'bg-[#4F46E5] text-white tabular-nums'
                              : 'bg-amber-100 text-amber-800 tabular-nums'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Right Side: Student Profile, Coins & Logout */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 py-1.5">
              <button
                type="button"
                onClick={() => setIsStudentProfileModalOpen(true)}
                id="student-edit-profile-btn"
                title="Bấm để xem và chỉnh sửa thông tin cá nhân"
                aria-label="Thông tin cá nhân học sinh"
                className="flex items-center gap-2 pr-2 sm:pr-2.5 sm:border-r border-slate-200 rounded-lg hover:bg-slate-50 px-1.5 py-1 transition-colors cursor-pointer min-w-0"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                  {renderStudentAvatarElement('w-7 h-7')}
                </div>
                <div className="hidden md:flex flex-col items-start min-w-0 text-left">
                  <div className="flex items-center gap-1 max-w-[150px]">
                    <span className="text-xs font-semibold text-slate-900 truncate leading-tight">
                      {studentName}
                    </span>
                    <SquarePen className="w-3 h-3 text-slate-400 shrink-0" />
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] leading-tight mt-0.5">
                    <span className="font-semibold text-indigo-700">{cleanStudentClass}</span>
                    <span className="text-slate-300">•</span>
                    <span className="inline-flex items-center gap-0.5 font-bold text-amber-600 tabular-nums">
                      <Coins className="w-3 h-3 text-amber-500 shrink-0" />
                      <span>{studentCoins.toLocaleString('vi-VN')} xu</span>
                    </span>
                  </div>
                </div>
              </button>

              {/* Quick Grade 4 Class Switcher (4C / 4D) */}
              <div className="hidden sm:flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                {['Lớp 4C', 'Lớp 4D'].map((cls) => {
                  const isClsActive = cleanStudentClass.toUpperCase() === cls.toUpperCase();
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => onSwitchRole?.('student', cls)}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                        isClsActive
                          ? 'bg-white text-[#4F46E5] shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cls.replace('Lớp ', '')}
                    </button>
                  );
                })}
              </div>

              {onSwitchRole && (
                <button
                  type="button"
                  onClick={() => onSwitchRole('admin')}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-[#4338CA] transition-colors text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  title="Chuyển sang Cổng Giáo Viên"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#4F46E5]" />
                  <span className="hidden sm:inline">Giáo viên</span>
                </button>
              )}

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  id="student-logout-btn"
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-600 hover:text-rose-600 transition-colors text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  title="Đăng xuất khỏi Cổng Học Sinh"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Đăng xuất</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Student Profile & Password Modal */}
        {typeof document !== 'undefined' &&
          createPortal(
            <>
              <StudentProfileModal
                isOpen={isStudentProfileModalOpen}
                onClose={() => setIsStudentProfileModalOpen(false)}
                student={activeStudent}
                onUpdateSuccess={(updated) => {
                  setEffectiveStudent(updated);
                  setProfileToast({
                    message: '🎉 Cập nhật hồ sơ cá nhân thành công!',
                    type: 'success'
                  });
                  setTimeout(() => {
                    setProfileToast(null);
                  }, 3000);
                }}
              />

              {/* Global Toast Notification for Profile Updates */}
              {profileToast && (
                <div
                  id="sidebar-profile-toast"
                  className="fixed top-5 right-5 z-[9999] px-4 py-3 rounded-2xl bg-emerald-600 text-white text-xs sm:text-sm font-bold shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-top-3 fade-in duration-200 border border-emerald-400/40"
                >
                  <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
                  <span>{profileToast.message}</span>
                </div>
              )}
            </>,
            document.body
          )}
      </>
    );
  }

  // Teacher / Admin Horizontal Topbar Navigation
  const isAdminAccount = userRole === 'admin' || effectiveTeacherRole === 'admin';

  return (
    <div className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-xs">
      <div className="max-w-[1400px] w-full mx-auto px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
        {/* Horizontal Tabs Navigation */}
        <nav
          id="sidebar-navigation"
          aria-label="Điều hướng Cổng Giáo Viên"
          className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto no-scrollbar min-w-0 -mb-px"
        >
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectModule(item.id)}
                id={`sidebar-item-${item.id}`}
                title={item.description}
                className={`relative flex items-center gap-1.5 xl:gap-2 px-2.5 xl:px-3.5 py-3 text-xs xl:text-[13px] whitespace-nowrap shrink-0 border-b-2 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  isActive
                    ? 'border-[#4338CA] text-[#4338CA] font-semibold bg-indigo-50/40'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#4338CA]' : 'text-slate-400'
                  }`}
                />
                <span className="xl:hidden">{item.shortLabel || item.label}</span>
                <span className="hidden xl:inline">{item.label}</span>
                {typeof item.badge === 'number' && (
                  <span
                    className={`text-[11px] font-medium tabular-nums ${
                      isActive ? 'text-[#4338CA]' : 'text-slate-400'
                    }`}
                  >
                    ({item.badge})
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Side: Teacher Profile & Logout */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 py-1.5">
          <div
            className="hidden md:flex items-center gap-2.5 pr-2 border-r border-slate-200 min-w-0"
            title={`${effectiveTeacherName} · ${effectiveTeacherEmail}`}
          >
            <div className="w-8 h-8 rounded-full bg-[#4338CA] border border-indigo-200 flex items-center justify-center text-white overflow-hidden shrink-0">
              {isTeacherUrlAvatar ? (
                <img
                  src={rawTeacherAvatar}
                  alt={effectiveTeacherName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={() => setTeacherAvatarImgError(true)}
                />
              ) : isTeacherEmojiAvatar ? (
                <span className="text-base select-none leading-none">
                  {rawTeacherAvatar}
                </span>
              ) : (
                <span className="text-xs font-bold uppercase select-none text-white">
                  {teacherInitialLetter}
                </span>
              )}
            </div>
            <div className="min-w-0 flex flex-col">
              <span className="text-xs font-semibold text-slate-900 truncate max-w-[150px] leading-tight">
                {effectiveTeacherName}
              </span>
              <span className="text-[11px] text-slate-500 truncate max-w-[150px] leading-tight">
                {isAdminAccount ? 'Quản trị viên' : 'Giáo viên'}
              </span>
            </div>
          </div>

          {onSwitchRole && (
            <button
              type="button"
              onClick={() => onSwitchRole('student', 'Lớp 4C')}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-[#4338CA] transition-colors text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              title="Chuyển sang giao diện Học sinh Khối 4"
            >
              <GraduationCap className="w-3.5 h-3.5 text-[#4F46E5]" />
              <span className="hidden sm:inline">Học sinh</span>
            </button>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              id="teacher-logout-btn"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-600 hover:text-rose-600 transition-colors text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              title="Đăng xuất khỏi hệ thống"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Đăng xuất</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

