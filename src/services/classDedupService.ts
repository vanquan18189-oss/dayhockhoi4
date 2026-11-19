import { collection, doc, getDoc, getDocs, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { normalizeClassKeyStrict } from './classStorageService';
import { deduplicateAndNormalizeStudents, saveAllStudentsToLocalStorage, getAllStudentsFromLocalStorage } from './studentStorageService';
import { trackedSetDoc, trackedWriteBatch } from './firestoreWriteTracker';
import { StudentRecord } from '../types';

export type DedupActionType =
  | 'merge_class_doc'
  | 'merge_roster_doc'
  | 'normalize_class_name'
  | 'normalize_target_class';

export interface ClassDuplicatePreviewRow {
  rowId: string;
  sourceType: 'classes' | 'class_rosters' | 'assignments' | 'exams';
  sourceCollection: 'classes' | 'class_rosters' | 'assignments' | 'exams';
  sourceDocId: string;
  currentName: string;
  normalizedKey: string;
  keptDocId: string;
  keepRecordLabel: string;
  mergeRecordLabel: string;
  studentCount: number;
  submissionCount: number;
  actionType: DedupActionType;
  hasDifferentData: boolean;
  differenceNote?: string;
  rawDocData: Record<string, any>;
}

export interface ClassDuplicateScanResult {
  scannedAt: string;
  totalClassesDocs: number;
  totalRosterDocs: number;
  totalAssignments: number;
  totalExams: number;
  rows: ClassDuplicatePreviewRow[];
  hasDataDifferences: boolean;
  differenceSummary: string[];
  rawSnapshot: {
    classes: Array<{ id: string; data: any }>;
    class_rosters: Array<{ id: string; data: any }>;
    assignments: Array<{ id: string; data: any }>;
    exams: Array<{ id: string; data: any }>;
  };
}

function getStudentIdentitySignature(st: any): string {
  return String(st?.code || st?.studentCode || st?.id || '').trim().toUpperCase();
}

function areStudentListsDifferent(listA: any[], listB: any[]): { different: boolean; note?: string } {
  const sigA = new Set(listA.map(getStudentIdentitySignature).filter(Boolean));
  const sigB = new Set(listB.map(getStudentIdentitySignature).filter(Boolean));
  if (sigA.size === 0 || sigB.size === 0) {
    return { different: false };
  }
  let onlyInA = 0;
  let onlyInB = 0;
  sigA.forEach((k) => { if (!sigB.has(k)) onlyInA++; });
  sigB.forEach((k) => { if (!sigA.has(k)) onlyInB++; });
  if (onlyInA > 0 || onlyInB > 0) {
    return {
      different: true,
      note: `Danh sách học sinh khác nhau (${onlyInA} HS chỉ ở bản giữ lại, ${onlyInB} HS chỉ ở bản trùng)`
    };
  }
  return { different: false };
}

/**
 * Quét CHỈ ĐỌC toàn bộ Firestore để phát hiện bản ghi lớp trùng hoặc tên lớp chưa chuẩn hóa ("LỚP 3C", "Lớp LỚP 3C", class_rosters/3c...)
 * Tuyệt đối KHÔNG ghi hoặc xóa dữ liệu trong Firestore khi quét.
 */
export async function scanClassDuplicatesFromFirestore(): Promise<ClassDuplicateScanResult> {
  if (!db) {
    throw new Error('Firestore chưa được khởi tạo.');
  }

  const classesDocs: Array<{ id: string; data: any }> = [];
  const rosterDocs: Array<{ id: string; data: any }> = [];
  const assignmentDocs: Array<{ id: string; data: any; subCount: number }> = [];
  const examDocs: Array<{ id: string; data: any; subCount: number }> = [];

  try {
    const [classesSnap, rostersSnap, assignmentsSnap, examsSnap] = await Promise.all([
      getDocs(collection(db, 'classes')),
      getDocs(collection(db, 'class_rosters')),
      getDocs(collection(db, 'assignments')),
      getDocs(collection(db, 'exams'))
    ]);

    classesSnap.forEach((d) => classesDocs.push({ id: d.id, data: d.data() }));
    rostersSnap.forEach((d) => rosterDocs.push({ id: d.id, data: d.data() }));

    for (const aDoc of assignmentsSnap.docs) {
      let subCount = 0;
      try {
        const subSnap = await getDocs(collection(db, 'assignments', aDoc.id, 'submissions'));
        subCount = subSnap.size;
      } catch {}
      assignmentDocs.push({ id: aDoc.id, data: aDoc.data(), subCount });
    }

    for (const eDoc of examsSnap.docs) {
      let subCount = 0;
      try {
        const subSnap = await getDocs(collection(db, 'exams', eDoc.id, 'submissions'));
        subCount = subSnap.size;
      } catch {}
      examDocs.push({ id: eDoc.id, data: eDoc.data(), subCount });
    }
  } catch (err: any) {
    throw new Error(`Không thể đọc dữ liệu Firestore: ${err?.message || String(err)}`);
  }

  // Group class_rosters by normalizedKey to compute student counts and differences
  const rosterGroups = new Map<string, Array<{ id: string; data: any; students: any[] }>>();
  rosterDocs.forEach((docItem) => {
    const rawName = docItem.data?.className || docItem.data?.classKey || docItem.id;
    const normKey = normalizeClassKeyStrict(rawName) || normalizeClassKeyStrict(docItem.id);
    if (!normKey) return;
    const students = Array.isArray(docItem.data?.students)
      ? docItem.data.students
      : (Array.isArray(docItem.data?.studentList) ? docItem.data.studentList : []);
    if (!rosterGroups.has(normKey)) rosterGroups.set(normKey, []);
    rosterGroups.get(normKey)!.push({ id: docItem.id, data: docItem.data, students });
  });

  // Group classes docs by normalizedKey
  const classGroups = new Map<string, Array<{ id: string; data: any }>>();
  classesDocs.forEach((docItem) => {
    const rawName = docItem.data?.name || docItem.data?.className || docItem.id;
    const normKey = normalizeClassKeyStrict(rawName) || normalizeClassKeyStrict(docItem.id);
    if (!normKey) return;
    if (!classGroups.has(normKey)) classGroups.set(normKey, []);
    classGroups.get(normKey)!.push(docItem);
  });

  // Compute submission counts per normalizedKey
  const subCountByKey = new Map<string, number>();
  [...assignmentDocs, ...examDocs].forEach((item) => {
    const rawTarget = item.data?.targetClass || '';
    const normKey = normalizeClassKeyStrict(rawTarget);
    if (!normKey) return;
    subCountByKey.set(normKey, (subCountByKey.get(normKey) || 0) + item.subCount);
  });

  const rows: ClassDuplicatePreviewRow[] = [];
  const differenceSummary: string[] = [];

  // 1. Inspect `classes` collection for duplicate docs OR unnormalized name ("LỚP 3C" -> "Lớp 3C")
  classGroups.forEach((docsInGroup, normKey) => {
    const standardName = `Lớp ${normKey}`;
    // Choose kept doc: prefer exact doc.id === normKey, then non-empty metadata
    const sorted = [...docsInGroup].sort((a, b) => {
      if (a.id === normKey && b.id !== normKey) return -1;
      if (b.id === normKey && a.id !== normKey) return 1;
      return a.id.localeCompare(b.id);
    });
    const keptDoc = sorted[0];
    const groupRosters = rosterGroups.get(normKey) || [];
    const primaryRoster = groupRosters.find((r) => r.id === normKey) || groupRosters[0];
    const studentCount = primaryRoster ? primaryRoster.students.length : 0;
    const submissionCount = subCountByKey.get(normKey) || 0;

    // Check unnormalized name on kept doc itself
    const keptRawName = String(keptDoc.data?.name || keptDoc.id).trim();
    if (keptRawName !== standardName || keptDoc.id !== normKey) {
      rows.push({
        rowId: `classes:${keptDoc.id}`,
        sourceType: 'classes',
        sourceCollection: 'classes',
        sourceDocId: keptDoc.id,
        currentName: keptRawName,
        normalizedKey: normKey,
        keptDocId: normKey,
        keepRecordLabel: `classes/${normKey} (${standardName})`,
        mergeRecordLabel: `Chuẩn hóa tên "${keptRawName}" → "${standardName}" (giữ nguyên dữ liệu)`,
        studentCount,
        submissionCount,
        actionType: 'normalize_class_name',
        hasDifferentData: false,
        rawDocData: keptDoc.data
      });
    }

    // Any additional duplicate docs in `classes`
    sorted.slice(1).forEach((dupDoc) => {
      const dupRawName = String(dupDoc.data?.name || dupDoc.id).trim();
      const dupSubs = [...assignmentDocs, ...examDocs]
        .filter((x) => String(x.data?.targetClass || '').trim() === dupRawName)
        .reduce((acc, x) => acc + x.subCount, 0);

      rows.push({
        rowId: `classes:${dupDoc.id}`,
        sourceType: 'classes',
        sourceCollection: 'classes',
        sourceDocId: dupDoc.id,
        currentName: dupRawName,
        normalizedKey: normKey,
        keptDocId: normKey,
        keepRecordLabel: `classes/${normKey} (${standardName})`,
        mergeRecordLabel: `Gộp & xóa bản ghi trùng classes/${dupDoc.id}`,
        studentCount,
        submissionCount: dupSubs,
        actionType: 'merge_class_doc',
        hasDifferentData: false,
        rawDocData: dupDoc.data
      });
    });
  });

  // 2. Inspect `class_rosters` collection for duplicate docs (e.g. `3c`, `3d`) or unnormalized className
  rosterGroups.forEach((docsInGroup, normKey) => {
    const standardName = `Lớp ${normKey}`;
    const sorted = [...docsInGroup].sort((a, b) => {
      if (a.id === normKey && b.id !== normKey) return -1;
      if (b.id === normKey && a.id !== normKey) return 1;
      return b.students.length - a.students.length;
    });
    const keptRoster = sorted[0];
    const submissionCount = subCountByKey.get(normKey) || 0;

    // Check unnormalized className on kept roster
    const keptRosterName = String(keptRoster.data?.className || keptRoster.id).trim();
    if (keptRosterName !== standardName || String(keptRoster.data?.classKey || '') !== normKey) {
      rows.push({
        rowId: `class_rosters_norm:${keptRoster.id}`,
        sourceType: 'class_rosters',
        sourceCollection: 'class_rosters',
        sourceDocId: keptRoster.id,
        currentName: keptRosterName,
        normalizedKey: normKey,
        keptDocId: normKey,
        keepRecordLabel: `class_rosters/${normKey} (${standardName})`,
        mergeRecordLabel: `Chuẩn hóa className "${keptRosterName}" → "${standardName}"`,
        studentCount: keptRoster.students.length,
        submissionCount,
        actionType: 'normalize_class_name',
        hasDifferentData: false,
        rawDocData: keptRoster.data
      });
    }

    // Duplicate roster documents (e.g. class_rosters/3c, class_rosters/3d)
    sorted.slice(1).forEach((dupRoster) => {
      const diffCheck = areStudentListsDifferent(keptRoster.students, dupRoster.students);
      if (diffCheck.different && diffCheck.note) {
        differenceSummary.push(`class_rosters/${dupRoster.id} vs class_rosters/${keptRoster.id}: ${diffCheck.note}`);
      }
      rows.push({
        rowId: `class_rosters:${dupRoster.id}`,
        sourceType: 'class_rosters',
        sourceCollection: 'class_rosters',
        sourceDocId: dupRoster.id,
        currentName: String(dupRoster.data?.className || dupRoster.id),
        normalizedKey: normKey,
        keptDocId: normKey,
        keepRecordLabel: `class_rosters/${keptRoster.id} (${keptRoster.students.length} HS)`,
        mergeRecordLabel: `Gộp class_rosters/${dupRoster.id} (${dupRoster.students.length} HS) → class_rosters/${keptRoster.id}`,
        studentCount: dupRoster.students.length,
        submissionCount,
        actionType: 'merge_roster_doc',
        hasDifferentData: diffCheck.different,
        differenceNote: diffCheck.note,
        rawDocData: dupRoster.data
      });
    });
  });

  // 3. Inspect `assignments` and `exams` for unnormalized targetClass (e.g. "Lớp LỚP 3C")
  assignmentDocs.forEach((aDoc) => {
    const rawTarget = String(aDoc.data?.targetClass || '').trim();
    const normKey = normalizeClassKeyStrict(rawTarget);
    if (!normKey) return;
    const standardName = `Lớp ${normKey}`;
    if (rawTarget && rawTarget !== standardName && /lớp/i.test(rawTarget)) {
      rows.push({
        rowId: `assignments:${aDoc.id}`,
        sourceType: 'assignments',
        sourceCollection: 'assignments',
        sourceDocId: aDoc.id,
        currentName: rawTarget,
        normalizedKey: normKey,
        keptDocId: normKey,
        keepRecordLabel: `${standardName} (${aDoc.data?.title || aDoc.id})`,
        mergeRecordLabel: `Chuẩn hóa targetClass bài tập "${rawTarget}" → "${standardName}"`,
        studentCount: (rosterGroups.get(normKey)?.[0]?.students.length) || 0,
        submissionCount: aDoc.subCount,
        actionType: 'normalize_target_class',
        hasDifferentData: false,
        rawDocData: aDoc.data
      });
    }
  });

  examDocs.forEach((eDoc) => {
    const rawTarget = String(eDoc.data?.targetClass || '').trim();
    const normKey = normalizeClassKeyStrict(rawTarget);
    if (!normKey) return;
    const standardName = `Lớp ${normKey}`;
    if (rawTarget && rawTarget !== standardName && /lớp/i.test(rawTarget)) {
      rows.push({
        rowId: `exams:${eDoc.id}`,
        sourceType: 'exams',
        sourceCollection: 'exams',
        sourceDocId: eDoc.id,
        currentName: rawTarget,
        normalizedKey: normKey,
        keptDocId: normKey,
        keepRecordLabel: `${standardName} (${eDoc.data?.title || eDoc.id})`,
        mergeRecordLabel: `Chuẩn hóa targetClass đề thi "${rawTarget}" → "${standardName}"`,
        studentCount: (rosterGroups.get(normKey)?.[0]?.students.length) || 0,
        submissionCount: eDoc.subCount,
        actionType: 'normalize_target_class',
        hasDifferentData: false,
        rawDocData: eDoc.data
      });
    }
  });

  return {
    scannedAt: new Date().toISOString(),
    totalClassesDocs: classesDocs.length,
    totalRosterDocs: rosterDocs.length,
    totalAssignments: assignmentDocs.length,
    totalExams: examDocs.length,
    rows,
    hasDataDifferences: differenceSummary.length > 0,
    differenceSummary,
    rawSnapshot: {
      classes: classesDocs,
      class_rosters: rosterDocs,
      assignments: assignmentDocs.map(({ id, data }) => ({ id, data })),
      exams: examDocs.map(({ id, data }) => ({ id, data }))
    }
  };
}

/**
 * Tạo bản sao lưu dữ liệu trước khi thực hiện ghi / gộp Firestore
 */
export function createDedupBackupSnapshot(scanResult: ClassDuplicateScanResult): {
  backupKey: string;
  jsonContent: string;
  filename: string;
} {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupKey = `eduplay_k4_class_dedup_backup_${ts}`;
  const payload = {
    backedUpAt: new Date().toISOString(),
    scanSummary: {
      totalClassesDocs: scanResult.totalClassesDocs,
      totalRosterDocs: scanResult.totalRosterDocs,
      totalAssignments: scanResult.totalAssignments,
      totalExams: scanResult.totalExams
    },
    rawSnapshot: scanResult.rawSnapshot
  };
  const jsonContent = JSON.stringify(payload, null, 2);

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(backupKey, jsonContent);
      localStorage.setItem('eduplay_k4_class_dedup_latest_backup', jsonContent);
    }
  } catch {}

  return {
    backupKey,
    jsonContent,
    filename: `sao-luu-lop-hoc-${ts}.json`
  };
}

/**
 * Thực hiện gộp / chuẩn hóa CHÍNH XÁC 1 dòng đã được admin xác nhận tường minh.
 * Tự động tạo bản sao lưu trước khi ghi Firestore.
 */
export async function executeConfirmedDedupRow(
  row: ClassDuplicatePreviewRow,
  scanResult: ClassDuplicateScanResult
): Promise<{ success: boolean; message: string }> {
  if (!db) {
    return { success: false, message: 'Firestore chưa được khởi tạo.' };
  }

  try {
    // 1. Luôn sao lưu trước khi ghi bất kỳ dữ liệu nào lên Firestore
    createDedupBackupSnapshot(scanResult);

    const standardName = `Lớp ${row.normalizedKey}`;

    if (row.actionType === 'normalize_class_name') {
      if (row.sourceCollection === 'classes') {
        const ref = doc(db, 'classes', row.sourceDocId);
        await trackedSetDoc(
          ref,
          {
            id: row.normalizedKey,
            name: standardName,
            grade: 'Khối 4',
            updatedAt: new Date().toISOString()
          },
          { merge: true },
          { isUserInitiated: true, actionType: 'admin_batch' }
        );
        return {
          success: true,
          message: `Đã chuẩn hóa tên classes/${row.sourceDocId} thành "${standardName}".`
        };
      }

      if (row.sourceCollection === 'class_rosters') {
        const ref = doc(db, 'class_rosters', row.sourceDocId);
        await trackedSetDoc(
          ref,
          {
            className: standardName,
            classKey: row.normalizedKey,
            updatedAt: new Date().toISOString()
          },
          { merge: true },
          { isUserInitiated: true, actionType: 'admin_batch' }
        );
        return {
          success: true,
          message: `Đã chuẩn hóa tên class_rosters/${row.sourceDocId} thành "${standardName}".`
        };
      }
    }

    if (row.actionType === 'merge_roster_doc') {
      const keptRef = doc(db, 'class_rosters', row.keptDocId);
      const sourceRef = doc(db, 'class_rosters', row.sourceDocId);

      const [keptSnap, sourceSnap] = await Promise.all([getDoc(keptRef), getDoc(sourceRef)]);
      const keptStudents: StudentRecord[] = keptSnap.exists() && Array.isArray(keptSnap.data()?.students)
        ? keptSnap.data().students
        : [];
      const sourceStudents: StudentRecord[] = sourceSnap.exists() && Array.isArray(sourceSnap.data()?.students)
        ? sourceSnap.data().students
        : [];

      // Merge students uniquely by studentCode / id
      const mergedMap = new Map<string, StudentRecord>();
      keptStudents.forEach((st) => {
        const sig = getStudentIdentitySignature(st);
        if (sig) mergedMap.set(sig, { ...st, className: standardName });
      });
      sourceStudents.forEach((st) => {
        const sig = getStudentIdentitySignature(st);
        if (sig && !mergedMap.has(sig)) {
          mergedMap.set(sig, { ...st, className: standardName });
        }
      });

      const mergedStudents = deduplicateAndNormalizeStudents(Array.from(mergedMap.values()), standardName);
      const male = mergedStudents.filter((s) => s.gender === 'Nam').length;
      const female = mergedStudents.filter((s) => s.gender === 'Nữ').length;

      await trackedSetDoc(
        keptRef,
        {
          className: standardName,
          classKey: row.normalizedKey,
          totalStudents: mergedStudents.length,
          male,
          female,
          students: mergedStudents,
          updatedAt: new Date().toISOString()
        },
        { merge: true },
        { isUserInitiated: true, actionType: 'admin_batch' }
      );

      if (row.sourceDocId !== row.keptDocId && sourceSnap.exists()) {
        await deleteDoc(sourceRef);
      }

      const localAll = getAllStudentsFromLocalStorage();
      localAll[standardName] = mergedStudents;
      localAll[row.normalizedKey] = mergedStudents;
      saveAllStudentsToLocalStorage(localAll);

      return {
        success: true,
        message: `Đã gộp class_rosters/${row.sourceDocId} vào class_rosters/${row.keptDocId} (${mergedStudents.length} HS).`
      };
    }

    if (row.actionType === 'merge_class_doc') {
      const keptRef = doc(db, 'classes', row.keptDocId);
      const sourceRef = doc(db, 'classes', row.sourceDocId);
      const [keptSnap, sourceSnap] = await Promise.all([getDoc(keptRef), getDoc(sourceRef)]);
      const keptData = keptSnap.exists() ? keptSnap.data() : {};
      const sourceData = sourceSnap.exists() ? sourceSnap.data() : {};

      await setDoc(
        keptRef,
        {
          id: row.keptDocId,
          name: standardName,
          grade: 'Khối 4',
          room: keptData?.room || sourceData?.room || 'Phòng học',
          homeroomTeacher: keptData?.homeroomTeacher || sourceData?.homeroomTeacher || '',
          homeroomTeacherId: keptData?.homeroomTeacherId || sourceData?.homeroomTeacherId || '',
          subjects: (Array.isArray(keptData?.subjects) && keptData.subjects.length > 0)
            ? keptData.subjects
            : (sourceData?.subjects || []),
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );

      // Update any individual student docs pointing to source class
      try {
        const stSnap = await getDocs(collection(db, 'students'));
        const batch = trackedWriteBatch(db, { isUserInitiated: true, actionType: 'admin_batch' });
        let stOps = 0;
        stSnap.forEach((d) => {
          const sData = d.data();
          const sCls = String(sData.className || sData.class || sData.classId || '').trim();
          if (normalizeClassKeyStrict(sCls) === row.normalizedKey && sCls !== standardName) {
            batch.set(d.ref, { className: standardName }, { merge: true });
            stOps++;
          }
        });
        if (stOps > 0) await batch.commit();
      } catch {}

      if (row.sourceDocId !== row.keptDocId && sourceSnap.exists()) {
        await deleteDoc(sourceRef);
      }

      return {
        success: true,
        message: `Đã gộp classes/${row.sourceDocId} vào classes/${row.keptDocId} (${standardName}).`
      };
    }

    if (row.actionType === 'normalize_target_class') {
      const colName = row.sourceCollection === 'exams' ? 'exams' : 'assignments';
      const targetRef = doc(db, colName, row.sourceDocId);
      const existingData = row.rawDocData || {};
      const updatePayload: Record<string, any> = {
        targetClass: standardName,
        updatedAt: new Date().toISOString()
      };
      if (Array.isArray(existingData.targetClasses)) {
        updatePayload.targetClasses = existingData.targetClasses.map((c: string) =>
          normalizeClassKeyStrict(c) === row.normalizedKey ? standardName : c
        );
      }

      await trackedSetDoc(targetRef, updatePayload, { merge: true }, { isUserInitiated: true, actionType: 'admin_batch' });

      // Also normalize studentClass inside submissions subcollection if needed
      try {
        const subSnap = await getDocs(collection(db, colName, row.sourceDocId, 'submissions'));
        if (!subSnap.empty) {
          const batch = trackedWriteBatch(db, { isUserInitiated: true, actionType: 'admin_batch' });
          let subOps = 0;
          subSnap.forEach((sDoc) => {
            const sData = sDoc.data();
            const sCls = String(sData.studentClass || '').trim();
            if (sCls && normalizeClassKeyStrict(sCls) === row.normalizedKey && sCls !== standardName) {
              batch.set(sDoc.ref, { studentClass: standardName }, { merge: true });
              subOps++;
            }
          });
          if (subOps > 0) await batch.commit();
        }
      } catch {}

      return {
        success: true,
        message: `Đã chuẩn hóa lớp giao bài (${colName}/${row.sourceDocId}) thành "${standardName}".`
      };
    }

    return { success: false, message: 'Không xác định được thao tác gộp phù hợp.' };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi khi thực hiện gộp ${row.sourceCollection}/${row.sourceDocId}: ${err?.message || String(err)}`
    };
  }
}
