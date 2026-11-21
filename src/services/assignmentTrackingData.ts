import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { HomeworkAssignment, StudentRecord } from '../types';
import { getStudentsFromLocalStorage, generateDefaultClassRoster, fetchClassStudentsFromFirestore } from './studentStorageService';
import { formatSubmissionDateTime, getCurrentSubmissionTimestamp } from '../utils/scoreUtils';
import { studentResultService, extractCleanStudentCode } from './studentResultService';

export const STANDARD_STUDENT_CODE_REGEX = /^[1-5][A-Z]\d{2}-\d{2}-[1-9]\d{0,2}$/;

export interface TrackingStudentRow {
  code: string;
  name: string;
  stt?: number;
  answers: ('pass' | 'fail' | 'none')[];
  gradeStatuses?: ('ok' | 'error' | 'uncertain')[];
  gradeNotes?: string[];
  totalScore: number | string;
  numericScore: number;
  aiStatus: 'pass' | 'fail' | 'none';
  submittedTime: string;
  durationSeconds?: number;
  displayTime?: string;
  status: 'submitted' | 'waiting';
  rawSubmission?: any;
  hasOrangeAlert?: boolean;
  hasRedAlert?: boolean;
  errorQuestionsCount?: number;
  errorDetails?: any[];
  hasInvalidCodeFormat?: boolean;
  hasDuplicateCode?: boolean;
}

export interface AssignmentTrackingResult {
  assignmentId: string;
  targetClass: string;
  totalStudents: number;
  submittedCount: number;
  unmatchedSubmissionsCount?: number;
  trackingList: TrackingStudentRow[];
  timestamp: number;
}

// In-Memory Cache (10 minutes)
const memoryCache = new Map<string, AssignmentTrackingResult>();
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export function getMemoryTrackingData(assignmentId: string): AssignmentTrackingResult | null {
  if (!assignmentId) return null;
  const cached = memoryCache.get(assignmentId);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    return cached;
  }
  if (cached) {
    memoryCache.delete(assignmentId);
  }
  return null;
}

export function setMemoryTrackingData(assignmentId: string, result: AssignmentTrackingResult): void {
  if (!assignmentId || !result) return;
  memoryCache.set(assignmentId, { ...result, timestamp: Date.now() });
}

export function clearMemoryTrackingData(assignmentId?: string): void {
  if (assignmentId) {
    memoryCache.delete(assignmentId);
  } else {
    memoryCache.clear();
  }
}

// IndexedDB Cache Implementation
const DB_NAME = 'eduplay_k4_assignment_tracking_cache_db';
const DB_VERSION = 1;
const STORE_NAME = 'tracking_cache';

function openIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event: any) => {
        const dbInstance = event.target.result;
        if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
          dbInstance.createObjectStore(STORE_NAME, { keyPath: 'assignmentId' });
        }
      };
      request.onsuccess = (event: any) => resolve(event.target.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getIndexedDBTrackingData(assignmentId: string): Promise<AssignmentTrackingResult | null> {
  if (!assignmentId) return null;
  try {
    const idb = await openIndexedDB();
    if (!idb) return null;

    return new Promise((resolve) => {
      try {
        const tx = idb.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(assignmentId);

        req.onsuccess = () => {
          const val = req.result as AssignmentTrackingResult | undefined;
          if (val && typeof val.timestamp === 'number' && Date.now() - val.timestamp < CACHE_DURATION_MS) {
            resolve(val);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function setIndexedDBTrackingData(assignmentId: string, data: AssignmentTrackingResult): Promise<void> {
  if (!assignmentId || !data) return;
  try {
    const idb = await openIndexedDB();
    if (!idb) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = idb.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({ ...data, assignmentId, timestamp: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // Graceful fallback
  }
}

export async function clearIndexedDBTrackingData(assignmentId?: string): Promise<void> {
  try {
    const idb = await openIndexedDB();
    if (!idb) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = idb.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        if (assignmentId) {
          store.delete(assignmentId);
        } else {
          store.clear();
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // Graceful fallback
  }
}

/**
 * Helper to parse submission duration into seconds for ranking
 */
export function parseDurationToSeconds(submission: any): number {
  if (!submission) return 0;

  if (typeof submission.durationSeconds === 'number' && submission.durationSeconds > 0) {
    return submission.durationSeconds;
  }
  if (typeof submission.timeTakenSeconds === 'number' && submission.timeTakenSeconds > 0) {
    return submission.timeTakenSeconds;
  }
  if (typeof submission.duration === 'number' && submission.duration > 0) {
    return submission.duration;
  }

  const str = String(submission.duration || submission.timeTaken || submission.submittedTime || '');
  const minMatch = str.match(/(\d+)\s*(?:phút|p|m)/i);
  const secMatch = str.match(/(\d+)\s*(?:giây|s)/i);
  if (minMatch || secMatch) {
    const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
    const secs = secMatch ? parseInt(secMatch[1], 10) : 0;
    return mins * 60 + secs;
  }

  return 0;
}

/**
 * Format seconds into user-friendly display string
 */
export function formatDurationDisplay(seconds: number, fallbackTimeStr = ''): string {
  if (seconds > 0) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0 && s > 0) return `${m}p ${s}s`;
    if (m > 0) return `${m} phút`;
    return `${s} giây`;
  }
  return fallbackTimeStr || '--';
}

/**
 * Standardize student code for matching (strictly uppercase, no spaces)
 */
export function normalizeStudentCodeStrict(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

/**
 * Parse submission timestamp
 */
export function parseSubmissionTimestamp(timeStr?: string): number {
  if (!timeStr || typeof timeStr !== 'string') return Number.MAX_SAFE_INTEGER;
  const trimmed = timeStr.trim();
  if (!trimmed) return Number.MAX_SAFE_INTEGER;

  // 1. Vietnamese format: HH:mm[:ss] [,] DD/MM/YYYY
  const vnMatch = trimmed.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*,?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (vnMatch) {
    const hours = parseInt(vnMatch[1], 10);
    const mins = parseInt(vnMatch[2], 10);
    const secs = vnMatch[3] ? parseInt(vnMatch[3], 10) : 0;
    const day = parseInt(vnMatch[4], 10);
    const month = parseInt(vnMatch[5], 10) - 1;
    const year = parseInt(vnMatch[6], 10);
    const d = new Date(year, month, day, hours, mins, secs);
    const timeVal = d.getTime();
    if (!isNaN(timeVal)) return timeVal;
  }

  // 2. Format: DD/MM/YYYY [,] HH:mm[:ss]
  const vnMatch2 = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*,?\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (vnMatch2) {
    const day = parseInt(vnMatch2[1], 10);
    const month = parseInt(vnMatch2[2], 10) - 1;
    const year = parseInt(vnMatch2[3], 10);
    const hours = parseInt(vnMatch2[4], 10);
    const mins = parseInt(vnMatch2[5], 10);
    const secs = vnMatch2[6] ? parseInt(vnMatch2[6], 10) : 0;
    const d = new Date(year, month, day, hours, mins, secs);
    const timeVal = d.getTime();
    if (!isNaN(timeVal)) return timeVal;
  }

  // 3. ISO or standard format
  const isoTime = new Date(trimmed).getTime();
  if (!isNaN(isoTime)) {
    return isoTime;
  }

  return Number.MAX_SAFE_INTEGER;
}

/**
 * Safely extract numeric score from submission record
 */
export function extractSubmissionNumericScore(submission: any, questionCount = 5): number {
  if (!submission) return 0;

  if (typeof submission.numericScore === 'number' && !isNaN(submission.numericScore)) {
    return submission.numericScore;
  }
  if (typeof submission.totalScore === 'number' && !isNaN(submission.totalScore)) {
    return submission.totalScore;
  }
  if (typeof submission.scoreNumber === 'number' && !isNaN(submission.scoreNumber)) {
    return submission.scoreNumber;
  }
  if (typeof submission.score === 'number' && !isNaN(submission.score)) {
    if (submission.score === 0 && typeof submission.totalScore === 'number' && submission.totalScore > 0) {
      return submission.totalScore;
    }
    return submission.score;
  }
  if (typeof submission.totalScore === 'string') {
    const num = parseFloat(submission.totalScore.replace(/\s*\/.*$/, '').trim());
    if (!isNaN(num)) return num;
  }
  if (typeof submission.score === 'string') {
    const num = parseFloat(submission.score.replace(/\s*\/.*$/, '').trim());
    if (!isNaN(num)) return num;
  }
  if (typeof submission.lastAttempt?.score === 'number' && !isNaN(submission.lastAttempt.score)) {
    return submission.lastAttempt.score;
  }
  const rawAnswers = submission.answers || submission.lastAttempt?.answers || submission.studentAnswers || submission.answersById;
  if (rawAnswers && questionCount > 0) {
    let passCount = 0;
    if (Array.isArray(rawAnswers)) {
      passCount = rawAnswers.filter(a => a === 'pass' || a === true || a === 'correct').length;
    }
    if (passCount > 0) {
      return Math.round((passCount / questionCount) * 10);
    }
  }
  return 0;
}

/**
 * Compare two submissions of the same student:
 * - Ưu tiên bản có câu trả lời chi tiết (answers) và điểm cao nhất
 */
export function isBetterSubmission(subNew: any, subCurrent: any, questionCount = 5): boolean {
  if (!subCurrent) return true;
  if (!subNew) return false;

  const ansNew = subNew.answers || subNew.lastAttempt?.answers || {};
  const ansCur = subCurrent.answers || subCurrent.lastAttempt?.answers || {};
  const countNew = typeof ansNew === 'object' && ansNew !== null ? Object.keys(ansNew).length : 0;
  const countCur = typeof ansCur === 'object' && ansCur !== null ? Object.keys(ansCur).length : 0;

  if (countNew > 0 && countCur === 0) return true;
  if (countCur > 0 && countNew === 0) return false;

  const scoreNew = extractSubmissionNumericScore(subNew, questionCount);
  const scoreCurrent = extractSubmissionNumericScore(subCurrent, questionCount);

  if (scoreNew > scoreCurrent) return true;
  if (scoreNew < scoreCurrent) return false;

  const timeNew = parseSubmissionTimestamp(subNew.submittedAt || subNew.submittedTime);
  const timeCurrent = parseSubmissionTimestamp(subCurrent.submittedAt || subCurrent.submittedTime);

  return timeNew < timeCurrent;
}

export interface ComputeTrackingOptions {
  assignment: HomeworkAssignment;
  submissionsList?: any[];
  classRoster?: StudentRecord[];
}

/**
 * Core shared function to compute tracking rows for any assignment and class roster.
 * Strictly adheres to:
 * - Matches submissions to students EXCLUSIVELY via studentCode (normalized uppercase, trimmed, no spaces)
 * - TUYỆT ĐỐI KHÔNG đối chiếu hay lọc bỏ theo tên học sinh
 * - Nếu danh sách lớp trống (0 học sinh) hoặc chưa đồng bộ, VẪN HIỂN THỊ ĐẦY ĐỦ tất cả các mã học sinh đã nộp bài
 */
export function computeAssignmentTrackingData({
  assignment,
  submissionsList = [],
  classRoster
}: ComputeTrackingOptions): AssignmentTrackingResult {
  if (!assignment) {
    return {
      assignmentId: '',
      targetClass: '',
      totalStudents: 0,
      submittedCount: 0,
      unmatchedSubmissionsCount: 0,
      trackingList: [],
      timestamp: Date.now()
    };
  }

  const targetClassName = assignment.targetClass || 'Lớp 4C';

  // 1. Get class roster
  let roster: StudentRecord[] = classRoster || [];
  if (!roster || roster.length === 0) {
    roster = getStudentsFromLocalStorage(targetClassName) || generateDefaultClassRoster(targetClassName, 0);
  }

  // 2. Count occurrences of codes in roster to detect duplicates & map roster by studentCode
  const codeOccurrences = new Map<string, number>();
  const rosterByCode = new Map<string, StudentRecord>();
  roster.forEach(st => {
    const codeKey = normalizeStudentCodeStrict(st.code || st.id);
    if (codeKey) {
      codeOccurrences.set(codeKey, (codeOccurrences.get(codeKey) || 0) + 1);
      if (!rosterByCode.has(codeKey)) {
        rosterByCode.set(codeKey, st);
      }
    }
  });

  // 3. Collect all submissions for this assignment
  const allSubs: any[] = [
    ...(Array.isArray(assignment.submissions) ? assignment.submissions : []),
    ...(Array.isArray(submissionsList) ? submissionsList : [])
  ];

  const questions = assignment.questions || [];
  const questionCount = questions.length > 0 ? questions.length : 5;

  // Map submissions strictly by normalized studentCode (NEVER by studentName)
  const codeSubMap = new Map<string, any>();

  allSubs.forEach(sub => {
    if (!sub) return;
    const normCode = normalizeStudentCodeStrict(extractCleanStudentCode(sub));
    if (!normCode) return;

    const current = codeSubMap.get(normCode);
    if (!current || isBetterSubmission(sub, current, questionCount)) {
      codeSubMap.set(normCode, {
        ...current,
        ...sub,
        studentCode: normCode,
        answers:
          sub.answers && Object.keys(sub.answers).length > 0
            ? sub.answers
            : sub.lastAttempt?.answers || current?.answers || {}
      });
    }
  });

  const LOW_SCORE_THRESHOLD = 5;
  let submittedCount = 0;
  const processedCodes = new Set<string>();

  const buildSubmittedRow = (
    stCode: string,
    stName: string,
    stt: number,
    submission: any,
    hasInvalidCodeFormat: boolean,
    hasDuplicateCode: boolean
  ): TrackingStudentRow => {
    const rawAnswers =
      submission.answers ||
      submission.lastAttempt?.answers ||
      submission.studentAnswers ||
      submission.answersById;

    const evaluatedAnswers: ('pass' | 'fail' | 'none')[] = Array.from({ length: questionCount }).map((_, qi) => {
      const q = questions[qi];
      let rawChoice: any = undefined;
      if (Array.isArray(rawAnswers)) {
        rawChoice = rawAnswers[qi];
      } else if (rawAnswers && typeof rawAnswers === 'object') {
        rawChoice =
          rawAnswers[qi] !== undefined
            ? rawAnswers[qi]
            : rawAnswers[String(qi)] !== undefined
            ? rawAnswers[String(qi)]
            : q?.id
            ? rawAnswers[q.id]
            : undefined;
      }
      if (rawChoice === undefined && submission.answersById && q?.id) {
        rawChoice = submission.answersById[q.id];
      }

      if (rawChoice === 'pass' || rawChoice === true || rawChoice === 'correct') return 'pass';
      if (rawChoice === 'fail' || rawChoice === false || rawChoice === 'incorrect') return 'fail';

      const preEvaluated = submission.questionResults || submission.results || submission.gradedAnswers;
      if (Array.isArray(preEvaluated) && preEvaluated[qi] !== undefined) {
        const p = preEvaluated[qi];
        if (typeof p === 'boolean') return p ? 'pass' : 'fail';
        if (p === 'pass' || p === 'fail') return p;
        if (p && typeof p === 'object' && p.isCorrect !== undefined) return p.isCorrect ? 'pass' : 'fail';
      }

      if (q && rawChoice !== undefined && rawChoice !== null && rawChoice !== '') {
        // Basic comparison against correctOptionIndex / correctAnswer if present
        if (typeof q.correctOptionIndex === 'number' && Number(rawChoice) === q.correctOptionIndex) {
          return 'pass';
        }
        if (q.correctAnswer !== undefined && String(rawChoice).trim() === String(q.correctAnswer).trim()) {
          return 'pass';
        }
      }

      return rawChoice !== undefined && rawChoice !== null && rawChoice !== '' ? 'pass' : 'fail';
    });

    const correctCount = evaluatedAnswers.filter(a => a === 'pass').length;
    const computedScore = questionCount > 0 ? Math.round((correctCount / questionCount) * 10) : 0;

    const rawScore =
      submission.score !== undefined
        ? submission.score
        : submission.totalScore !== undefined
        ? submission.totalScore
        : submission.lastAttempt?.score !== undefined
        ? submission.lastAttempt.score
        : '-';
    let finalScore: number | string = computedScore;
    if (rawScore !== undefined && rawScore !== null && rawScore !== '-' && rawScore !== '') {
      const num = typeof rawScore === 'number' ? rawScore : parseFloat(String(rawScore).replace(/\s*\/.*$/, '').trim());
      if (!isNaN(num)) finalScore = num;
    }

    const numericScoreVal = typeof finalScore === 'number' ? finalScore : (parseFloat(String(finalScore)) || 0);
    const isPassed = numericScoreVal >= LOW_SCORE_THRESHOLD;

    const durationSecs = parseDurationToSeconds(submission);
    const displayDuration = formatDurationDisplay(durationSecs, submission.duration || submission.timeTaken);

    return {
      code: stCode,
      name: stName,
      stt,
      answers: evaluatedAnswers,
      totalScore: finalScore,
      numericScore: numericScoreVal,
      aiStatus: isPassed ? ('pass' as const) : ('fail' as const),
      submittedTime: formatSubmissionDateTime(
        submission.submittedAt ||
          submission.submittedTime ||
          submission.lastAttempt?.submittedAt ||
          getCurrentSubmissionTimestamp()
      ),
      durationSeconds: durationSecs,
      displayTime: displayDuration,
      status: 'submitted' as const,
      rawSubmission: submission,
      hasOrangeAlert: false,
      hasRedAlert: numericScoreVal < LOW_SCORE_THRESHOLD,
      hasInvalidCodeFormat,
      hasDuplicateCode
    };
  };

  // 4. Map roster to tracking rows (matching strictly by studentCode)
  const trackingList: TrackingStudentRow[] = roster.map((st, idx) => {
    const stt = st.stt || idx + 1;
    const stCode = normalizeStudentCodeStrict(st.code || st.id) || `4C26-27-${stt}`;
    const stName = st.name || st.fullName || `Học sinh (${stCode})`;
    processedCodes.add(stCode);

    const hasInvalidCodeFormat = !STANDARD_STUDENT_CODE_REGEX.test(stCode);
    const hasDuplicateCode = (codeOccurrences.get(stCode) || 0) > 1;

    const submission = codeSubMap.get(stCode) || null;
    if (submission) {
      submittedCount++;
      return buildSubmittedRow(stCode, stName, stt, submission, hasInvalidCodeFormat, hasDuplicateCode);
    }

    return {
      code: stCode,
      name: stName,
      stt,
      answers: Array.from({ length: questionCount }).map(() => 'none' as const),
      totalScore: '-',
      numericScore: -1,
      aiStatus: 'none' as const,
      submittedTime: 'Chờ HS',
      status: 'waiting' as const,
      hasInvalidCodeFormat,
      hasDuplicateCode
    };
  });

  // 5. Append any submitted studentCode that was NOT in the local class roster
  // (e.g., when class roster has 0 students or hasn't synced yet, or studentCode is new)
  let unmatchedSubmissionsCount = 0;
  codeSubMap.forEach((submission, normCode) => {
    if (processedCodes.has(normCode)) return;
    processedCodes.add(normCode);
    unmatchedSubmissionsCount++;
    submittedCount++;

    const stt = trackingList.length + 1;
    const rosterMatch = rosterByCode.get(normCode);
    const displayName =
      rosterMatch?.name ||
      rosterMatch?.fullName ||
      submission.studentName ||
      submission.name ||
      submission.fullName ||
      `Học sinh (${normCode})`;
    const hasInvalidCodeFormat = !STANDARD_STUDENT_CODE_REGEX.test(normCode);

    trackingList.push(
      buildSubmittedRow(normCode, displayName, stt, submission, hasInvalidCodeFormat, false)
    );
  });

  return {
    assignmentId: assignment.id,
    targetClass: targetClassName,
    totalStudents: trackingList.length,
    submittedCount,
    unmatchedSubmissionsCount,
    trackingList,
    timestamp: Date.now()
  };
}

/**
 * Fetch tracking data for an assignment (used by Bảng Vàng & Theo dõi nộp bài)
 */
export async function getOrFetchAssignmentTrackingData(
  assignment: HomeworkAssignment,
  forceRefresh = false
): Promise<AssignmentTrackingResult> {
  if (!assignment?.id) {
    throw new Error('Thiếu thông tin bài tập');
  }

  if (!forceRefresh) {
    const memoryData = getMemoryTrackingData(assignment.id);
    if (memoryData && memoryData.trackingList.length > 0) {
      return memoryData;
    }

    const idbData = await getIndexedDBTrackingData(assignment.id);
    if (idbData && idbData.trackingList.length > 0) {
      setMemoryTrackingData(assignment.id, idbData);
      return idbData;
    }
  }

  let freshAssignment = assignment;
  let fetchedSubmissions: any[] = [];
  let classRoster: StudentRecord[] = getStudentsFromLocalStorage(assignment.targetClass || 'Lớp 4C') || [];

  if (db && assignment.id) {
    try {
      const assignRef = doc(db, 'assignments', assignment.id);
      const assignSnap = await getDoc(assignRef);
      if (assignSnap.exists()) {
        freshAssignment = { id: assignSnap.id, ...assignSnap.data() } as HomeworkAssignment;
      }
    } catch (err) {
      console.warn('[TrackingData] Lỗi đọc assignment doc:', err);
    }

    try {
      fetchedSubmissions = await studentResultService.fetchAssignmentSubmissionsByStudentCode(freshAssignment);
    } catch (err) {
      console.warn('[TrackingData] Lỗi đọc bài nộp từ Firestore:', err);
    }

    if (!classRoster || classRoster.length === 0) {
      try {
        const fsRoster = await fetchClassStudentsFromFirestore(freshAssignment.targetClass || 'Lớp 4C');
        if (fsRoster && fsRoster.length > 0) {
          classRoster = fsRoster;
        }
      } catch {}
    }
  }

  const computed = computeAssignmentTrackingData({
    assignment: freshAssignment,
    submissionsList: fetchedSubmissions,
    classRoster
  });

  setMemoryTrackingData(assignment.id, computed);
  await setIndexedDBTrackingData(assignment.id, computed);

  return computed;
}

