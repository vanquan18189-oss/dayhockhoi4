import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  updateDoc,
  deleteField,
  documentId,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import {
  normalizeStudentCode,
  getClassCodePrefix,
  parseStudentCode,
  normalizeStudentName
} from './studentCode';
import {
  getStudentsFromLocalStorage,
  fetchClassStudentsFromFirestore
} from './studentStorageService';
import { StudentRecord } from '../types';
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
  submittedAt?: string;
  submittedTime?: string;
  attemptNumber?: number;
  gradingStatus?: 'graded' | 'needs_review' | 'pending' | string;
  answers?: Record<string, any> | any[];
  answersById?: Record<string, any>;
  questionSnapshot?: any[];
  keepAttempts?: KeepAttemptPolicy;
}

export interface UnmatchedSubmissionRecord {
  studentCode: string;
  studentName: string;
  studentClass?: string;
  submittedTime: string;
  score: number | string;
  totalScore: number;
  reason: string;
  reasonCode: 'STT_EXCEEDS_ROSTER' | 'DIFFERENT_CLASS' | 'MISSING_IN_ROSTER' | 'INVALID_CODE_FORMAT';
  rawSubmission: any;
}

export interface StorageLocationBreakdown {
  studentResultsCanonicalMap: number;      // student_results/{code} -> assignments.{id}
  studentResultsDottedField: number;       // student_results/{code} -> "assignments.{id}" (legacy dotted top-level key)
  studentResultsFlatDocs: number;          // student_results/{code}_{id}
  studentResultsSubcollectionDocs: number; // student_results/{code}/assignments/{id}
  assignmentEmbeddedArray: number;         // assignments/{id}.submissions[]
  assignmentSubcollectionDocs: number;     // assignments/{id}/submissions/{code}
  examSubcollectionDocs: number;           // exams/{id}/submissions/{code}
  storedCounters: {
    completedCount: number | null;
    submittedCount: number | null;
    submissionsCount: number | null;
    submittedIdsCount: number | null;
  };
}

export interface AssignmentResultsResponse {
  assignmentId: string;
  classCode: string;
  roster: StudentRecord[];
  matched: any[];
  unmatched: UnmatchedSubmissionRecord[];
  allSubmissions: any[];
  matchedByCode: Record<string, any>;
  allByCode: Record<string, any>;
  submittedCount: number; // "Đã làm" = matched.length (số học sinh trong danh sách lớp có bài nộp)
  unmatchedCount: number;
  totalStudents: number;
  firestoreReadsCount: number;
  storageBreakdown: StorageLocationBreakdown;
  fetchedAt: string;
}

export interface ReassignCandidateItem {
  fromStudentCode: string;
  fromStudentName: string;
  toStudentCode: string;
  toStudentName: string;
  score: number | string;
  submittedTime: string;
  matchBasis: string;
  submission: any;
}

export interface ReassignPreviewResult {
  assignmentId: string;
  classCode: string;
  canReassign: ReassignCandidateItem[];
  uncertain: UnmatchedSubmissionRecord[];
}

// Cache ngắn hạn theo phiên xem để tránh đọc lặp lại từ các màn hình con trong cùng 1 thao tác
const assignmentResultsMemoryCache = new Map<string, AssignmentResultsResponse>();

export function getCachedAssignmentResults(
  assignmentId: string,
  classCode?: string
): AssignmentResultsResponse | null {
  if (!assignmentId) return null;
  const cleanCls = (classCode || '').replace(/^Lớp\s*/i, '').replace(/\s+/g, '').trim().toUpperCase();
  const key = `${assignmentId.trim()}__${cleanCls}`;
  return assignmentResultsMemoryCache.get(key) || null;
}

export function invalidateAssignmentResultsCache(assignmentId?: string) {
  if (!assignmentId) {
    assignmentResultsMemoryCache.clear();
    return;
  }
  const prefix = `${assignmentId.trim()}__`;
  Array.from(assignmentResultsMemoryCache.keys()).forEach((k) => {
    if (k.startsWith(prefix)) {
      assignmentResultsMemoryCache.delete(k);
    }
  });
}

/**
 * Trích xuất và chuẩn hóa Mã học sinh duy nhất (viết hoa, bỏ toàn bộ khoảng trắng, thống nhất dấu gạch ngang, loại bỏ hậu tố _assignmentId).
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
    const stdMatch = cleaned.match(/([1-5][A-Z]\s*\d{2}[–—−_-]\d{2}[–—−_-]\d{1,4})/i);
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
 */
export function isMatchingStudentCode(targetStudentCode: string, data: any, docId?: string): boolean {
  const normTarget = normalizeStudentCode(
    extractCleanStudentCode({ studentCode: targetStudentCode }, targetStudentCode) || targetStudentCode
  );
  if (!normTarget) return false;

  const extracted = normalizeStudentCode(extractCleanStudentCode(data, docId));
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
    const cleanField = normalizeStudentCode(field.split('_')[0]);
    if (!cleanField) continue;
    if (cleanField === normTarget) return true;
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

  let submittedTimeStr = '';
  const rawTs = rawSub.submittedTime || rawSub.submittedAt || lastAttempt?.submittedAt || rawSub.updatedAt;
  if (rawTs && typeof rawTs === 'object' && typeof rawTs.toDate === 'function') {
    try {
      submittedTimeStr = rawTs.toDate().toISOString();
    } catch {
      submittedTimeStr = new Date().toISOString();
    }
  } else if (typeof rawTs === 'string' && rawTs.trim()) {
    submittedTimeStr = rawTs.trim();
  } else {
    submittedTimeStr = new Date().toISOString();
  }

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
    maxScore: Number.isFinite(Number(rawSub.maxScore)) ? Number(rawSub.maxScore) : 10,
    attemptNumber: Number.isFinite(Number(rawSub.attemptNumber)) ? Number(rawSub.attemptNumber) : 1,
    gradingStatus: rawSub.gradingStatus || 'graded',
    submittedAt: submittedTimeStr,
    submittedTime: submittedTimeStr,
    answers,
    answersById,
    questionSnapshot: rawSub.questionSnapshot || rawSub.assignment?.questions || rawSub.exam?.questions,
    status: 'submitted'
  };
}

/**
 * Phân loại lý do vì sao một Mã HS có bài nộp nhưng không khớp với danh sách lớp hiện tại
 */
export function classifyUnmatchedSubmissionReason(
  studentCode: string,
  targetClassCode: string,
  rosterLength: number
): { reason: string; reasonCode: UnmatchedSubmissionRecord['reasonCode'] } {
  const cleanClass = (targetClassCode || '4C').replace(/^Lớp\s*/i, '').replace(/\s+/g, '').trim().toUpperCase();
  const parsed = parseStudentCode(studentCode);
  if (!parsed) {
    return {
      reason: `Mã HS "${studentCode}" không đúng định dạng chuẩn Lớp-NămHọc-STT`,
      reasonCode: 'INVALID_CODE_FORMAT'
    };
  }
  if (parsed.className.toUpperCase() !== cleanClass) {
    return {
      reason: `Khác lớp (Mã thuộc lớp ${parsed.className}, bài tập giao cho lớp ${cleanClass})`,
      reasonCode: 'DIFFERENT_CLASS'
    };
  }
  if (rosterLength > 0 && parsed.stt > rosterLength) {
    return {
      reason: `STT trong mã (${parsed.stt}) vượt sĩ số lớp hiện tại (${rosterLength} HS) — do mã cũ trước khi nhập lại/đánh số lại danh sách lớp`,
      reasonCode: 'STT_EXCEEDS_ROSTER'
    };
  }
  return {
    reason: `Mã HS thuộc lớp ${cleanClass} (STT ${parsed.stt}) nhưng không còn trong danh sách lớp hiện tại (${rosterLength} HS)`,
    reasonCode: 'MISSING_IN_ROSTER'
  };
}

/**
 * Chia mảng thành các chunk nhỏ (tối đa 30 phần tử cho truy vấn Firestore `in`)
 */
function chunkArray<T>(items: T[], chunkSize: number = 30): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * HÀM ĐỌC CHUẨN DUY NHẤT: `getAssignmentResults(assignmentId, classCode, options)`
 * - Lấy danh sách học sinh của lớp `classCode`.
 * - Đọc `student_results` của lớp theo tiền tố Mã HS (`where(documentId(), '>=', prefix)` & `<= prefix + '\uf8ff'`)
 *   hoặc theo lô `where(documentId(), 'in', chunk)` (tối đa 30 mã/lần).
 * - Đối chiếu trực tiếp với danh sách lớp theo `normalizeStudentCode`.
 * - Trả về hai tập rõ ràng: `matched` (khớp danh sách lớp) và `unmatched` (chưa khớp kèm lý do).
 * - Tuyệt đối KHÔNG ghi hàng loạt (0 Firestore writes).
 */
export async function getAssignmentResults(
  assignmentId: string,
  classCode: string,
  options?: {
    assignment?: {
      id?: string;
      originalAssignmentId?: string;
      targetClass?: string;
      title?: string;
      submissions?: any[];
      completedCount?: number;
      submittedCount?: number;
      submissionsCount?: number;
      submittedIds?: string[];
    };
    classRoster?: StudentRecord[];
    forceRefresh?: boolean;
    includeDebugAudit?: boolean;
  }
): Promise<AssignmentResultsResponse> {
  const cleanAssignmentId = String(assignmentId || options?.assignment?.id || '').trim();
  const cleanClass = (classCode || options?.assignment?.targetClass || '4C')
    .replace(/^Lớp\s*/i, '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase() || '4C';

  const cacheKey = `${cleanAssignmentId}__${cleanClass}`;
  if (!options?.forceRefresh && !options?.includeDebugAudit && assignmentResultsMemoryCache.has(cacheKey)) {
    return assignmentResultsMemoryCache.get(cacheKey)!;
  }

  let firestoreReadsCount = 0;

  // 1. Lấy danh sách học sinh chuẩn của lớp
  let roster: StudentRecord[] = Array.isArray(options?.classRoster) && options!.classRoster!.length > 0
    ? options!.classRoster!
    : getStudentsFromLocalStorage(cleanClass);

  if ((!roster || roster.length === 0) && db) {
    try {
      const remoteRoster = await fetchClassStudentsFromFirestore(cleanClass);
      firestoreReadsCount += 1;
      if (Array.isArray(remoteRoster) && remoteRoster.length > 0) {
        roster = remoteRoster;
      }
    } catch (err) {
      console.warn(`[getAssignmentResults] Không tải được danh sách lớp ${cleanClass} từ Firestore:`, err);
    }
  }

  const rosterByCode = new Map<string, StudentRecord>();
  (roster || []).forEach((st) => {
    const code = normalizeStudentCode(st.code || (st as any).studentCode || st.username || '');
    if (code) {
      rosterByCode.set(code, st);
    }
  });

  const assignmentObj = options?.assignment || { id: cleanAssignmentId, targetClass: cleanClass };
  const candIds = getCandidateAssignmentIds({
    id: cleanAssignmentId,
    originalAssignmentId: assignmentObj.originalAssignmentId,
    targetClass: cleanClass
  });
  const candIdSet = new Set(candIds);
  const normTitle = String(assignmentObj.title || '').trim().toLowerCase();

  const storageBreakdown: StorageLocationBreakdown = {
    studentResultsCanonicalMap: 0,
    studentResultsDottedField: 0,
    studentResultsFlatDocs: 0,
    studentResultsSubcollectionDocs: 0,
    assignmentEmbeddedArray: Array.isArray(assignmentObj.submissions) ? assignmentObj.submissions.length : 0,
    assignmentSubcollectionDocs: 0,
    examSubcollectionDocs: 0,
    storedCounters: {
      completedCount: typeof assignmentObj.completedCount === 'number' ? assignmentObj.completedCount : null,
      submittedCount: typeof assignmentObj.submittedCount === 'number' ? assignmentObj.submittedCount : null,
      submissionsCount: typeof (assignmentObj as any).submissionsCount === 'number' ? (assignmentObj as any).submissionsCount : null,
      submittedIdsCount: Array.isArray(assignmentObj.submittedIds) ? assignmentObj.submittedIds.length : null
    }
  };

  const canonicalCodesSeen = new Set<string>();
  const dottedCodesSeen = new Set<string>();
  const flatCodesSeen = new Set<string>();
  const byStudentCode = new Map<string, any>();

  const upsertSubmission = (rawSub: any, fallbackCode?: string, fallbackAssignId?: string, sourceTag?: string) => {
    const normSub = normalizeAssignmentSubmissionRecord(
      rawSub,
      fallbackCode,
      fallbackAssignId || cleanAssignmentId
    );
    if (!normSub || !normSub.studentCode) return;

    const code = normalizeStudentCode(normSub.studentCode);
    if (!code) return;
    normSub.studentCode = code;
    normSub.studentId = code;
    normSub.maHs = code;
    if (sourceTag) {
      normSub._source = sourceTag;
    }

    const existing = byStudentCode.get(code);
    if (!existing) {
      byStudentCode.set(code, normSub);
      return;
    }

    // Ưu tiên bản ghi từ nguồn chuẩn student_results/{code}.assignments.{id}, sau đó đến bản ghi có đủ answers hơn
    const existingIsCanonical = existing._source === 'student_results_canonical';
    const newIsCanonical = sourceTag === 'student_results_canonical';

    const existingAnswersCount =
      existing.answers && typeof existing.answers === 'object' ? Object.keys(existing.answers).length : 0;
    const newAnswersCount =
      normSub.answers && typeof normSub.answers === 'object' ? Object.keys(normSub.answers).length : 0;

    if (newIsCanonical && !existingIsCanonical && newAnswersCount >= existingAnswersCount) {
      byStudentCode.set(code, { ...existing, ...normSub });
    } else if (newAnswersCount > existingAnswersCount) {
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
    }
  };

  const checkEntryMatchesAssignment = (key: string, entry: any): boolean => {
    if (!entry || typeof entry !== 'object') return false;
    const entryId = String(entry.assignmentId || entry.targetId || entry.examId || key || '').trim();
    const entryRoot = entryId.replace(/-class-.*$/i, '').trim();
    const keyRoot = String(key).replace(/-class-.*$/i, '').trim();
    const entryTitle = String(entry.title || '').trim().toLowerCase();
    return Boolean(
      candIdSet.has(key) ||
      candIdSet.has(entryId) ||
      (entryRoot && candIdSet.has(entryRoot)) ||
      (keyRoot && candIdSet.has(keyRoot)) ||
      (normTitle && entryTitle && entryTitle === normTitle)
    );
  };

  const processStudentResultDoc = (docId: string, data: any) => {
    if (!data || typeof data !== 'object') return;
    const docCode = extractCleanStudentCode(data, docId);

    // A. Kiểm tra map chuẩn `data.assignments.{assignmentId}`
    if (data.assignments && typeof data.assignments === 'object') {
      Object.entries(data.assignments).forEach(([key, entry]: [string, any]) => {
        if (checkEntryMatchesAssignment(key, entry)) {
          const code = extractCleanStudentCode(entry, docCode || docId);
          if (code) canonicalCodesSeen.add(code);
          upsertSubmission(
            {
              ...entry,
              studentName: entry.studentName || data.studentName || data.name || '',
              studentClass: entry.studentClass || data.studentClass || data.className || ''
            },
            docCode || docId,
            cleanAssignmentId,
            'student_results_canonical'
          );
        }
      });
    }

    // B. Kiểm tra trường phẳng có dấu chấm ở cấp cao nhất `data["assignments.{id}"]` (do setDoc cũ tạo ra)
    Object.entries(data).forEach(([topKey, topVal]: [string, any]) => {
      if (topKey.startsWith('assignments.') && topVal && typeof topVal === 'object') {
        const subKey = topKey.slice('assignments.'.length);
        if (checkEntryMatchesAssignment(subKey, topVal)) {
          const code = extractCleanStudentCode(topVal, docCode || docId);
          if (code) dottedCodesSeen.add(code);
          upsertSubmission(
            {
              ...topVal,
              studentName: topVal.studentName || data.studentName || data.name || '',
              studentClass: topVal.studentClass || data.studentClass || data.className || ''
            },
            docCode || docId,
            cleanAssignmentId,
            'student_results_dotted'
          );
        }
      }
    });

    // C. Kiểm tra bản ghi phẳng `student_results/{studentCode}_{assignmentId}`
    const flatTargetId = String(data.targetId || data.assignmentId || data.examId || '').trim();
    const flatRoot = flatTargetId.replace(/-class-.*$/i, '').trim();
    if (flatTargetId && (candIdSet.has(flatTargetId) || (flatRoot && candIdSet.has(flatRoot)))) {
      const code = extractCleanStudentCode(data, docCode || docId);
      if (code) flatCodesSeen.add(code);
      upsertSubmission({ id: docId, ...data }, docCode || docId, flatTargetId, 'student_results_flat');
    }

    // D. Dự phòng: nếu bài tập nộp qua StudentExamModule và lưu trong `data.exams.{id}`
    if (data.exams && typeof data.exams === 'object') {
      Object.entries(data.exams).forEach(([key, entry]: [string, any]) => {
        if (checkEntryMatchesAssignment(key, entry)) {
          upsertSubmission(
            {
              ...entry,
              studentName: entry.studentName || data.studentName || data.name || '',
              studentClass: entry.studentClass || data.studentClass || data.className || ''
            },
            docCode || docId,
            cleanAssignmentId,
            'student_results_exams_map'
          );
        }
      });
    }
  };

  // 2. Đọc từ `student_results` trên Firestore theo tiền tố lớp (ví dụ "3D26-27-" hoặc "4C26-27-")
  //    Chỉ 1 truy vấn theo prefix lấy trọn ~38 hồ sơ của lớp + các mã lẻ trong danh sách lớp (nếu có) theo lô <= 30
  if (db && cleanAssignmentId) {
    const classPrefix = getClassCodePrefix(cleanClass);
    const fetchedDocIds = new Set<string>();

    try {
      const prefixQuery = query(
        collection(db, STUDENT_RESULTS_COLLECTION),
        where(documentId(), '>=', classPrefix),
        where(documentId(), '<=', classPrefix + '\uf8ff')
      );
      const prefixSnap = await withFirestoreTimeout(
        getDocs(prefixQuery),
        8000,
        `getAssignmentResults.prefixQuery.${classPrefix}`
      );
      firestoreReadsCount += prefixSnap.docs.length || 1;
      prefixSnap.docs.forEach((d) => {
        fetchedDocIds.add(d.id);
        processStudentResultDoc(d.id, d.data());
      });
    } catch (err) {
      console.warn(`[getAssignmentResults] Lỗi truy vấn prefix ${classPrefix} trên student_results:`, err);
    }

    // Nếu trong danh sách lớp có Mã HS nào chưa nằm trong kết quả prefixQuery, đọc theo lô `in` (tối đa 30 mã/lô)
    const remainingRosterCodes = Array.from(rosterByCode.keys()).filter(
      (code) => !fetchedDocIds.has(code) && !code.startsWith(classPrefix)
    );
    if (remainingRosterCodes.length > 0) {
      const codeChunks = chunkArray(remainingRosterCodes, 30);
      for (const chunk of codeChunks) {
        try {
          const chunkQ = query(
            collection(db, STUDENT_RESULTS_COLLECTION),
            where(documentId(), 'in', chunk)
          );
          const chunkSnap = await withFirestoreTimeout(
            getDocs(chunkQ),
            6000,
            'getAssignmentResults.rosterChunkQuery'
          );
          firestoreReadsCount += chunkSnap.docs.length || 1;
          chunkSnap.docs.forEach((d) => {
            fetchedDocIds.add(d.id);
            processStudentResultDoc(d.id, d.data());
          });
        } catch (err) {
          console.warn('[getAssignmentResults] Lỗi truy vấn chunk roster codes:', err);
        }
      }
    }

    // Đọc bổ sung các bản ghi phẳng cũ theo targetId / assignmentId (chỉ lấy những bản ghi có targetId == assignmentId)
    const queryIds = candIds.slice(0, 10);
    if (queryIds.length > 0) {
      try {
        const qAssign = query(
          collection(db, STUDENT_RESULTS_COLLECTION),
          where('assignmentId', 'in', queryIds)
        );
        const snapAssign = await withFirestoreTimeout(
          getDocs(qAssign),
          6000,
          'getAssignmentResults.flatByAssignmentId'
        );
        firestoreReadsCount += snapAssign.docs.length;
        snapAssign.docs.forEach((d) => {
          if (!fetchedDocIds.has(d.id)) {
            fetchedDocIds.add(d.id);
            processStudentResultDoc(d.id, d.data());
          } else {
            const code = extractCleanStudentCode(d.data(), d.id);
            if (code) flatCodesSeen.add(code);
          }
        });
      } catch {}
    }

    // Nếu đang bật chế độ ?debug=1 (includeDebugAudit) hoặc chưa tìm thấy bài nộp nào trong student_results,
    // đọc đối chiếu (chỉ đọc, 0 ghi) ở các nơi lưu cũ: assignments/{id}/submissions, assignments/{id}, exams/{id}/submissions
    if (options?.includeDebugAudit || byStudentCode.size === 0) {
      try {
        const subSnap = await withFirestoreTimeout(
          getDocs(collection(db, 'assignments', cleanAssignmentId, 'submissions')),
          6000,
          'getAssignmentResults.legacyAssignSubcol'
        );
        firestoreReadsCount += subSnap.docs.length;
        storageBreakdown.assignmentSubcollectionDocs = subSnap.docs.length;
        subSnap.docs.forEach((d) => {
          upsertSubmission({ id: d.id, ...d.data() }, d.id, cleanAssignmentId, 'assignments_subcollection');
        });
      } catch {}

      if (options?.includeDebugAudit) {
        try {
          const asDocSnap = await withFirestoreTimeout(
            getDoc(doc(db, 'assignments', cleanAssignmentId)),
            5000,
            'getAssignmentResults.debugAssignDoc'
          );
          firestoreReadsCount += 1;
          if (asDocSnap.exists()) {
            const asData = asDocSnap.data() || {};
            const arr = Array.isArray(asData.submissions) ? asData.submissions : [];
            storageBreakdown.assignmentEmbeddedArray = arr.length;
            storageBreakdown.storedCounters = {
              completedCount: typeof asData.completedCount === 'number' ? asData.completedCount : null,
              submittedCount: typeof asData.submittedCount === 'number' ? asData.submittedCount : null,
              submissionsCount: typeof asData.submissionsCount === 'number' ? asData.submissionsCount : null,
              submittedIdsCount: Array.isArray(asData.submittedIds) ? asData.submittedIds.length : null
            };
            arr.forEach((s: any) => upsertSubmission(s, undefined, cleanAssignmentId, 'assignments_embedded_array'));
          }
        } catch {}

        try {
          const exSubSnap = await withFirestoreTimeout(
            getDocs(collection(db, 'exams', cleanAssignmentId, 'submissions')),
            5000,
            'getAssignmentResults.debugExamSubcol'
          );
          firestoreReadsCount += exSubSnap.docs.length;
          storageBreakdown.examSubcollectionDocs = exSubSnap.docs.length;
          exSubSnap.docs.forEach((d) => {
            upsertSubmission({ id: d.id, ...d.data() }, d.id, cleanAssignmentId, 'exams_subcollection');
          });
        } catch {}
      }
    }
  }

  // 3. Dự phòng đọc từ mảng submissions trên bộ nhớ của bài tập (0 tốn lượt đọc Firestore)
  if (Array.isArray(assignmentObj.submissions)) {
    assignmentObj.submissions.forEach((s) =>
      upsertSubmission(s, undefined, cleanAssignmentId, 'assignments_embedded_array')
    );
  }

  // 4. Dự phòng đọc từ LocalStorage trên trình duyệt hiện tại (0 tốn lượt đọc Firestore)
  if (typeof window !== 'undefined') {
    try {
      for (const cid of candIds) {
        const rawExamSubs = localStorage.getItem(`eduplay_k4_exam_subs_${cid}`);
        if (rawExamSubs) {
          const parsed = JSON.parse(rawExamSubs);
          if (Array.isArray(parsed)) {
            parsed.forEach((s) => upsertSubmission(s, undefined, cid, 'local_storage'));
          }
        }
      }
    } catch {}
  }

  storageBreakdown.studentResultsCanonicalMap = canonicalCodesSeen.size;
  storageBreakdown.studentResultsDottedField = dottedCodesSeen.size;
  storageBreakdown.studentResultsFlatDocs = flatCodesSeen.size;

  // 5. Phân tách rõ ràng thành 2 tập:
  //    - matched: Khớp Mã HS chuẩn trong danh sách lớp hiện tại
  //    - unmatched: Có bài nộp nhưng Mã HS không nằm trong danh sách lớp hiện tại (kèm lý do chi tiết)
  const matched: any[] = [];
  const unmatched: UnmatchedSubmissionRecord[] = [];
  const matchedByCode: Record<string, any> = {};
  const allByCode: Record<string, any> = {};

  byStudentCode.forEach((sub, code) => {
    const normCode = normalizeStudentCode(code);
    allByCode[normCode] = sub;

    const rosterStudent = rosterByCode.get(normCode);
    if (rosterStudent) {
      const enriched = {
        ...sub,
        studentCode: normCode,
        studentId: normCode,
        maHs: normCode,
        studentName: rosterStudent.fullName || rosterStudent.name || sub.studentName || ''
      };
      matched.push(enriched);
      matchedByCode[normCode] = enriched;
    } else {
      const { reason, reasonCode } = classifyUnmatchedSubmissionReason(
        normCode,
        cleanClass,
        rosterByCode.size
      );
      unmatched.push({
        studentCode: normCode,
        studentName: sub.studentName || sub.name || 'Chưa rõ tên',
        studentClass: sub.studentClass || cleanClass,
        submittedTime: sub.submittedTime || sub.submittedAt || '',
        score: sub.score !== undefined ? sub.score : sub.totalScore,
        totalScore: typeof sub.totalScore === 'number' ? sub.totalScore : sub.numericScore || 0,
        reason,
        reasonCode,
        rawSubmission: sub
      });
    }
  });

  // Sắp xếp unmatched theo STT tăng dần để dễ tra cứu
  unmatched.sort((a, b) => {
    const pA = parseStudentCode(a.studentCode);
    const pB = parseStudentCode(b.studentCode);
    if (pA && pB) return pA.stt - pB.stt;
    return a.studentCode.localeCompare(b.studentCode);
  });

  const result: AssignmentResultsResponse = {
    assignmentId: cleanAssignmentId,
    classCode: cleanClass,
    roster: roster || [],
    matched,
    unmatched,
    allSubmissions: Array.from(byStudentCode.values()),
    matchedByCode,
    allByCode,
    submittedCount: matched.length,
    unmatchedCount: unmatched.length,
    totalStudents: rosterByCode.size,
    firestoreReadsCount,
    storageBreakdown,
    fetchedAt: new Date().toISOString()
  };

  assignmentResultsMemoryCache.set(cacheKey, result);
  return result;
}

/**
 * CÔNG CỤ ADMIN: Xem trước (Dry-run) gán lại các bài nộp chưa khớp về đúng Mã HS chuẩn trong danh sách lớp.
 * Quy tắc an toàn:
 * - CHỈ ghép khi chắc chắn 100% (trùng SĐDCN hoặc trùng duy nhất Họ và tên chuẩn hóa với một học sinh trong lớp chưa có bài nộp).
 * - Trường hợp trùng tên nhiều người hoặc không tìm thấy học sinh tương ứng trong danh sách lớp -> đưa vào danh sách `uncertain` (bỏ qua, không tự đoán).
 * - Không thực hiện bất kỳ thao tác ghi nào ở bước Xem trước.
 */
export function previewReassignUnmatchedSubmissions(
  assignmentId: string,
  classCode: string,
  unmatchedList: UnmatchedSubmissionRecord[],
  roster: StudentRecord[],
  existingMatchedByCode: Record<string, any> = {}
): ReassignPreviewResult {
  const canReassign: ReassignCandidateItem[] = [];
  const uncertain: UnmatchedSubmissionRecord[] = [];

  const rosterByName = new Map<string, StudentRecord[]>();
  const rosterBySddcn = new Map<string, StudentRecord>();

  roster.forEach((st) => {
    const code = normalizeStudentCode(st.code || (st as any).studentCode || '');
    if (!code) return;
    const normName = normalizeStudentName(st.fullName || st.name || '');
    if (normName) {
      const list = rosterByName.get(normName) || [];
      list.push(st);
      rosterByName.set(normName, list);
    }
    const sddcn = String(st.sddcn || st.idCard || '').trim();
    if (sddcn && sddcn !== code) {
      rosterBySddcn.set(sddcn, st);
    }
  });

  const targetCodesAlreadyAssigned = new Set<string>(Object.keys(existingMatchedByCode));

  unmatchedList.forEach((item) => {
    const sub = item.rawSubmission || {};
    const subSddcn = String(sub.sddcn || '').trim();
    const normSubName = normalizeStudentName(item.studentName || sub.studentName || '');

    let targetStudent: StudentRecord | null = null;
    let matchBasis = '';

    // 1. Khớp theo SĐDCN (nếu có và duy nhất)
    if (subSddcn && rosterBySddcn.has(subSddcn)) {
      targetStudent = rosterBySddcn.get(subSddcn)!;
      matchBasis = `Trùng Số định danh cá nhân (${subSddcn})`;
    }

    // 2. Khớp theo Họ và tên chuẩn hóa duy nhất trong lớp
    if (!targetStudent && normSubName && normSubName !== 'chua ro ten' && normSubName !== 'hoc sinh') {
      const candidates = rosterByName.get(normSubName) || [];
      if (candidates.length === 1) {
        targetStudent = candidates[0];
        matchBasis = `Trùng khớp duy nhất Họ và tên trong lớp ("${targetStudent.fullName || targetStudent.name}")`;
      }
    }

    if (targetStudent) {
      const targetCode = normalizeStudentCode(targetStudent.code || (targetStudent as any).studentCode || '');
      if (targetCode && !targetCodesAlreadyAssigned.has(targetCode)) {
        targetCodesAlreadyAssigned.add(targetCode);
        canReassign.push({
          fromStudentCode: item.studentCode,
          fromStudentName: item.studentName,
          toStudentCode: targetCode,
          toStudentName: targetStudent.fullName || targetStudent.name || '',
          score: item.score,
          submittedTime: item.submittedTime,
          matchBasis,
          submission: sub
        });
        return;
      }
    }

    uncertain.push(item);
  });

  return {
    assignmentId,
    classCode,
    canReassign,
    uncertain
  };
}

/**
 * CÔNG CỤ ADMIN: Thực thi gán lại các bài nộp đã xác nhận chắc chắn bằng `writeBatch` (tối đa 500 thao tác/lô).
 * Quy tắc an toàn:
 * - Ghi vào nơi lưu chuẩn duy nhất: `student_results/{toStudentCode}` -> `assignments.{assignmentId}`.
 * - TUYỆT ĐỐI KHÔNG xóa bản ghi gốc của `fromStudentCode`.
 */
export async function executeReassignUnmatchedSubmissionsBatch(
  assignmentId: string,
  candidates: ReassignCandidateItem[]
): Promise<{ ReassignedCount: number; BatchCount: number }> {
  if (!db || !assignmentId || !Array.isArray(candidates) || candidates.length === 0) {
    return { ReassignedCount: 0, BatchCount: 0 };
  }

  const cleanAssignId = assignmentId.trim();
  const batches = chunkArray(candidates, 450); // <= 500 ops mỗi writeBatch theo giới hạn Firestore
  let reassignedCount = 0;

  for (const batchItems of batches) {
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();

    batchItems.forEach((cand) => {
      const targetCode = normalizeStudentCode(cand.toStudentCode);
      if (!targetCode) return;

      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, targetCode);
      const entryData = sanitizeForFirestore({
        ...(cand.submission || {}),
        id: `${targetCode}_${cleanAssignId}`,
        assignmentId: cleanAssignId,
        targetId: cleanAssignId,
        studentCode: targetCode,
        studentId: targetCode,
        maHs: targetCode,
        studentName: cand.toStudentName || cand.fromStudentName,
        reassignedFromCode: cand.fromStudentCode,
        reassignedAt: nowIso,
        status: 'submitted',
        recordType: 'assignment',
        updatedAt: nowIso
      });

      batch.set(
        docRef,
        {
          studentCode: targetCode,
          studentId: targetCode,
          maHs: targetCode,
          studentName: cand.toStudentName || undefined,
          assignments: {
            [cleanAssignId]: entryData
          },
          updatedAt: nowIso,
          updatedAtServer: serverTimestamp()
        },
        { merge: true }
      );
      reassignedCount++;
    });

    await withFirestoreTimeout(batch.commit(), 10000, 'executeReassignUnmatchedSubmissionsBatch.commit');
  }

  invalidateAssignmentResultsCache(cleanAssignId);
  return { ReassignedCount: reassignedCount, BatchCount: batches.length };
}

/**
 * Dịch vụ quản lý kết quả học tập tập trung theo studentCode
 */
export const studentResultService = {
  /**
   * QUY ƯỚC LƯU DUY NHẤT:
   * Lưu kết quả làm bài tập của học sinh vào đúng một nơi chuẩn:
   * `student_results/{Mã HS chuẩn}` dưới trường `assignments.{assignmentId}`
   * với `score`, `maxScore`, `answers`, `submittedAt` (giờ máy chủ `serverTimestamp()`), `attemptNumber`, `gradingStatus`.
   * Ngừng ghi bản sao sang `student_results/{code}_{id}` hoặc `student_results/{code}/assignments/{id}`.
   */
  async saveAssignmentResult(
    rawStudentCode: string,
    payload: AssignmentSubmissionPayload
  ): Promise<boolean> {
    try {
      const studentCode = normalizeStudentCode(
        extractCleanStudentCode({ studentCode: rawStudentCode }, rawStudentCode) || rawStudentCode
      );
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');
      if (!payload?.assignmentId) throw new Error('Mã bài tập không hợp lệ');

      const assignmentId = String(payload.assignmentId).trim();
      const targetId = String(payload.targetId || assignmentId).trim();
      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode);
      const policy: KeepAttemptPolicy = payload.keepAttempts || 'last';

      const parsedScore =
        typeof payload.score === 'number'
          ? payload.score
          : parseFloat(String(payload.score).replace(/\s*\/.*$/, '').trim());
      const safeScore = Number.isFinite(parsedScore) ? parsedScore : 0;
      const safeTotalScore = Number.isFinite(Number(payload.totalScore)) ? Number(payload.totalScore) : safeScore;
      const safeMaxScore = Number.isFinite(Number(payload.maxScore)) ? Number(payload.maxScore) : 10;
      const nowIso = new Date().toISOString();
      const safeSubmittedAt = payload.submittedAt || nowIso;
      const safeSubmittedTime = payload.submittedTime || safeSubmittedAt;
      const safeAnswers = sanitizeForFirestore(payload.answers || {});
      const safeAnswersById = sanitizeForFirestore(payload.answersById || {});
      const safeAttemptNumber = Number.isFinite(Number(payload.attemptNumber)) ? Number(payload.attemptNumber) : 1;
      const safeGradingStatus = payload.gradingStatus || 'graded';

      const assignmentData: any = sanitizeForFirestore({
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
        attemptNumber: safeAttemptNumber,
        gradingStatus: safeGradingStatus,
        answers: safeAnswers,
        answersById: safeAnswersById,
        questionSnapshot: payload.questionSnapshot ? sanitizeForFirestore(payload.questionSnapshot) : undefined,
        status: 'submitted',
        recordType: 'assignment',
        updatedAt: nowIso
      });

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

      // Ghi DUY NHẤT vào student_results/{studentCode} dưới cấu trúc map chuẩn `assignments: { [assignmentId]: ... }`
      await withFirestoreTimeout(
        setDoc(
          docRef,
          {
            studentCode,
            studentId: studentCode,
            maHs: studentCode,
            ...(payload.studentName ? { studentName: payload.studentName } : {}),
            ...(payload.studentClass ? { studentClass: payload.studentClass } : {}),
            assignments: {
              [assignmentId]: {
                ...assignmentData,
                submittedAtServer: serverTimestamp(),
                updatedAtServer: serverTimestamp()
              }
            },
            updatedAt: nowIso,
            updatedAtServer: serverTimestamp()
          },
          { merge: true }
        ),
        10000,
        'saveAssignmentResult.setDoc'
      );

      invalidateAssignmentResultsCache(assignmentId);
      return true;
    } catch (error) {
      console.error('Lỗi khi lưu kết quả bài tập:', error);
      throw error;
    }
  },

  /**
   * Giữ hàm tương thích cho các lời gọi cũ nhưng chuyển hướng ghi DUY NHẤT vào `saveAssignmentResult`
   * (`student_results/{Mã HS chuẩn}` -> `assignments.{assignmentId}`), KHÔNG tạo thêm tài liệu phụ.
   */
  async saveFullAssignmentSubmission(
    rawStudentCode: string,
    assignmentId: string,
    submissionData: any
  ): Promise<boolean> {
    return this.saveAssignmentResult(rawStudentCode, {
      assignmentId: String(assignmentId).trim(),
      targetId: String(submissionData?.targetId || assignmentId).trim(),
      originalAssignmentId: submissionData?.originalAssignmentId || null,
      title: submissionData?.title || '',
      subject: submissionData?.subject || '',
      studentName: submissionData?.studentName || '',
      studentClass: submissionData?.studentClass || '',
      score: submissionData?.score !== undefined ? submissionData.score : (submissionData?.totalScore ?? 0),
      totalScore: Number.isFinite(Number(submissionData?.totalScore)) ? Number(submissionData.totalScore) : 0,
      maxScore: Number.isFinite(Number(submissionData?.maxScore)) ? Number(submissionData.maxScore) : 10,
      correctCount: submissionData?.correctCount,
      totalQuestions: submissionData?.totalQuestions,
      submittedAt: submissionData?.submittedAt || submissionData?.submittedTime || new Date().toISOString(),
      submittedTime: submissionData?.submittedTime || submissionData?.submittedAt || new Date().toISOString(),
      attemptNumber: submissionData?.attemptNumber || 1,
      gradingStatus: submissionData?.gradingStatus || 'graded',
      answers: submissionData?.answers || {},
      answersById: submissionData?.answersById || {},
      questionSnapshot: submissionData?.questionSnapshot
    });
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
      const studentCode = normalizeStudentCode(
        extractCleanStudentCode({ studentCode: rawStudentCode }, rawStudentCode) || rawStudentCode
      );
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode);
      const safeScore = Number.isFinite(Number(resultData?.score)) ? Number(resultData.score) : 0;
      const safeMaxScore = Number.isFinite(Number(resultData?.maxScore)) ? Number(resultData.maxScore) : 10;
      const nowIso = new Date().toISOString();

      await withFirestoreTimeout(
        setDoc(
          docRef,
          {
            studentCode,
            exams: {
              [examId]: sanitizeForFirestore({
                ...resultData,
                examId,
                targetId: examId,
                studentCode,
                score: safeScore,
                maxScore: safeMaxScore,
                submittedAt: resultData?.submittedAt || nowIso,
                type: resultData?.type || 'exam',
                updatedAt: nowIso
              })
            },
            updatedAt: nowIso
          },
          { merge: true }
        ),
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
      const studentCode = normalizeStudentCode(
        extractCleanStudentCode({ studentCode: rawStudentCode }, rawStudentCode) || rawStudentCode
      );
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode);
      const nowIso = new Date().toISOString();

      await withFirestoreTimeout(
        setDoc(
          docRef,
          {
            studentCode,
            games: {
              [gameId]: sanitizeForFirestore({
                ...resultData,
                studentCode,
                updatedAt: nowIso
              })
            },
            updatedAt: nowIso
          },
          { merge: true }
        ),
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
      const studentCode = normalizeStudentCode(
        extractCleanStudentCode({ studentCode: rawStudentCode }, rawStudentCode) || rawStudentCode
      );
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
      const studentCode = normalizeStudentCode(
        extractCleanStudentCode({ studentCode: rawStudentCode }, rawStudentCode) || rawStudentCode
      );
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode, 'exams', examId);
      const sanitizedPayload = sanitizeForFirestore({
        ...submissionData,
        studentCode,
        studentId: studentCode,
        maHs: studentCode,
        examId,
        targetId: examId,
        updatedAt: new Date().toISOString()
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
   * Đọc bài nộp của 1 bài tập theo hàm chuẩn `getAssignmentResults`
   */
  getAssignmentResults,
  previewReassignUnmatchedSubmissions,
  executeReassignUnmatchedSubmissionsBatch,

  /**
   * Xóa triệt để bản ghi kết quả bài tập của 1 học sinh theo `studentCode`
   */
  async deleteAssignmentSubmissionByStudentCode(
    rawStudentCode: string,
    assignment: { id: string; originalAssignmentId?: string; targetClass?: string; title?: string }
  ): Promise<number> {
    const studentCode = normalizeStudentCode(
      extractCleanStudentCode({ studentCode: rawStudentCode }, rawStudentCode) || rawStudentCode
    );
    if (!studentCode || !assignment?.id || !db) return 0;

    const candIds = getCandidateAssignmentIds(assignment);
    let deletedCount = 0;

    // 1. Xóa trực tiếp trên hồ sơ chuẩn `student_results/{studentCode}` (cả map `assignments.{id}` và trường có dấu chấm)
    try {
      const studentDocRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode);
      const snap = await getDoc(studentDocRef);
      if (snap.exists()) {
        const data = snap.data() || {};
        const updates: Record<string, any> = {};
        let hasChanges = false;

        if (data.assignments && typeof data.assignments === 'object') {
          const nextAssignments = { ...data.assignments };
          candIds.forEach((cid) => {
            if (cid in nextAssignments) {
              delete nextAssignments[cid];
              hasChanges = true;
            }
          });
          if (hasChanges) {
            updates.assignments = nextAssignments;
          }
        }

        candIds.forEach((cid) => {
          const dottedKey = `assignments.${cid}`;
          if (dottedKey in data) {
            updates[dottedKey] = deleteField();
            hasChanges = true;
          }
        });

        if (hasChanges) {
          updates.updatedAt = new Date().toISOString();
          await updateDoc(studentDocRef, updates);
          deletedCount++;
        }
      }
    } catch (err) {
      console.warn(`[deleteAssignmentSubmissionByStudentCode] Lỗi cập nhật student_results/${studentCode}:`, err);
    }

    // 2. Xóa các bản ghi phẳng/subcollection cũ nếu có tồn tại từ dữ liệu cũ
    const cleanupTasks: Promise<void>[] = [];
    for (const cid of candIds) {
      cleanupTasks.push(
        deleteDoc(doc(db, STUDENT_RESULTS_COLLECTION, `${studentCode}_${cid}`))
          .then(() => {
            deletedCount++;
          })
          .catch(() => {})
      );
      cleanupTasks.push(
        deleteDoc(doc(db, STUDENT_RESULTS_COLLECTION, studentCode, 'assignments', cid)).catch(() => {})
      );
      cleanupTasks.push(
        deleteDoc(doc(db, 'assignments', cid, 'submissions', studentCode)).catch(() => {})
      );
    }
    await Promise.allSettled(cleanupTasks);

    invalidateAssignmentResultsCache(assignment.id);
    return deletedCount;
  },

  /**
   * Tương thích ngược với các nơi gọi `fetchAssignmentSubmissionsByStudentCode`:
   * Ủy quyền trực tiếp sang `getAssignmentResults` để mọi màn hình dùng chung 1 nguồn đọc chuẩn.
   */
  async fetchAssignmentSubmissionsByStudentCode(assignment: {
    id: string;
    originalAssignmentId?: string;
    targetClass?: string;
    title?: string;
    submissions?: any[];
  }): Promise<any[]> {
    if (!assignment?.id) return [];
    const res = await getAssignmentResults(assignment.id, assignment.targetClass || '4C', {
      assignment,
      forceRefresh: true
    });
    return res.allSubmissions;
  }
};
