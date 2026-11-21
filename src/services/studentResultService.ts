import { doc, setDoc, getDocFromServer, getDoc, collection, getDocs, query, where, deleteDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeStudentCode } from './studentCode';
import { sanitizeForFirestore, withFirestoreTimeout } from '../utils/firestoreSanitizer';

export const STUDENT_RESULTS_COLLECTION = 'student_results';

export interface StudentResultDocument {
  studentCode: string;
  updatedAt: string;
  exams?: Record<string, any>;
  assignments?: Record<string, any>;
  lessons?: Record<string, any>;
  games?: Record<string, any>;
  hocba?: Record<string, any>;
}

// Định nghĩa chính sách lưu trữ lần làm bài cho bài tập
type KeepAttemptPolicy = 'last' | 'best' | 'all';

export interface AssignmentSubmissionPayload {
  assignmentId: string;
  targetId?: string;
  originalAssignmentId?: string | null;
  title?: string;
  subject?: string;
  studentName?: string;
  studentClass?: string;
  score: number | string;
  totalScore?: number;
  maxScore: number;
  correctCount?: number;
  totalQuestions?: number;
  submittedAt: string;
  submittedTime?: string;
  attemptNumber?: number;
  answers?: Record<string, any> | any[];
  answersById?: Record<string, any>;
  questionSnapshot?: any[];
  keepAttempts?: KeepAttemptPolicy;
}

/**
 * Trích xuất và chuẩn hóa Mã học sinh duy nhất (viết hoa, trim khoảng trắng, loại bỏ hậu tố _assignmentId).
 * TUYỆT ĐỐI KHÔNG dùng tên học sinh để định danh.
 */
export function extractCleanStudentCode(sub: any, fallbackDocId?: string): string {
  if (!sub && !fallbackDocId) return '';
  const candidates = [
    sub?.studentCode,
    sub?.maHs,
    sub?.code,
    sub?.sddcn,
    sub?.studentPersistentId,
    sub?.studentId,
    fallbackDocId,
    sub?.id
  ];

  for (const rawVal of candidates) {
    if (!rawVal || typeof rawVal !== 'string') continue;
    let cleaned = rawVal.trim();
    if (!cleaned) continue;

    // Nếu là ID ghép dạng "4C26-27-50_as-12345" thì tách phần mã học sinh phía trước dấu "_"
    if (cleaned.includes('_')) {
      const prefix = cleaned.split('_')[0].trim();
      if (prefix) cleaned = prefix;
    }

    // Nếu có tiền tố "sub-...-4C26-27-50" thì trích xuất mã chuẩn
    const stdMatch = cleaned.match(/([1-5][A-Z]\d{2}-\d{2}-\d{1,3})/i);
    if (stdMatch) {
      return normalizeStudentCode(stdMatch[1]);
    }

    // Bỏ qua các ID hệ thống của bài tập/đề thi không phải mã học sinh
    if (/^(as|ex|sub|assign|exam)-/i.test(cleaned)) {
      continue;
    }

    const norm = normalizeStudentCode(cleaned);
    if (norm) return norm;
  }

  return '';
}

/**
 * Kiểm tra xem một bản ghi hoặc document ID có khớp với Mã học sinh mục tiêu hay không
 * (so sánh không phân biệt hoa/thường và khoảng trắng, TUYỆT ĐỐI KHÔNG phụ thuộc tên học sinh).
 */
export function isMatchingStudentCode(targetStudentCode: string, data: any, docId?: string): boolean {
  const normTarget = (
    extractCleanStudentCode({ studentCode: targetStudentCode }, targetStudentCode) ||
    normalizeStudentCode(targetStudentCode)
  )
    .replace(/\s+/g, '')
    .toUpperCase();
  if (!normTarget) return false;

  const extracted = extractCleanStudentCode(data, docId)
    .replace(/\s+/g, '')
    .toUpperCase();
  if (extracted && extracted === normTarget) return true;

  const rawFields = [
    data?.studentCode,
    data?.maHs,
    data?.code,
    data?.sddcn,
    data?.studentPersistentId,
    data?.studentId,
    data?.id,
    docId
  ];

  for (const field of rawFields) {
    if (!field || typeof field !== 'string') continue;
    const cleanField = field.trim().replace(/\s+/g, '').toUpperCase();
    if (!cleanField) continue;
    if (cleanField === normTarget) return true;
    if (cleanField.startsWith(`${normTarget}_`) || cleanField.endsWith(`-${normTarget}`) || cleanField.endsWith(`_${normTarget}`)) {
      return true;
    }
  }

  return false;
}

/**
 * Sinh danh sách các biến thể ID bài tập (assignmentId, targetId, originalAssignmentId, bản gốc không hậu tố -class-...)
 */
export function getCandidateAssignmentIds(
  assignment: { id?: string; originalAssignmentId?: string; targetClass?: string } | string
): string[] {
  const rawId = String(typeof assignment === 'string' ? assignment : (assignment?.id || '')).trim();
  const origId =
    typeof assignment === 'object' && assignment?.originalAssignmentId
      ? String(assignment.originalAssignmentId).trim()
      : '';
  const targetClass =
    typeof assignment === 'object' && assignment?.targetClass
      ? String(assignment.targetClass).trim()
      : '';

  const set = new Set<string>();
  const addId = (val?: string) => {
    if (!val) return;
    const t = val.trim();
    if (!t) return;
    set.add(t);
    const root = t.replace(/-class-.*$/i, '').trim();
    if (root) set.add(root);
  };

  addId(rawId);
  addId(origId);

  const baseSource = origId || rawId;
  if (baseSource) {
    const root = baseSource.replace(/-class-.*$/i, '').trim();
    const core = root.replace(/^(as|ex)-/i, '').trim();
    if (core) {
      set.add(`as-${core}`);
      set.add(`ex-${core}`);
      if (targetClass) {
        const clsShort = targetClass.replace(/^(lớp|lop)\s*/i, '').replace(/\s+/g, '').toLowerCase();
        if (clsShort) {
          set.add(`as-${core}-class-${clsShort}`);
          set.add(`as-${core}-class-lop${clsShort}`);
          set.add(`as-${core}-class-lp${clsShort}`);
          set.add(`ex-${core}-class-${clsShort}`);
          set.add(`ex-${core}-class-lop${clsShort}`);
          set.add(`ex-${core}-class-lp${clsShort}`);
        }
      }
    }
  }

  return Array.from(set).filter(Boolean);
}

/**
 * Chuẩn hóa đối tượng bài nộp từ bất kỳ cấu trúc nào trong Firestore về định dạng thống nhất theo studentCode
 */
export function normalizeAssignmentSubmissionRecord(
  rawSub: any,
  fallbackStudentCode?: string,
  fallbackAssignmentId?: string
): any | null {
  if (!rawSub || typeof rawSub !== 'object') return null;

  const studentCode = extractCleanStudentCode(rawSub, fallbackStudentCode);
  if (!studentCode) return null;

  const lastAttempt = rawSub.lastAttempt && typeof rawSub.lastAttempt === 'object' ? rawSub.lastAttempt : null;
  const answers =
    rawSub.answers !== undefined && rawSub.answers !== null && Object.keys(rawSub.answers).length > 0
      ? rawSub.answers
      : lastAttempt?.answers !== undefined
      ? lastAttempt.answers
      : rawSub.studentAnswers !== undefined
      ? rawSub.studentAnswers
      : rawSub.answersById || {};

  const answersById =
    rawSub.answersById !== undefined && rawSub.answersById !== null && Object.keys(rawSub.answersById).length > 0
      ? rawSub.answersById
      : lastAttempt?.answersById || {};

  const rawScoreVal =
    rawSub.score !== undefined && rawSub.score !== null && rawSub.score !== '-'
      ? rawSub.score
      : rawSub.totalScore !== undefined && rawSub.totalScore !== null && rawSub.totalScore !== '-'
      ? rawSub.totalScore
      : lastAttempt?.score !== undefined
      ? lastAttempt.score
      : rawSub.bestScore !== undefined
      ? rawSub.bestScore
      : 0;

  let numericScore = 0;
  if (typeof rawScoreVal === 'number' && Number.isFinite(rawScoreVal)) {
    numericScore = rawScoreVal;
  } else if (typeof rawScoreVal === 'string') {
    const parsed = parseFloat(rawScoreVal.replace(/\s*\/.*$/, '').trim());
    if (Number.isFinite(parsed)) numericScore = parsed;
  }

  const submittedTime =
    rawSub.submittedTime ||
    rawSub.submittedAt ||
    lastAttempt?.submittedAt ||
    rawSub.updatedAt ||
    new Date().toISOString();

  const resolvedAssignmentId = String(
    rawSub.assignmentId || rawSub.targetId || rawSub.examId || fallbackAssignmentId || ''
  ).trim();

  return {
    ...rawSub,
    id: rawSub.id || `${studentCode}_${resolvedAssignmentId || 'assignment'}`,
    assignmentId: resolvedAssignmentId,
    targetId: String(rawSub.targetId || resolvedAssignmentId),
    studentCode,
    studentId: studentCode,
    maHs: studentCode,
    studentName: rawSub.studentName || rawSub.name || rawSub.fullName || '',
    studentClass: rawSub.studentClass || rawSub.className || '',
    score: rawSub.score !== undefined ? rawSub.score : numericScore,
    totalScore:
      typeof rawSub.totalScore === 'number' && Number.isFinite(rawSub.totalScore)
        ? rawSub.totalScore
        : numericScore,
    numericScore,
    submittedAt: rawSub.submittedAt || submittedTime,
    submittedTime,
    answers,
    answersById,
    questionSnapshot: rawSub.questionSnapshot || rawSub.assignment?.questions || rawSub.exam?.questions,
    status: 'submitted'
  };
}

/**
 * Dịch vụ quản lý kết quả học tập tập trung theo studentCode
 */
export const studentResultService = {
  /**
   * Lưu kết quả làm bài tập của học sinh
   * Chuẩn hóa và lưu DUY NHẤT theo khóa studentCode (viết hoa, trim khoảng trắng) và targetId / assignmentId.
   */
  async saveAssignmentResult(
    rawStudentCode: string,
    payload: AssignmentSubmissionPayload
  ): Promise<boolean> {
    try {
      const studentCode = extractCleanStudentCode({ studentCode: rawStudentCode }, rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');
      if (!payload?.assignmentId) throw new Error('Mã bài tập không hợp lệ');

      const assignmentId = String(payload.assignmentId).trim();
      const targetId = String(payload.targetId || assignmentId).trim();
      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode);
      const flatDocRef = doc(db, STUDENT_RESULTS_COLLECTION, `${studentCode}_${assignmentId}`);
      const policy: KeepAttemptPolicy = payload.keepAttempts || 'last';

      const parsedScore =
        typeof payload.score === 'number'
          ? payload.score
          : parseFloat(String(payload.score).replace(/\s*\/.*$/, '').trim());
      const safeScore = Number.isFinite(parsedScore) ? parsedScore : 0;
      const safeTotalScore = Number.isFinite(Number(payload.totalScore)) ? Number(payload.totalScore) : safeScore;
      const safeMaxScore = Number.isFinite(Number(payload.maxScore)) ? Number(payload.maxScore) : 10;
      const safeSubmittedAt = payload.submittedAt || new Date().toISOString();
      const safeSubmittedTime = payload.submittedTime || safeSubmittedAt;
      const safeAnswers = sanitizeForFirestore(payload.answers || {});
      const safeAnswersById = sanitizeForFirestore(payload.answersById || {});
      const nowIso = new Date().toISOString();

      const assignmentData: any = {
        assignmentId,
        targetId,
        originalAssignmentId: payload.originalAssignmentId || null,
        title: payload.title || '',
        subject: payload.subject || '',
        studentCode,
        studentId: studentCode,
        maHs: studentCode,
        studentName: payload.studentName || '',
        studentClass: payload.studentClass || '',
        score: payload.score !== undefined ? payload.score : safeScore,
        totalScore: safeTotalScore,
        maxScore: safeMaxScore,
        correctCount: Number.isFinite(Number(payload.correctCount)) ? Number(payload.correctCount) : undefined,
        totalQuestions: Number.isFinite(Number(payload.totalQuestions)) ? Number(payload.totalQuestions) : undefined,
        submittedAt: safeSubmittedAt,
        submittedTime: safeSubmittedTime,
        attemptNumber: Number.isFinite(Number(payload.attemptNumber)) ? Number(payload.attemptNumber) : 1,
        answers: safeAnswers,
        answersById: safeAnswersById,
        questionSnapshot: payload.questionSnapshot ? sanitizeForFirestore(payload.questionSnapshot) : undefined,
        status: 'submitted',
        recordType: 'assignment',
        updatedAt: nowIso
      };

      if (policy === 'last') {
        assignmentData.lastAttempt = {
          score: safeTotalScore,
          submittedAt: safeSubmittedAt,
          submittedTime: safeSubmittedTime,
          answers: safeAnswers,
          answersById: safeAnswersById
        };
      } else if (policy === 'best') {
        assignmentData.bestScore = safeTotalScore;
      }

      // 1. Cập nhật vào hồ sơ học sinh student_results/{studentCode}
      const updatePayload = sanitizeForFirestore({
        studentCode,
        studentId: studentCode,
        maHs: studentCode,
        studentName: payload.studentName || undefined,
        studentClass: payload.studentClass || undefined,
        [`assignments.${assignmentId}`]: assignmentData,
        updatedAt: nowIso,
      });

      // 2. Lưu bản ghi phẳng student_results/{studentCode}_{assignmentId} có trường targetId & assignmentId ở cấp cao nhất
      // để mọi truy vấn where('targetId', '==', ...) hoặc where('assignmentId', '==', ...) đều lấy được ngay lập tức
      const flatPayload = sanitizeForFirestore({
        ...assignmentData,
        id: `${studentCode}_${assignmentId}`,
        studentCode,
        studentId: studentCode,
        maHs: studentCode,
        targetId,
        assignmentId
      });

      await Promise.allSettled([
        withFirestoreTimeout(
          setDoc(docRef, updatePayload, { merge: true }),
          10000,
          'saveAssignmentResult.setDoc'
        ),
        withFirestoreTimeout(
          setDoc(flatDocRef, flatPayload, { merge: true }),
          10000,
          'saveAssignmentResult.flatSetDoc'
        )
      ]);

      try {
        await withFirestoreTimeout(getDocFromServer(docRef), 4000, 'saveAssignmentResult.verify');
      } catch (verifyErr) {
        console.warn('Xác thực getDocFromServer tạm bỏ qua (mạng chậm/offline):', verifyErr);
      }

      return true;
    } catch (error) {
      console.error('Lỗi khi lưu kết quả bài tập:', error);
      throw error;
    }
  },

  /**
   * Lưu kết quả bài kiểm tra (Exams)
   */
  async saveExamResult(
    rawStudentCode: string,
    examId: string,
    resultData: { score: number; maxScore: number; submittedAt: string; type?: string }
  ): Promise<boolean> {
    try {
      const studentCode = extractCleanStudentCode({ studentCode: rawStudentCode }, rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode);
      const safeScore = Number.isFinite(Number(resultData?.score)) ? Number(resultData.score) : 0;
      const safeMaxScore = Number.isFinite(Number(resultData?.maxScore)) ? Number(resultData.maxScore) : 10;

      const updatePayload = sanitizeForFirestore({
        studentCode,
        [`exams.${examId}`]: {
          ...resultData,
          examId,
          targetId: examId,
          studentCode,
          score: safeScore,
          maxScore: safeMaxScore,
          submittedAt: resultData?.submittedAt || new Date().toISOString(),
          type: resultData?.type || 'exam',
          updatedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      });

      await withFirestoreTimeout(
        setDoc(docRef, updatePayload, { merge: true }),
        10000,
        'saveExamResult.setDoc'
      );
      return true;
    } catch (error) {
      console.error('Lỗi khi lưu kết quả kiểm tra:', error);
      throw error;
    }
  },

  /**
   * Lưu kết quả trò chơi / đấu trường (Games)
   */
  async saveGameResult(
    rawStudentCode: string,
    gameId: string,
    resultData: {
      score: number;
      maxScore: number;
      rank: number | 'unranked';
      submittedAt: string;
      completed?: boolean;
      questionsAnswered?: number;
      totalQuestions?: number;
      studentName?: string;
      className?: string;
      roomId?: string;
      roomTitle?: string;
    }
  ): Promise<boolean> {
    try {
      const studentCode = extractCleanStudentCode({ studentCode: rawStudentCode }, rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode);

      const updatePayload = sanitizeForFirestore({
        studentCode,
        [`games.${gameId}`]: {
          ...resultData,
          studentCode,
          updatedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      });

      await withFirestoreTimeout(
        setDoc(docRef, updatePayload, { merge: true }),
        10000,
        'saveGameResult.setDoc'
      );
      return true;
    } catch (error) {
      console.error('Lỗi khi lưu kết quả trò chơi:', error);
      throw error;
    }
  },

  /**
   * Tải kết quả bài kiểm tra (Exams) từ Firestore
   */
  async getExamSubmission(rawStudentCode: string, examId: string): Promise<any | null> {
    try {
      const studentCode = extractCleanStudentCode({ studentCode: rawStudentCode }, rawStudentCode);
      if (!studentCode) return null;
      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode, 'exams', examId);
      const snap = await withFirestoreTimeout(getDoc(docRef), 8000, 'getExamSubmission');
      return snap.exists() ? snap.data() : null;
    } catch (error) {
      console.error('Lỗi khi tải bài kiểm tra từ Firestore:', error);
      return null;
    }
  },

  /**
   * Lưu toàn bộ kết quả bài kiểm tra (Exams) lên Firestore
   */
  async saveFullExamSubmission(
    rawStudentCode: string,
    examId: string,
    submissionData: any
  ): Promise<boolean> {
    try {
      const studentCode = extractCleanStudentCode({ studentCode: rawStudentCode }, rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode, 'exams', examId);
      const sanitizedPayload = sanitizeForFirestore({
        ...submissionData,
        studentCode,
        studentId: studentCode,
        maHs: studentCode,
        examId,
        targetId: examId,
        updatedAt: new Date().toISOString(),
      });

      await withFirestoreTimeout(
        setDoc(docRef, sanitizedPayload, { merge: true }),
        10000,
        'saveFullExamSubmission.setDoc'
      );
      return true;
    } catch (error) {
      console.error('Lỗi khi lưu bài kiểm tra vào Firestore:', error);
      throw error;
    }
  },

  /**
   * Lưu toàn bộ kết quả bài tập (Assignments) lên Firestore
   */
  async saveFullAssignmentSubmission(
    rawStudentCode: string,
    assignmentId: string,
    submissionData: any
  ): Promise<boolean> {
    try {
      const studentCode = extractCleanStudentCode({ studentCode: rawStudentCode }, rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      const cleanAssignId = String(assignmentId).trim();
      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode, 'assignments', cleanAssignId);
      const flatDocRef = doc(db, STUDENT_RESULTS_COLLECTION, `${studentCode}_${cleanAssignId}`);
      const nowIso = new Date().toISOString();

      const sanitizedPayload = sanitizeForFirestore({
        ...submissionData,
        studentCode,
        studentId: studentCode,
        maHs: studentCode,
        assignmentId: cleanAssignId,
        targetId: String(submissionData?.targetId || cleanAssignId),
        recordType: 'assignment',
        status: 'submitted',
        updatedAt: nowIso,
      });

      await Promise.allSettled([
        withFirestoreTimeout(
          setDoc(docRef, sanitizedPayload, { merge: true }),
          10000,
          'saveFullAssignmentSubmission.setDoc'
        ),
        withFirestoreTimeout(
          setDoc(flatDocRef, sanitizedPayload, { merge: true }),
          10000,
          'saveFullAssignmentSubmission.flatSetDoc'
        )
      ]);
      return true;
    } catch (error) {
      console.error('Lỗi khi lưu bài tập vào Firestore:', error);
      throw error;
    }
  },

  /**
   * Xóa triệt để toàn bộ bản ghi kết quả trong `student_results` trên Firestore
   * theo `studentCode` (viết hoa, trim khoảng trắng) và `targetId` / `assignmentId`.
   * TUYỆT ĐỐI KHÔNG phụ thuộc vào tên học sinh.
   */
  async deleteAssignmentSubmissionByStudentCode(
    rawStudentCode: string,
    assignment: { id: string; originalAssignmentId?: string; targetClass?: string; title?: string }
  ): Promise<number> {
    const studentCode = (
      extractCleanStudentCode({ studentCode: rawStudentCode }, rawStudentCode) ||
      normalizeStudentCode(rawStudentCode)
    )
      .trim()
      .toUpperCase();
    if (!studentCode || !assignment?.id || !db) return 0;

    const candIds = getCandidateAssignmentIds(assignment);
    const candIdSet = new Set(candIds);
    const normTitle = (assignment.title || '').trim().toLowerCase();
    let deletedCount = 0;

    const queryIds = candIds.slice(0, 10);

    // 1. Truy vấn trực tiếp trong student_results theo where('targetId', '==', ...) / 'in' và where('assignmentId', '==', ...) / 'in'
    if (queryIds.length > 0) {
      for (const fieldName of ['targetId', 'assignmentId', 'examId'] as const) {
        try {
          const q = query(
            collection(db, STUDENT_RESULTS_COLLECTION),
            where(fieldName, 'in', queryIds)
          );
          const snap = await getDocs(q);
          const tasks: Promise<void>[] = [];
          snap.docs.forEach((d) => {
            if (isMatchingStudentCode(studentCode, d.data(), d.id)) {
              tasks.push(
                deleteDoc(d.ref)
                  .then(() => {
                    deletedCount++;
                  })
                  .catch((err) => {
                    console.warn(`Lỗi xóa doc ${d.id} trong student_results theo ${fieldName}:`, err);
                  })
              );
            }
          });
          if (tasks.length > 0) await Promise.allSettled(tasks);
        } catch {
          // Dự phòng truy vấn từng ID bằng where(fieldName, '==', cid)
          for (const cid of queryIds) {
            try {
              const singleQ = query(
                collection(db, STUDENT_RESULTS_COLLECTION),
                where(fieldName, '==', cid)
              );
              const singleSnap = await getDocs(singleQ);
              for (const d of singleSnap.docs) {
                if (isMatchingStudentCode(studentCode, d.data(), d.id)) {
                  await deleteDoc(d.ref).catch(() => {});
                  deletedCount++;
                }
              }
            } catch {}
          }
        }
      }
    }

    // 2. Xóa trực tiếp các đường dẫn document cố định (flat doc & subcollection assignments/exams)
    const codeVariants = Array.from(
      new Set([studentCode, rawStudentCode.trim(), studentCode.toLowerCase()].filter(Boolean))
    );
    const directDeleteTasks: Promise<void>[] = [];
    for (const cVar of codeVariants) {
      for (const cid of candIds) {
        directDeleteTasks.push(
          deleteDoc(doc(db, STUDENT_RESULTS_COLLECTION, `${cVar}_${cid}`))
            .then(() => {
              deletedCount++;
            })
            .catch(() => {})
        );
        directDeleteTasks.push(
          deleteDoc(doc(db, STUDENT_RESULTS_COLLECTION, `${cVar}_${cid}_1`)).catch(() => {})
        );
        directDeleteTasks.push(
          deleteDoc(doc(db, STUDENT_RESULTS_COLLECTION, cVar, 'assignments', cid)).catch(() => {})
        );
        directDeleteTasks.push(
          deleteDoc(doc(db, STUDENT_RESULTS_COLLECTION, cVar, 'exams', cid)).catch(() => {})
        );
      }
    }
    await Promise.allSettled(directDeleteTasks);

    // 3. Quét toàn bộ collection `student_results` để xóa sạch cả bản ghi phẳng lẫn các khóa trong map `assignments` và `exams`
    try {
      const allSnap = await getDocs(collection(db, STUDENT_RESULTS_COLLECTION));
      const scanTasks: Promise<void>[] = [];

      allSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (!isMatchingStudentCode(studentCode, data, docSnap.id)) return;

        // 3a. Nếu chính tài liệu này là bản ghi kết quả phẳng của bài tập/đề thi này
        const flatTargetId = String(data.targetId || data.assignmentId || data.examId || '').trim();
        const flatRoot = flatTargetId.replace(/-class-.*$/i, '').trim();
        const isFlatMatch =
          (flatTargetId && (candIdSet.has(flatTargetId) || (flatRoot && candIdSet.has(flatRoot)))) ||
          candIds.some((cid) => docSnap.id.toLowerCase().includes(cid.toLowerCase()));

        if (isFlatMatch && !data.assignments && !data.exams) {
          scanTasks.push(
            deleteDoc(docSnap.ref)
              .then(() => {
                deletedCount++;
              })
              .catch(() => {})
          );
          return;
        }

        // 3b. Nếu tài liệu là hồ sơ tổng hợp của học sinh (chứa map `assignments` hoặc `exams`)
        const updatePayload: Record<string, any> = {};
        let hasMapChanges = false;

        if (isFlatMatch) {
          // Trường hợp doc vừa có trường phẳng vừa có map, xóa luôn trường phẳng
          updatePayload.targetId = deleteField();
          updatePayload.assignmentId = deleteField();
          updatePayload.examId = deleteField();
          updatePayload.score = deleteField();
          updatePayload.totalScore = deleteField();
          updatePayload.answers = deleteField();
          updatePayload.answersById = deleteField();
          hasMapChanges = true;
        }

        const checkEntryMatch = (key: string, entry: any): boolean => {
          const entryId = String(entry?.assignmentId || entry?.targetId || entry?.examId || key || '').trim();
          const entryRoot = entryId.replace(/-class-.*$/i, '').trim();
          const keyRoot = String(key).replace(/-class-.*$/i, '').trim();
          const entryTitle = String(entry?.title || '').trim().toLowerCase();
          return Boolean(
            candIdSet.has(key) ||
              candIdSet.has(entryId) ||
              (entryRoot && candIdSet.has(entryRoot)) ||
              (keyRoot && candIdSet.has(keyRoot)) ||
              (normTitle && entryTitle && entryTitle === normTitle)
          );
        };

        if (data.assignments && typeof data.assignments === 'object') {
          const nextAssignments = { ...data.assignments };
          let assignModified = false;
          Object.entries(data.assignments).forEach(([key, entry]: [string, any]) => {
            if (checkEntryMatch(key, entry)) {
              delete nextAssignments[key];
              assignModified = true;
              hasMapChanges = true;
              scanTasks.push(
                deleteDoc(doc(db, STUDENT_RESULTS_COLLECTION, docSnap.id, 'assignments', key)).catch(() => {})
              );
            }
          });
          if (assignModified) {
            updatePayload.assignments = nextAssignments;
          }
        }

        if (data.exams && typeof data.exams === 'object') {
          const nextExams = { ...data.exams };
          let examModified = false;
          Object.entries(data.exams).forEach(([key, entry]: [string, any]) => {
            if (checkEntryMatch(key, entry)) {
              delete nextExams[key];
              examModified = true;
              hasMapChanges = true;
              scanTasks.push(
                deleteDoc(doc(db, STUDENT_RESULTS_COLLECTION, docSnap.id, 'exams', key)).catch(() => {})
              );
            }
          });
          if (examModified) {
            updatePayload.exams = nextExams;
          }
        }

        if (hasMapChanges) {
          updatePayload.updatedAt = new Date().toISOString();
          scanTasks.push(
            updateDoc(docSnap.ref, updatePayload)
              .then(() => {
                deletedCount++;
              })
              .catch(() => {})
          );
        }
      });

      if (scanTasks.length > 0) {
        await Promise.allSettled(scanTasks);
      }
    } catch (err) {
      console.warn('Lỗi khi quét và xóa trong collection student_results:', err);
    }

    return deletedCount;
  },

  /**
   * Truy vấn toàn diện toàn bộ bài nộp của một bài tập từ Firestore và LocalStorage,
   * đối chiếu DUY NHẤT theo Mã học sinh (studentCode viết hoa, trim khoảng trắng).
   * Tuyệt đối KHÔNG lọc hay đối chiếu theo tên học sinh.
   */
  async fetchAssignmentSubmissionsByStudentCode(assignment: {
    id: string;
    originalAssignmentId?: string;
    targetClass?: string;
    title?: string;
    submissions?: any[];
  }): Promise<any[]> {
    if (!assignment?.id) return [];

    const candIds = getCandidateAssignmentIds(assignment);
    const candIdSet = new Set(candIds);
    const normTitle = (assignment.title || '').trim().toLowerCase();

    // Map lưu bản ghi tốt nhất / đầy đủ nhất theo từng studentCode
    const byStudentCode = new Map<string, any>();

    const upsertSubmission = (rawSub: any, fallbackCode?: string, fallbackAssignId?: string) => {
      const normSub = normalizeAssignmentSubmissionRecord(
        rawSub,
        fallbackCode,
        fallbackAssignId || assignment.id
      );
      if (!normSub || !normSub.studentCode) return;

      const code = normSub.studentCode;
      const existing = byStudentCode.get(code);
      if (!existing) {
        byStudentCode.set(code, normSub);
        return;
      }

      // Ưu tiên bản ghi có dữ liệu câu trả lời chi tiết (answers) và điểm cao hơn / mới hơn
      const existingAnswersCount =
        existing.answers && typeof existing.answers === 'object' ? Object.keys(existing.answers).length : 0;
      const newAnswersCount =
        normSub.answers && typeof normSub.answers === 'object' ? Object.keys(normSub.answers).length : 0;

      if (newAnswersCount > existingAnswersCount) {
        byStudentCode.set(code, { ...existing, ...normSub });
      } else if (newAnswersCount === existingAnswersCount) {
        const existingScore = typeof existing.numericScore === 'number' ? existing.numericScore : 0;
        const newScore = typeof normSub.numericScore === 'number' ? normSub.numericScore : 0;
        if (newScore >= existingScore) {
          byStudentCode.set(code, {
            ...existing,
            ...normSub,
            answers: newAnswersCount > 0 ? normSub.answers : existing.answers,
            answersById:
              normSub.answersById && Object.keys(normSub.answersById).length > 0
                ? normSub.answersById
                : existing.answersById
          });
        }
      } else {
        // Giữ answers chi tiết của existing nhưng bổ sung trường còn thiếu
        byStudentCode.set(code, {
          ...normSub,
          ...existing,
          answers: existing.answers,
          answersById:
            existing.answersById && Object.keys(existing.answersById).length > 0
              ? existing.answersById
              : normSub.answersById
        });
      }
    };

    // 1. Lấy từ mảng submissions sẵn có trên đối tượng bài tập
    if (Array.isArray(assignment.submissions)) {
      assignment.submissions.forEach((s) => upsertSubmission(s));
    }

    if (db) {
      // 2. Truy vấn từ assignments/{candId}/submissions, assignments/{candId}, và exams/{candId}/submissions
      const queryIds = candIds.slice(0, 10);
      await Promise.allSettled(
        queryIds.map(async (cid) => {
          try {
            const subSnap = await getDocs(collection(db, 'assignments', cid, 'submissions'));
            subSnap.docs.forEach((d) => {
              upsertSubmission({ id: d.id, ...d.data() }, d.id, cid);
            });
          } catch (err) {
            console.warn(`Lỗi đọc assignments/${cid}/submissions:`, err);
          }

          try {
            const docSnap = await getDoc(doc(db, 'assignments', cid));
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (Array.isArray(data?.submissions)) {
                data.submissions.forEach((s: any) => upsertSubmission(s, undefined, cid));
              }
            }
          } catch (err) {
            console.warn(`Lỗi đọc assignments/${cid}:`, err);
          }

          try {
            const exSubSnap = await getDocs(collection(db, 'exams', cid, 'submissions'));
            exSubSnap.docs.forEach((d) => {
              upsertSubmission({ id: d.id, ...d.data() }, d.id, cid);
            });
          } catch {}
        })
      );

      // 3. Truy vấn trực tiếp trong collection `student_results` bằng where('targetId', 'in', ...) và where('assignmentId', 'in', ...)
      if (queryIds.length > 0) {
        try {
          const qTarget = query(
            collection(db, STUDENT_RESULTS_COLLECTION),
            where('targetId', 'in', queryIds)
          );
          const snapTarget = await getDocs(qTarget);
          snapTarget.docs.forEach((d) => {
            upsertSubmission({ id: d.id, ...d.data() }, d.id);
          });
        } catch (err) {
          console.warn('Lỗi truy vấn student_results theo targetId:', err);
        }

        try {
          const qAssign = query(
            collection(db, STUDENT_RESULTS_COLLECTION),
            where('assignmentId', 'in', queryIds)
          );
          const snapAssign = await getDocs(qAssign);
          snapAssign.docs.forEach((d) => {
            upsertSubmission({ id: d.id, ...d.data() }, d.id);
          });
        } catch (err) {
          console.warn('Lỗi truy vấn student_results theo assignmentId:', err);
        }
      }

      // 4. Quét các hồ sơ học sinh trong `student_results` (cấu trúc map `assignments.{id}` hoặc bản ghi phẳng)
      try {
        const allResultsSnap = await getDocs(collection(db, STUDENT_RESULTS_COLLECTION));
        const subcollectionFetchTasks: Promise<void>[] = [];

        allResultsSnap.docs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const docStudentCode = extractCleanStudentCode(data, docSnap.id);

          // 4a. Nếu chính tài liệu này là bản ghi kết quả phẳng khớp targetId / assignmentId / examId
          const flatTargetId = String(data.targetId || data.assignmentId || data.examId || '').trim();
          if (flatTargetId && candIdSet.has(flatTargetId)) {
            upsertSubmission({ id: docSnap.id, ...data }, docStudentCode || docSnap.id, flatTargetId);
          }

          // 4b. Nếu tài liệu chứa map `assignments` (student_results/{studentCode})
          if (data.assignments && typeof data.assignments === 'object') {
            Object.entries(data.assignments).forEach(([key, entry]: [string, any]) => {
              if (!entry || typeof entry !== 'object') return;
              const entryId = String(entry.assignmentId || entry.targetId || key || '').trim();
              const entryRoot = entryId.replace(/-class-.*$/i, '').trim();
              const keyRoot = String(key).replace(/-class-.*$/i, '').trim();
              const entryTitle = String(entry.title || '').trim().toLowerCase();

              const isMatched =
                candIdSet.has(key) ||
                candIdSet.has(entryId) ||
                (entryRoot && candIdSet.has(entryRoot)) ||
                (keyRoot && candIdSet.has(keyRoot)) ||
                (normTitle && entryTitle && entryTitle === normTitle);

              if (isMatched) {
                upsertSubmission(
                  {
                    ...entry,
                    studentName: entry.studentName || data.studentName || data.name || '',
                    studentClass: entry.studentClass || data.studentClass || data.className || ''
                  },
                  docStudentCode || docSnap.id,
                  entryId || key
                );

                // Nếu bản ghi trong map chưa có chi tiết answers đầy đủ, tải thêm từ subcollection student_results/{studentCode}/assignments/{key}
                const currentCode = extractCleanStudentCode(entry, docStudentCode || docSnap.id);
                const hasDetailedAnswers =
                  (entry.answers && Object.keys(entry.answers).length > 0) ||
                  (entry.lastAttempt?.answers && Object.keys(entry.lastAttempt.answers).length > 0);
                if (currentCode && !hasDetailedAnswers) {
                  subcollectionFetchTasks.push(
                    (async () => {
                      try {
                        const fullSubSnap = await getDoc(
                          doc(db, STUDENT_RESULTS_COLLECTION, docSnap.id, 'assignments', key)
                        );
                        if (fullSubSnap.exists()) {
                          upsertSubmission(
                            { id: fullSubSnap.id, ...fullSubSnap.data() },
                            currentCode,
                            key
                          );
                        }
                      } catch {}
                    })()
                  );
                }
              }
            });
          }

          // 4c. Kiểm tra cả map `exams` trên student_results/{studentCode} phòng trường hợp bài tập nộp qua StudentExamModule
          if (data.exams && typeof data.exams === 'object') {
            Object.entries(data.exams).forEach(([key, entry]: [string, any]) => {
              if (!entry || typeof entry !== 'object') return;
              const entryId = String(entry.examId || entry.targetId || key || '').trim();
              if (candIdSet.has(key) || candIdSet.has(entryId)) {
                upsertSubmission(
                  {
                    ...entry,
                    studentName: entry.studentName || data.studentName || data.name || '',
                    studentClass: entry.studentClass || data.studentClass || data.className || ''
                  },
                  docStudentCode || docSnap.id,
                  entryId || key
                );
              }
            });
          }
        });

        if (subcollectionFetchTasks.length > 0) {
          await Promise.allSettled(subcollectionFetchTasks);
        }
      } catch (err) {
        console.warn('Lỗi khi quét collection student_results:', err);
      }
    }

    // 5. Quét thêm trong LocalStorage trên trình duyệt hiện tại (nếu có)
    if (typeof window !== 'undefined') {
      try {
        for (const cid of candIds) {
          const rawExamSubs = localStorage.getItem(`eduplay_k4_exam_subs_${cid}`);
          if (rawExamSubs) {
            const parsed = JSON.parse(rawExamSubs);
            if (Array.isArray(parsed)) {
              parsed.forEach((s) => upsertSubmission(s, undefined, cid));
            }
          }
        }

        const allExamSubsRaw = localStorage.getItem('eduplay_k4_all_exam_submissions');
        if (allExamSubsRaw) {
          const parsedAll = JSON.parse(allExamSubsRaw);
          if (Array.isArray(parsedAll)) {
            parsedAll.forEach((s: any) => {
              const sid = String(s?.assignmentId || s?.examId || s?.targetId || s?.exam?.id || '').trim();
              if (sid && candIdSet.has(sid)) {
                upsertSubmission(s, undefined, sid);
              }
            });
          }
        }

        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (
            k.startsWith('eduplay_k4_student_submissions_') ||
            k.startsWith('eduplay_k4_student_exam_subs_')
          ) {
            const keyCode = k
              .replace(/^eduplay_k4_student_submissions_/, '')
              .replace(/^eduplay_k4_student_exam_subs_/, '')
              .trim();
            const raw = localStorage.getItem(k);
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                parsed.forEach((item: any) => {
                  const itemAssignId = String(
                    item?.assignmentId || item?.targetId || item?.assignment?.id || item?.examId || item?.exam?.id || item?.id || ''
                  ).trim();
                  const itemRoot = itemAssignId.replace(/-class-.*$/i, '').trim();
                  const itemTitle = String(item?.title || item?.assignment?.title || '').trim().toLowerCase();
                  if (
                    candIdSet.has(itemAssignId) ||
                    (itemRoot && candIdSet.has(itemRoot)) ||
                    (normTitle && itemTitle && itemTitle === normTitle)
                  ) {
                    upsertSubmission(item, keyCode, assignment.id);
                  }
                });
              }
            } catch {}
          }
        }
      } catch (lsErr) {
        console.warn('Lỗi đọc LocalStorage khi đồng bộ bài nộp:', lsErr);
      }
    }

    return Array.from(byStudentCode.values());
  }
};



