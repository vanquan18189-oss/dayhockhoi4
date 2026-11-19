import {
  collection,
  query,
  where,
  or,
  documentId,
  getDocs,
  onSnapshot,
  Query,
  DocumentData,
  QuerySnapshot,
  FirestoreError
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { resolveCurrentTeacherProfile } from './teacherStorageService';
import {
  isAdmin as checkIsAdmin,
  getLopDay,
  getLopChuNhiem,
  normalizeClassName
} from '../utils/permissions';
import { UserRole } from '../types';

export type ScopedCollectionName =
  | 'assignments'
  | 'exams'
  | 'elearning_lessons'
  | 'assigned_elearning'
  | 'questions'
  | 'games'
  | 'quizzi_games'
  | 'classes'
  | 'class_rosters'
  | 'students';

export interface FirestoreAccessScope {
  role: UserRole | 'guest';
  isAdmin: boolean;
  teacherId: string;
  teacherEmail: string;
  teacherName: string;
  assignedClasses: string[]; // e.g. ['3C', '3D']
  assignedClassVariants: string[]; // e.g. ['Lớp 3C', '3C', 'Lớp 3D', '3D', 'Tất cả các lớp', 'Tất cả']
  assignedClassDocIds: string[]; // e.g. ['3C', '3c', 'C-3C', 'Lớp 3C']
  assignedGrades: string[]; // e.g. ['Khối 3']
  studentCode: string;
  studentClass: string;
  studentClassKey: string;
  studentGrade: string;
}

export interface ScopeOverride {
  role?: UserRole;
  teacherEmail?: string;
  studentCode?: string;
  studentClass?: string;
  studentGrade?: string;
}

function buildClassVariants(classes: string[]): {
  targetVariants: string[];
  docIdVariants: string[];
  grades: string[];
} {
  const targetSet = new Set<string>();
  const docIdSet = new Set<string>();
  const gradeSet = new Set<string>();

  classes.forEach((cls) => {
    const norm = normalizeClassName(cls);
    if (!norm) return;
    targetSet.add(`Lớp ${norm}`);
    targetSet.add(norm);
    targetSet.add(norm.toLowerCase());

    docIdSet.add(norm);
    docIdSet.add(norm.toLowerCase());
    docIdSet.add(`C-${norm}`);
    docIdSet.add(`Lớp ${norm}`);

    const digitMatch = norm.match(/\d+/);
    if (digitMatch) {
      gradeSet.add(`Khối ${digitMatch[0]}`);
    }
  });

  if (targetSet.size > 0) {
    targetSet.add('Tất cả các lớp');
    targetSet.add('Tất cả');
  }

  return {
    targetVariants: Array.from(targetSet).slice(0, 18),
    docIdVariants: Array.from(docIdSet).slice(0, 24),
    grades: gradeSet.size > 0 ? Array.from(gradeSet) : ['Khối 4']
  };
}

/**
 * Resolve the current user's Firestore query access scope.
 * Admin retains unrestricted full-collection access; non-admin teachers and students
 * receive Firestore `where()`-scoped filters matching their ownership/assigned classes.
 */
export function getFirestoreAccessScope(override?: ScopeOverride): FirestoreAccessScope {
  const savedRole =
    override?.role ||
    (typeof window !== 'undefined'
      ? (localStorage.getItem('eduplay_k4_active_role') as UserRole | null)
      : null);

  const authEmail = (
    override?.teacherEmail ||
    (auth && auth.currentUser ? auth.currentUser.email : null) ||
    (typeof window !== 'undefined' ? localStorage.getItem('eduplay_k4_teacher_email') : null) ||
    ''
  )
    .toLowerCase()
    .trim();

  // Check student session first if active role is student
  if (savedRole === 'student') {
    let studentCode = override?.studentCode || '';
    let studentClass = override?.studentClass || '';
    let studentGrade = override?.studentGrade || 'Khối 4';

    if (typeof window !== 'undefined') {
      try {
        const rawStudent = localStorage.getItem('eduplay_k4_student_session');
        if (rawStudent) {
          const parsed = JSON.parse(rawStudent);
          studentCode = studentCode || parsed.sddcn || parsed.code || parsed.id || '';
          studentClass = studentClass || parsed.className || '';
        }
        if (!studentClass) {
          studentClass = localStorage.getItem('eduplay_k4_current_class') || 'Lớp 4A';
        }
      } catch {}
    }

    const normCls = normalizeClassName(studentClass) || '4A';
    const digitMatch = normCls.match(/\d+/);
    if (digitMatch) {
      studentGrade = `Khối ${digitMatch[0]}`;
    }

    const { targetVariants, docIdVariants, grades } = buildClassVariants([normCls]);

    return {
      role: 'student',
      isAdmin: false,
      teacherId: '',
      teacherEmail: '',
      teacherName: '',
      assignedClasses: [normCls],
      assignedClassVariants: targetVariants,
      assignedClassDocIds: docIdVariants,
      assignedGrades: grades,
      studentCode,
      studentClass: `Lớp ${normCls}`,
      studentClassKey: normCls,
      studentGrade
    };
  }

  // Teacher / Admin / Guest resolution
  if (authEmail || savedRole === 'admin' || savedRole === 'teacher') {
    const profile = resolveCurrentTeacherProfile(authEmail);
    const isAdm =
      savedRole === 'admin' ||
      checkIsAdmin(profile) ||
      checkIsAdmin(savedRole || undefined);

    if (isAdm) {
      return {
        role: 'admin',
        isAdmin: true,
        teacherId: profile.id || 'gv-12',
        teacherEmail: profile.email || authEmail,
        teacherName: profile.name || 'Quản trị viên',
        assignedClasses: [],
        assignedClassVariants: [],
        assignedClassDocIds: [],
        assignedGrades: ['Khối 4'],
        studentCode: '',
        studentClass: '',
        studentClassKey: '',
        studentGrade: ''
      };
    }

    // Non-admin teacher: derive assigned classes from homeroom + subject teaching classes
    const rawClasses: string[] = [];
    const homeroom = getLopChuNhiem(profile as any);
    if (homeroom) rawClasses.push(homeroom);
    const teaching = getLopDay(profile as any);
    if (teaching.length > 0) rawClasses.push(...teaching);

    const uniqueClasses = Array.from(new Set(rawClasses.filter(Boolean)));
    const { targetVariants, docIdVariants, grades } = buildClassVariants(uniqueClasses);

    return {
      role: 'teacher',
      isAdmin: false,
      teacherId: profile.id || authEmail || 'gv-unknown',
      teacherEmail: profile.email || authEmail,
      teacherName: profile.name || 'Giáo viên',
      assignedClasses: uniqueClasses,
      assignedClassVariants: targetVariants,
      assignedClassDocIds: docIdVariants,
      assignedGrades: grades,
      studentCode: '',
      studentClass: '',
      studentClassKey: '',
      studentGrade: ''
    };
  }

  return {
    role: 'guest',
    isAdmin: false,
    teacherId: '',
    teacherEmail: '',
    teacherName: '',
    assignedClasses: [],
    assignedClassVariants: [],
    assignedClassDocIds: [],
    assignedGrades: ['Khối 4'],
    studentCode: '',
    studentClass: '',
    studentClassKey: '',
    studentGrade: 'Khối 4'
  };
}

/**
 * Resolve ownership metadata to stamp on newly created/updated documents.
 */
export function resolveTeacherIdentityForWrite(existing?: {
  teacherId?: string;
  teacherEmail?: string;
  teacherName?: string;
  createdBy?: string;
}): {
  teacherId: string;
  teacherEmail: string;
  teacherName: string;
  createdBy: string;
} {
  const email = (
    existing?.teacherEmail ||
    (auth && auth.currentUser ? auth.currentUser.email : null) ||
    (typeof window !== 'undefined' ? localStorage.getItem('eduplay_k4_teacher_email') : null) ||
    ''
  )
    .toLowerCase()
    .trim();

  const profile = resolveCurrentTeacherProfile(email);
  const resolvedId =
    existing?.teacherId && existing.teacherId.length <= 12
      ? existing.teacherId
      : profile.id || 'gv-12';
  const resolvedCreatedBy =
    existing?.createdBy && existing.createdBy.length <= 12
      ? existing.createdBy
      : resolvedId;

  return {
    teacherId: resolvedId,
    teacherEmail: profile.email || email,
    teacherName: existing?.teacherName || profile.name || 'Giáo viên',
    createdBy: resolvedCreatedBy
  };
}

/**
 * Build primary & fallback Firestore queries for a collection according to user role.
 * - Admin: Full unfiltered collection access.
 * - Non-admin Teacher: `where()` filtered by teacherId/createdBy/assigned classes (or shared).
 * - Student: `where()` filtered by student grade/class.
 */
export function buildScopedFirestoreQuery(
  collectionName: ScopedCollectionName,
  scopeOverride?: ScopeOverride
): {
  primaryQuery: Query<DocumentData>;
  fallbackQuery: Query<DocumentData>;
  scope: FirestoreAccessScope;
} | null {
  if (!db) return null;

  const colRef = collection(db, collectionName);
  const scope = getFirestoreAccessScope(scopeOverride);

  // 1. Admin always retains complete unfiltered access
  if (scope.isAdmin) {
    return {
      primaryQuery: colRef,
      fallbackQuery: colRef,
      scope
    };
  }

  // 2. Student scope (filter directly in Firestore by grade / class)
  if (scope.role === 'student') {
    const gradeVal = scope.studentGrade || 'Khối 4';

    if (collectionName === 'class_rosters') {
      const docIds = scope.assignedClassDocIds.length > 0 ? scope.assignedClassDocIds : ['4C', '4c'];
      const qClass = query(colRef, where(documentId(), 'in', docIds.slice(0, 10)));
      return { primaryQuery: qClass, fallbackQuery: qClass, scope };
    }

    if (collectionName === 'classes') {
      const qClasses = query(colRef, where('grade', '==', gradeVal));
      return { primaryQuery: qClasses, fallbackQuery: qClasses, scope };
    }

    if (collectionName === 'students') {
      const clsVars = scope.assignedClassVariants.length > 0 ? scope.assignedClassVariants : [scope.studentClass || 'Lớp 4C'];
      const qStudents = query(colRef, where('className', 'in', clsVars.slice(0, 10)));
      return { primaryQuery: qStudents, fallbackQuery: qStudents, scope };
    }

    const qByGrade = query(colRef, where('grade', '==', gradeVal));
    return {
      primaryQuery: qByGrade,
      fallbackQuery: qByGrade,
      scope
    };
  }

  // 3. Non-admin Teacher scope (filter directly in Firestore using where())
  if (scope.role === 'teacher') {
    const tId = scope.teacherId || 'gv-unknown';

    if (collectionName === 'classes' || collectionName === 'class_rosters') {
      if (scope.assignedClassDocIds.length > 0) {
        const qDoc = query(colRef, where(documentId(), 'in', scope.assignedClassDocIds.slice(0, 20)));
        return { primaryQuery: qDoc, fallbackQuery: qDoc, scope };
      }
      const qEmpty = query(colRef, where(documentId(), 'in', ['__unassigned__']));
      return { primaryQuery: qEmpty, fallbackQuery: qEmpty, scope };
    }

    if (collectionName === 'students') {
      if (scope.assignedClassVariants.length > 0) {
        const qSt = query(colRef, where('className', 'in', scope.assignedClassVariants.slice(0, 20)));
        return { primaryQuery: qSt, fallbackQuery: qSt, scope };
      }
      const qEmpty = query(colRef, where('className', '==', '__unassigned__'));
      return { primaryQuery: qEmpty, fallbackQuery: qEmpty, scope };
    }

    if (collectionName === 'assignments' || collectionName === 'exams' || collectionName === 'assigned_elearning') {
      const qOwnerOnly = query(colRef, where('teacherId', '==', tId));
      if (scope.assignedClassVariants.length > 0) {
        const qCombined = query(
          colRef,
          or(
            where('teacherId', '==', tId),
            where('targetClass', 'in', scope.assignedClassVariants.slice(0, 15))
          )
        );
        return { primaryQuery: qCombined, fallbackQuery: qOwnerOnly, scope };
      }
      return { primaryQuery: qOwnerOnly, fallbackQuery: qOwnerOnly, scope };
    }

    if (collectionName === 'games' || collectionName === 'quizzi_games') {
      const qOwnerOnly = query(colRef, where('teacherId', '==', tId));
      if (scope.assignedClassVariants.length > 0) {
        const qCombined = query(
          colRef,
          or(
            where('teacherId', '==', tId),
            where('classInfo', 'in', scope.assignedClassVariants.slice(0, 15))
          )
        );
        return { primaryQuery: qCombined, fallbackQuery: qOwnerOnly, scope };
      }
      return { primaryQuery: qOwnerOnly, fallbackQuery: qOwnerOnly, scope };
    }

    if (collectionName === 'elearning_lessons' || collectionName === 'questions') {
      const qOwnerOnly = query(colRef, where('teacherId', '==', tId));
      const qScoped = query(
        colRef,
        or(
          where('teacherId', '==', tId),
          where('createdBy', '==', tId),
          where('authorType', '==', 'colleague'),
          where('isShared', '==', true)
        )
      );
      return { primaryQuery: qScoped, fallbackQuery: qOwnerOnly, scope };
    }
  }

  // 4. Guest / pre-login portal (for `classes` dropdown on login portal, allow grade Khối 4; else empty-safe scope)
  if (collectionName === 'classes') {
    const qPortalClasses = query(colRef, where('grade', '==', 'Khối 4'));
    return { primaryQuery: qPortalClasses, fallbackQuery: qPortalClasses, scope };
  }

  const qDefaultGrade = query(colRef, where('grade', '==', 'Khối 4'));
  return {
    primaryQuery: qDefaultGrade,
    fallbackQuery: qDefaultGrade,
    scope
  };
}

/**
 * Execute getDocs with role-based Firestore `where()` query and automatic safe fallback.
 */
export async function getScopedDocs(
  collectionName: ScopedCollectionName,
  scopeOverride?: ScopeOverride
): Promise<QuerySnapshot<DocumentData> | null> {
  const built = buildScopedFirestoreQuery(collectionName, scopeOverride);
  if (!built) return null;

  try {
    return await getDocs(built.primaryQuery);
  } catch (err: any) {
    console.warn(`[FirestoreScope] Primary query fallback for ${collectionName}:`, err?.code || err?.message);
    if (built.fallbackQuery !== built.primaryQuery) {
      try {
        return await getDocs(built.fallbackQuery);
      } catch (fallbackErr) {
        console.warn(`[FirestoreScope] Fallback query failed for ${collectionName}:`, fallbackErr);
      }
    }
    return null;
  }
}

/**
 * Subscribe to Firestore collection using role-based `where()` query inside try/catch,
 * with automatic fallback if a composite/disjunction query index is unavailable.
 */
export function subscribeScopedCollection(
  collectionName: ScopedCollectionName,
  onSnapshotData: (snapshot: QuerySnapshot<DocumentData>) => void,
  onError?: (err: FirestoreError | Error) => void,
  scopeOverride?: ScopeOverride
): () => void {
  const built = buildScopedFirestoreQuery(collectionName, scopeOverride);
  if (!built) {
    return () => {};
  }

  let activeUnsub: (() => void) | null = null;
  let isDisposed = false;

  const attachListener = (targetQuery: Query<DocumentData>, allowFallback: boolean) => {
    try {
      activeUnsub = onSnapshot(
        targetQuery,
        (snapshot) => {
          if (!isDisposed) {
            onSnapshotData(snapshot);
          }
        },
        (err) => {
          if (
            allowFallback &&
            built.fallbackQuery !== targetQuery &&
            (err?.code === 'failed-precondition' || err?.code === 'invalid-argument')
          ) {
            console.warn(`[FirestoreScope] Switching ${collectionName} listener to single-field where() fallback:`, err?.code);
            try {
              activeUnsub?.();
            } catch {}
            attachListener(built.fallbackQuery, false);
            return;
          }
          console.warn(`[FirestoreScope] Snapshot error on ${collectionName}:`, err);
          if (onError) onError(err);
        }
      );
    } catch (err: any) {
      console.warn(`[FirestoreScope] Failed to attach snapshot on ${collectionName}:`, err);
      if (allowFallback && built.fallbackQuery !== targetQuery) {
        attachListener(built.fallbackQuery, false);
        return;
      }
      if (onError) onError(err);
    }
  };

  attachListener(built.primaryQuery, true);

  return () => {
    isDisposed = true;
    if (activeUnsub) {
      try {
        activeUnsub();
      } catch {}
    }
  };
}
