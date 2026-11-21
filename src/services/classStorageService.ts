import { db } from '../firebaseConfig';
import { useState, useEffect, useMemo } from 'react';
import { subscribeScopedCollection } from './firestoreScopeService';
import { STANDARD_GRADE_SUBJECTS } from '../lib/constants';
import { getSubjectColorStyles, SubjectColorStyle, SUBJECT_COLOR_MAP } from '../utils/subjectColors';

export { STANDARD_GRADE_SUBJECTS, getSubjectColorStyles, SUBJECT_COLOR_MAP };
export type { SubjectColorStyle };

export interface ClassSubjectConfig {
  isVisible: boolean;
  subjectName: string;
}

export interface SchoolClassItem {
  id: string;
  name: string;      // e.g. "Lớp 1C", "Lớp 5D"
  grade: string;     // e.g. "Khối 1", "Khối 5"
  room?: string;     // e.g. "Phòng 101"
  homeroomTeacher?: string;
  subjects?: ClassSubjectConfig[];
}

// Default classes (chỉ giữ lại các lớp Khối 4 sử dụng)
export const REAL_SCHOOL_CLASSES_FALLBACK: SchoolClassItem[] = [
  { id: '4C', name: 'Lớp 4C', grade: 'Khối 4', room: 'Phòng 403', subjects: STANDARD_GRADE_SUBJECTS['Khối 4'].map(s => ({ isVisible: true, subjectName: s })) },
  { id: '4D', name: 'Lớp 4D', grade: 'Khối 4', room: 'Phòng 404', subjects: STANDARD_GRADE_SUBJECTS['Khối 4'].map(s => ({ isVisible: true, subjectName: s })) }
];

/**
 * Chuẩn hóa khóa lớp học:
 * Bỏ mọi tiền tố "Lớp"/"LỚP" lặp lại ở đầu, viết hoa, bỏ khoảng trắng thừa
 * Ví dụ: "Lớp LỚP 3C", "LỚP 3C", " lớp  3c ", "3C" -> "3C"
 */
export function normalizeClassKeyStrict(rawName?: string): string {
  if (!rawName) return '';
  let s = String(rawName).trim().replace(/\s+/g, ' ');
  while (/^(lớp|lop)\b[\s:_-]*/i.test(s)) {
    s = s.replace(/^(lớp|lop)\b[\s:_-]*/i, '').trim();
  }
  return s.replace(/\s+/g, '').toUpperCase();
}

/**
 * Format class name string uniformly to "Lớp 4C" (never "Lớp LỚP 4C")
 */
export function formatClassName(rawName?: string): string {
  if (!rawName) return '';
  const key = normalizeClassKeyStrict(rawName);
  if (!key) return '';
  return `Lớp ${key}`;
}

/**
 * So sánh linh hoạt 2 tên lớp (ví dụ "Lớp 4C", "4C", "4c", " LỚP  4c " đều khớp nhau)
 */
export function isSameClassNameFlexible(classA?: string, classB?: string): boolean {
  const keyA = normalizeClassKeyStrict(classA);
  const keyB = normalizeClassKeyStrict(classB);
  if (!keyA || !keyB) return false;
  return keyA === keyB;
}

/**
 * Sinh danh sách các biến thể tên lớp để dùng cho truy vấn Firestore where(..., 'in', ...)
 * Ví dụ: "Lớp 4C" -> ["Lớp 4C", "4C", "4c", "lớp 4c", "LỚP 4C", "Lớp 4c", "C-4C"]
 */
export function getClassNameQueryVariants(rawClassName?: string): string[] {
  const key = normalizeClassKeyStrict(rawClassName) || '4C';
  const stdName = `Lớp ${key}`;
  const lowerKey = key.toLowerCase();
  return Array.from(
    new Set([
      stdName,
      key,
      lowerKey,
      stdName.toLowerCase(),
      stdName.toUpperCase(),
      `Lớp ${lowerKey}`,
      `C-${key}`
    ])
  );
}

/**
 * Deduplicate and normalize an array of class items in-memory (read-only on Firestore)
 */
export function deduplicateClassItems(items: SchoolClassItem[]): SchoolClassItem[] {
  const classMap = new Map<string, SchoolClassItem>();
  items.forEach((item) => {
    if (!item) return;
    const rawName = (item.name || item.id || '').trim();
    const rawId = (item.id || '').trim();
    const normalizedKey = normalizeClassKeyStrict(rawName) || normalizeClassKeyStrict(rawId);
    if (!normalizedKey || normalizedKey === '4A' || normalizedKey === '4B') return;

    const digit = extractGradeDigit(item.grade) || extractGradeDigit(normalizedKey);
    if (digit !== '4') return;

    const stdName = `Lớp ${normalizedKey}`;
    const normalizedItem: SchoolClassItem = {
      ...item,
      id: normalizedKey,
      name: stdName,
      grade: 'Khối 4',
      subjects: Array.isArray(item.subjects) && item.subjects.length > 0
        ? item.subjects
        : STANDARD_GRADE_SUBJECTS['Khối 4'].map(s => ({ isVisible: true, subjectName: s }))
    };

    if (classMap.has(normalizedKey)) {
      const existing = classMap.get(normalizedKey)!;
      classMap.set(normalizedKey, {
        ...existing,
        id: normalizedKey,
        name: stdName,
        grade: 'Khối 4',
        room: existing.room || normalizedItem.room,
        homeroomTeacher: existing.homeroomTeacher || normalizedItem.homeroomTeacher,
        subjects: (existing.subjects && existing.subjects.length > 0) ? existing.subjects : normalizedItem.subjects
      });
    } else {
      classMap.set(normalizedKey, normalizedItem);
    }
  });

  const list = Array.from(classMap.values());
  list.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
  return list;
}

/**
 * Extract grade digit (e.g. "Khối 5" -> "5", "5C" -> "5")
 */
export function extractGradeDigit(str?: string): string {
  if (!str) return '';
  const match = str.match(/\d+/);
  return match ? match[0] : '';
}

/**
 * Subscribe to real-time classes from Firestore 'classes' collection
 */
export function subscribeRealtimeClasses(callback: (classes: SchoolClassItem[]) => void): () => void {
  if (!db) {
    callback(REAL_SCHOOL_CLASSES_FALLBACK);
    return () => {};
  }

  try {
    const unsub = subscribeScopedCollection(
      'classes',
      (snapshot) => {
        const classMap = new Map<string, SchoolClassItem>();
        REAL_SCHOOL_CLASSES_FALLBACK.forEach((fallbackCls) => {
          const fKey = normalizeClassKeyStrict(fallbackCls.name || fallbackCls.id);
          if (fKey && fKey !== '4A' && fKey !== '4B') {
            classMap.set(fKey, { ...fallbackCls, id: fKey, name: `Lớp ${fKey}`, grade: 'Khối 4' });
          }
        });

        if (!snapshot.empty) {
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const rawId = (docSnap.id || data.id || data.classId || '').trim();
            const rawName = (data.name || data.className || rawId || '').trim();
            const normalizedKey = normalizeClassKeyStrict(rawName) || normalizeClassKeyStrict(rawId);
            if (!normalizedKey || normalizedKey === '4A' || normalizedKey === '4B') return;

            const name = `Lớp ${normalizedKey}`;
            const rawGrade = (data.grade || '').trim();
            const digit = extractGradeDigit(rawGrade) || extractGradeDigit(normalizedKey);
            if (digit !== '4') return;
            const grade = 'Khối 4';

            const newItem: SchoolClassItem = {
              id: normalizedKey,
              name,
              grade,
              room: data.room || '',
              homeroomTeacher: data.homeroomTeacher || '',
              subjects: Array.isArray(data.subjects) && data.subjects.length > 0
                ? data.subjects
                : STANDARD_GRADE_SUBJECTS['Khối 4'].map(s => ({ isVisible: true, subjectName: s }))
            };

            if (classMap.has(normalizedKey)) {
              const existing = classMap.get(normalizedKey)!;
              classMap.set(normalizedKey, {
                ...existing,
                name: newItem.name || existing.name,
                grade: 'Khối 4',
                room: newItem.room || existing.room,
                homeroomTeacher: newItem.homeroomTeacher || existing.homeroomTeacher,
                subjects: (Array.isArray(data.subjects) && data.subjects.length > 0) ? data.subjects : existing.subjects
              });
            } else {
              classMap.set(normalizedKey, newItem);
            }
          });
        }

        const list = Array.from(classMap.values());
        list.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
        callback(list.length > 0 ? list : REAL_SCHOOL_CLASSES_FALLBACK);
      },
      (err) => {
        console.warn('Firestore classes subscription warning:', err);
        callback(REAL_SCHOOL_CLASSES_FALLBACK);
      }
    );
    return unsub;
  } catch (err) {
    console.warn('Error subscribing to Firestore classes:', err);
    callback(REAL_SCHOOL_CLASSES_FALLBACK);
    return () => {};
  }
}

/**
 * Lấy danh sách môn học cấu hình thực tế cho một Lớp/Khối (Truy vấn từ Firestore, LocalStorage hoặc chuẩn GDPT 2018)
 */
export function getSubjectsForClassOrGrade(
  classNameOrGrade?: string,
  classesList?: SchoolClassItem[]
): string[] {
  const cleanName = (classNameOrGrade || '').trim();
  const digit = extractGradeDigit(cleanName) || '4';
  const gradeKey = `Khối ${digit}`;

  // 1. Kiểm tra cấu hình cụ thể của lớp từ danh sách classes (Firestore)
  if (classesList && classesList.length > 0) {
    // Tìm theo tên lớp chính xác trước
    let matchedClass = classesList.find(c => {
      const cNameClean = c.name.replace(/^Lớp\s+/i, '').trim().toLowerCase();
      const targetClean = cleanName.replace(/^Lớp\s+/i, '').trim().toLowerCase();
      return (
        c.id.toLowerCase() === targetClean ||
        cNameClean === targetClean ||
        c.name.toLowerCase() === cleanName.toLowerCase()
      );
    });

    // Nếu không khớp tên lớp cụ thể, tìm theo khối (grade)
    if (!matchedClass) {
      matchedClass = classesList.find(c => {
        const cDigit = extractGradeDigit(c.grade) || extractGradeDigit(c.name);
        return cDigit === digit || (c.grade || '').toLowerCase() === gradeKey.toLowerCase();
      });
    }

    if (matchedClass && Array.isArray(matchedClass.subjects) && matchedClass.subjects.length > 0) {
      const activeSubjects = matchedClass.subjects
        .filter(s => s.isVisible !== false)
        .map(s => s.subjectName.trim())
        .filter(Boolean);
      return activeSubjects;
    }
  }

  // 2. Thử lấy từ localStorage 'eduplay_k4_classes_config'
  try {
    const localConfigStr = typeof window !== 'undefined' ? localStorage.getItem('eduplay_k4_classes_config') : null;
    if (localConfigStr) {
      const localClasses = JSON.parse(localConfigStr);
      if (Array.isArray(localClasses)) {
        let matchedLocal = localClasses.find((c: any) => {
          const cNameClean = (c.name || '').replace(/^Lớp\s+/i, '').trim().toLowerCase();
          const targetClean = cleanName.replace(/^Lớp\s+/i, '').trim().toLowerCase();
          return (c.id || '').toLowerCase() === targetClean || cNameClean === targetClean;
        });

        if (!matchedLocal) {
          matchedLocal = localClasses.find((c: any) => {
            const cDigit = extractGradeDigit(c.grade) || extractGradeDigit(c.name);
            return cDigit === digit || (c.grade || '').toLowerCase() === gradeKey.toLowerCase();
          });
        }

        if (matchedLocal && Array.isArray(matchedLocal.subjects) && matchedLocal.subjects.length > 0) {
          const activeSubjects = matchedLocal.subjects
            .filter((s: any) => s.isVisible !== false)
            .map((s: any) => (s.subjectName || '').trim())
            .filter(Boolean);
          return activeSubjects;
        }
      }
    }
  } catch {}

  // 3. Chuẩn hóa theo Khối học GDPT 2018 tương ứng
  return STANDARD_GRADE_SUBJECTS[gradeKey] || STANDARD_GRADE_SUBJECTS['Khối 4'];
}

/**
 * Cung cấp metadata hiển thị (chủ đề mặc định, màu gradient, styles) cho từng môn học
 */
export function getSubjectDisplayConfig(subjectName: string) {
  const styles = getSubjectColorStyles(subjectName);
  return {
    name: styles.name,
    defaultTopic: styles.defaultTopic,
    gradient: styles.gradient,
    styles
  };
}

/**
 * Custom React Hook: SINGLE SOURCE OF TRUTH for class list
 */
export function useClassesList() {
  const [classes, setClasses] = useState<SchoolClassItem[]>(() => {
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('eduplay_k4_classes_config');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const deduped = deduplicateClassItems(parsed);
            if (deduped.length > 0) return deduped;
          }
        }
      }
    } catch {}
    return REAL_SCHOOL_CLASSES_FALLBACK;
  });
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const handleLocalUpdate = () => {
      try {
        const cached = localStorage.getItem('eduplay_k4_classes_config');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const deduped = deduplicateClassItems(parsed);
            if (deduped.length > 0) {
              setClasses(deduped);
            }
          }
        }
      } catch {}
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('eduplay_classes_updated', handleLocalUpdate);
      window.addEventListener('storage', handleLocalUpdate);
    }

    const unsub = subscribeRealtimeClasses((fetched) => {
      setClasses(fetched);
      setLoading(false);
    });

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('eduplay_classes_updated', handleLocalUpdate);
        window.removeEventListener('storage', handleLocalUpdate);
      }
      unsub();
    };
  }, []);

  /**
   * Filter class list by a specific grade (e.g. "Khối 5", "5", "Lớp 5")
   * If grade is null/undefined/empty or "Tất cả các khối", returns all classes.
   */
  const getClassesForGrade = useMemo(() => {
    return (gradeFilter?: string): SchoolClassItem[] => {
      if (!gradeFilter || gradeFilter === 'Tất cả' || gradeFilter === 'Tất cả các khối' || gradeFilter === 'Tất cả Lớp') {
        return classes;
      }

      const targetDigit = extractGradeDigit(gradeFilter);
      if (!targetDigit) return [];

      const filtered = classes.filter(c => {
        const classDigit = extractGradeDigit(c.grade) || extractGradeDigit(c.name);
        return classDigit === targetDigit;
      });

      return filtered;
    };
  }, [classes]);

  return {
    classes,
    loading,
    getClassesForGrade
  };
}

export function useFirestoreClassesByGrade(grade?: string) {
  const { classes, loading, getClassesForGrade } = useClassesList();
  const filteredClasses = useMemo(() => getClassesForGrade(grade), [getClassesForGrade, grade]);
  return {
    classes: filteredClasses,
    gradeClasses: filteredClasses,
    allClasses: classes,
    loading
  };
}

