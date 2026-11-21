import { QuestionItem } from '../types';
import { extractTrueOrderingFromQuestion } from '../lib/constants';
import { extractGradeDigit } from './classStorageService';

export const extractCanonicalOrdering = extractTrueOrderingFromQuestion;
export { extractTrueOrderingFromQuestion, extractGradeDigit };

/**
 * Chuẩn hóa hàm lọc Khối: Khối 4 nhận diện toàn bộ câu hỏi có trường grade là "Khối 4" hoặc "4"
 */
export function isQuestionMatchingGrade(questionGrade?: string, filterGrade?: string): boolean {
  if (!filterGrade || filterGrade === 'Tất cả các khối' || filterGrade === 'all') return true;
  if (!questionGrade) return false;
  if (questionGrade.trim().toLowerCase() === filterGrade.trim().toLowerCase()) return true;

  const fDigit = extractGradeDigit(filterGrade);
  const qDigit = extractGradeDigit(questionGrade);
  if (fDigit && qDigit) {
    return fDigit === qDigit;
  }
  return questionGrade.toLowerCase().includes(filterGrade.toLowerCase()) || filterGrade.toLowerCase().includes(questionGrade.toLowerCase());
}

import { db, auth } from './firebase';
import {
  collection,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  getDocs,
  getDocFromServer
} from 'firebase/firestore';
import { trackedSetDoc, trackedDeleteDoc, trackedWriteBatch } from './firestoreWriteTracker';
import { sanitizeForFirestore } from '../utils/firestoreSanitizer';
import { waitForWriteConfirmation, updateCollectionCacheStatus } from './firestoreWriteVerificationService';
import {
  getScopedDocs,
  subscribeScopedCollection,
  getFirestoreAccessScope,
  resolveTeacherIdentityForWrite,
  ScopeOverride
} from './firestoreScopeService';

export const QUESTIONS_CACHE_KEY = 'eduplay_k4_questions_database_cache';
export const QUESTIONS_COLLECTION = 'questions';
export const SAMPLE_QUESTION_IDS = new Set([
  'q_k4_01',
  'q_k4_02',
  'q_k4_03',
  'q_k4_04',
  'q_k4_05',
  'q_k4_06'
]);

export function isSampleQuestionId(id?: string): boolean {
  if (!id) return false;
  const clean = id.trim();
  return SAMPLE_QUESTION_IDS.has(clean) || /^q_k4_0[1-6]$/i.test(clean);
}

/**
 * Xóa triệt để 6 câu hỏi dữ liệu mẫu (q_k4_01 đến q_k4_06) khỏi Firestore và bộ nhớ cục bộ
 */
export async function purgeSampleQuestionsFromFirestore(): Promise<void> {
  try {
    const cached = getLocalCachedQuestions();
    const filtered = cached.filter((q) => !isSampleQuestionId(q?.id));
    if (filtered.length !== cached.length) {
      saveLocalCachedQuestions(filtered);
    }

    if (!db) return;
    for (const sampleId of Array.from(SAMPLE_QUESTION_IDS)) {
      try {
        await deleteDoc(doc(db, QUESTIONS_COLLECTION, sampleId));
      } catch {}
    }
  } catch (e) {
    console.warn('Cảnh báo khi dọn câu hỏi mẫu q_k4_01..q_k4_06:', e);
  }
}

export enum FirestoreOpType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: FirestoreOpType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: FirestoreOpType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function fixMisTypedTrueFalseQuestions(questions: QuestionItem[]): { fixedQuestions: QuestionItem[]; fixedCount: number; fixedIds: string[] } {
  let fixedCount = 0;
  const fixedIds: string[] = [];
  const fixedQuestions = (questions || []).map(q => {
    if (!q) return q;
    const hasStatements = Array.isArray(q.statements) && q.statements.length > 0;
    const typeStr = (q.type || '').trim().toLowerCase();
    const isWrongType = typeStr === 'matching' || typeStr === 'nối cặp' || typeStr === 'noi_cap' || typeStr === 'ghep_noi' || typeStr === 'ghép nối' || typeStr === 'classification' || typeStr === 'phan_loai';
    
    if (hasStatements && (typeStr !== 'true_false' || isWrongType)) {
      fixedCount++;
      fixedIds.push(q.id);
      return {
        ...q,
        type: 'true_false'
      };
    }
    return q;
  });
  if (fixedCount > 0) {
    console.log(`🔧 Đã tự động sửa ${fixedCount} câu hỏi Đúng/Sai nhiều mệnh đề bị gán nhầm type (IDs: ${fixedIds.join(', ')})`);
  }
  return { fixedQuestions, fixedCount, fixedIds };
}

/**
 * Clean & sanitize question data before saving to Firestore to prevent undefined or missing fields
 */
export function sanitizeQuestionForFirestore(q: QuestionItem): QuestionItem {
  const safeId = q.id || `q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  let qType = q.type || 'multiple_choice';
  const hasMatchingPairs = Array.isArray(q.matchingPairs) && q.matchingPairs.length > 0;
  const contentLower = (q.content || q.questionText || '').toLowerCase();
  const hasMatchingKeywords = contentLower.includes('cột a') && contentLower.includes('cột b') || contentLower.includes('nối') || contentLower.includes('ghép cặp');
  const isMatchingType = qType === 'matching' || qType === 'nối cặp' || qType === 'kéo thả' || hasMatchingPairs || hasMatchingKeywords;
  const hasStatements = Array.isArray(q.statements) && q.statements.length > 0;

  if (isMatchingType) {
    qType = 'matching';
  } else if (hasStatements) {
    qType = 'true_false';
  }

  const isOrdering = qType === 'ordering' || qType === 'sắp xếp' || qType === 'sắp xếp thứ tự' || qType === 'sap_xep';
  let defaultCorrectAnswer = 'A';
  if (q.type === 'essay') {
    defaultCorrectAnswer = 'Gợi ý chấm tự luận';
  } else if (isOrdering && Array.isArray(q.options) && q.options.length > 0) {
    defaultCorrectAnswer = q.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
  }

  const identity = resolveTeacherIdentityForWrite({
    teacherId: q.teacherId,
    teacherEmail: q.teacherEmail,
    teacherName: q.teacherName,
    createdBy: q.createdBy
  });

  const cleanOptions = Array.isArray(q.options)
    ? q.options.map((opt) => (typeof opt === 'string' ? opt.trim() : String(opt ?? ''))).filter(Boolean)
    : [];

  const nowTimestamp = q.createdAt || new Date().toISOString();

  const cleanQ: QuestionItem = {
    id: String(safeId),
    code: q.code || `CH-${(q.subject || 'TOAN').toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-4)}`,
    subject: q.subject || 'Toán',
    grade: '4',
    level: q.level || 'nhan_biet',
    type: qType,
    content: (q.content || q.questionText || 'Nội dung câu hỏi').trim(),
    options: cleanOptions,
    lessonName: q.lessonName || q.topic || 'Bài học',
    correctAnswer: q.correctAnswer || defaultCorrectAnswer,
    explanation: q.explanation || 'Hướng dẫn sư phạm cho câu hỏi.',
    teacherId: identity.teacherId || 'gv-12',
    teacherEmail: identity.teacherEmail || 'thuthuthtk@gmail.com',
    teacherName: q.teacherName || identity.teacherName || 'Giáo viên',
    createdBy: identity.createdBy || identity.teacherId || 'gv-12',
    authorName: q.authorName || identity.teacherName || 'Giáo viên',
    authorType: q.authorType || 'my',
    isShared: q.isShared !== undefined ? Boolean(q.isShared) : true,
    createdAt: nowTimestamp
  };

  if (isOrdering) {
    const trueSequence = extractTrueOrderingFromQuestion(q);
    cleanQ.correctOrder = trueSequence.length > 0 ? trueSequence : (cleanQ.options || []);
    cleanQ.order = (cleanQ.options || []).map((_, i) => i);
    cleanQ.indices = (cleanQ.options || []).map((_, i) => i);
    cleanQ.correctAnswer = cleanQ.correctOrder.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
  }

  if (Array.isArray(q.statements) && q.statements.length > 0) {
    cleanQ.statements = q.statements.map(st => ({
      statement: st.statement || '',
      isCorrect: Boolean(st.isCorrect),
      explanation: st.explanation || ''
    }));
  }

  if (Array.isArray(q.classificationGroups) && q.classificationGroups.length > 0) {
    cleanQ.classificationGroups = q.classificationGroups.filter(Boolean);
  }

  if (Array.isArray(q.classificationItems) && q.classificationItems.length > 0) {
    cleanQ.classificationItems = q.classificationItems.map(item => ({
      name: item.name || '',
      group: item.group || ''
    }));
  }

  if (Array.isArray(q.matchingPairs) && q.matchingPairs.length > 0) {
    cleanQ.matchingPairs = q.matchingPairs.map(p => ({
      left: p.left || '',
      right: p.right || '',
      match: p.match || ''
    }));
  }

  if (q.imageUrl) cleanQ.imageUrl = q.imageUrl;
  if (q.imagePrompt) cleanQ.imagePrompt = q.imagePrompt;

  return cleanQ;
}

/**
 * Retrieve cached questions from localStorage (automatically excluding 6 sample questions q_k4_01..q_k4_06)
 */
export function getLocalCachedQuestions(): QuestionItem[] {
  let questions: QuestionItem[] = [];
  try {
    const raw = localStorage.getItem(QUESTIONS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        questions = parsed.filter((q) => q && !isSampleQuestionId(q.id));
      }
    }
  } catch (e) {
    console.warn('Could not read cached questions from localStorage', e);
  }
  const { fixedQuestions, fixedCount } = fixMisTypedTrueFalseQuestions(questions);
  let finalQuestions = fixedQuestions;

  let orderingFixedCount = 0;
  finalQuestions = finalQuestions.map(q => {
    if (!q) return q;
    const isOrdering = q.type === 'ordering' || q.type === 'sắp xếp' || q.type === 'sắp xếp thứ tự' || q.type === 'sap_xep';
    if (isOrdering) {
      const trueSeq = extractTrueOrderingFromQuestion(q);
      if (trueSeq.length > 0) {
        const correctAnsStr = trueSeq.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
        if (JSON.stringify(q.correctOrder) !== JSON.stringify(trueSeq) || q.correctAnswer !== correctAnsStr) {
          orderingFixedCount++;
          return {
            ...q,
            correctOrder: trueSeq,
            order: (q.options || []).map((_, i) => i),
            indices: (q.options || []).map((_, i) => i),
            correctAnswer: correctAnsStr
          };
        }
      }
    }
    return q;
  });

  if (fixedCount > 0 || orderingFixedCount > 0) {
    saveLocalCachedQuestions(finalQuestions);
  }
  return finalQuestions;
}

/**
 * Save questions to local cache (excluding 6 sample questions q_k4_01..q_k4_06)
 */
export function saveLocalCachedQuestions(questions: QuestionItem[]): void {
  try {
    const cleanList = (questions || []).filter((q) => q && !isSampleQuestionId(q.id));
    localStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify(cleanList));
  } catch (e) {
    console.warn('Could not write questions to localStorage', e);
  }
}

/**
 * Dispatch notification toast
 */
export function notifyQuestionSaved(count: number = 1, _title?: string) {
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('eduplay_questions_updated', {
          detail: { count, timestamp: Date.now() }
        })
      );
    } catch {}
  }
}

/**
 * Save a single question directly to Firestore collection `questions` & local cache
 */
export async function saveQuestionToFirestore(question: QuestionItem): Promise<void> {
  const sanitized = sanitizeQuestionForFirestore(question);
  const cleanPayload = sanitizeForFirestore(sanitized);

  try {
    if (!db) {
      throw new Error('Kết nối Firestore (dayhockhoi4) chưa được khởi tạo.');
    }

    const docRef = doc(db, QUESTIONS_COLLECTION, sanitized.id);
    try {
      await setDoc(docRef, cleanPayload, { merge: true });
    } catch (directErr) {
      const addedRef = await addDoc(collection(db, QUESTIONS_COLLECTION), cleanPayload);
      sanitized.id = addedRef.id;
    }

    // Update local cache after Firestore write succeeds
    const current = getLocalCachedQuestions();
    const updated = current.some(q => q.id === sanitized.id)
      ? current.map(q => (q.id === sanitized.id ? sanitized : q))
      : [sanitized, ...current];
    saveLocalCachedQuestions(updated);
    notifyQuestionSaved(1);
  } catch (error: any) {
    console.error('Error saving single question to Firestore:', error);
    // Keep in local cache as backup
    const current = getLocalCachedQuestions();
    const updated = current.some(q => q.id === sanitized.id)
      ? current.map(q => (q.id === sanitized.id ? sanitized : q))
      : [sanitized, ...current];
    saveLocalCachedQuestions(updated);

    throw new Error(error?.message || 'Không thể lưu câu hỏi lên Firestore (dayhockhoi4).');
  }
}

/**
 * Save a batch of questions directly to Firestore collection `questions` (manual or AI Generation)
 */
export async function saveQuestionsBatchToFirestore(
  questions: QuestionItem[]
): Promise<{ success: boolean; count: number }> {
  if (!Array.isArray(questions) || questions.length === 0) {
    return { success: true, count: 0 };
  }

  const sanitizedList = questions
    .filter((q) => q && !isSampleQuestionId(q.id))
    .map(q => sanitizeQuestionForFirestore(q));

  if (!db) {
    throw new Error('Kết nối Firestore (dayhockhoi4) chưa sẵn sàng.');
  }

  // Clear any stale quota flags so user-initiated question saves are never skipped
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('eduplay_k4_firestore_quota_exceeded');
      localStorage.removeItem('eduplay_k4_firestore_quota_v2_exceeded');
    } catch {}
  }

  try {
    // 1. Ghi trực tiếp từng câu hỏi hoặc theo batch lên collection 'questions' của dự án dayhockhoi4
    const CHUNK_SIZE = 200;
    for (let i = 0; i < sanitizedList.length; i += CHUNK_SIZE) {
      const chunk = sanitizedList.slice(i, i + CHUNK_SIZE);
      try {
        const batch = writeBatch(db);
        chunk.forEach(q => {
          const docRef = doc(db, QUESTIONS_COLLECTION, q.id);
          batch.set(docRef, sanitizeForFirestore(q), { merge: true });
        });
        await batch.commit();
      } catch (batchErr) {
        // Fallback: ghi trực tiếp từng document bằng setDoc / addDoc nếu writeBatch gặp lỗi
        for (const q of chunk) {
          const cleanQ = sanitizeForFirestore(q);
          try {
            const docRef = doc(db, QUESTIONS_COLLECTION, q.id);
            await setDoc(docRef, cleanQ, { merge: true });
          } catch {
            const added = await addDoc(collection(db, QUESTIONS_COLLECTION), cleanQ);
            q.id = added.id;
          }
        }
      }
    }

    // 2. Dọn bỏ 6 câu hỏi mẫu cũ q_k4_01..q_k4_06 nếu còn tồn tại trên Firestore
    purgeSampleQuestionsFromFirestore().catch(() => {});

    // 3. Cập nhật bộ nhớ đệm cục bộ và phát sự kiện cập nhật giao diện ngay lập tức
    const current = getLocalCachedQuestions();
    const idMap = new Map(sanitizedList.map(q => [q.id, q]));
    const updatedExisting = current.map(q => (idMap.has(q.id) ? idMap.get(q.id)! : q));
    const newItems = sanitizedList.filter(q => !current.some(c => c.id === q.id));
    const finalCache = [...newItems, ...updatedExisting];
    saveLocalCachedQuestions(finalCache);

    notifyQuestionSaved(sanitizedList.length);
    return { success: true, count: sanitizedList.length };
  } catch (error: any) {
    console.error('Lỗi khi lưu danh sách câu hỏi vào Firestore (dayhockhoi4):', error);
    // Vẫn lưu bản sao vào cache cục bộ để giáo viên không bị mất dữ liệu vừa soạn
    const current = getLocalCachedQuestions();
    const idMap = new Map(sanitizedList.map(q => [q.id, q]));
    const updatedExisting = current.map(q => (idMap.has(q.id) ? idMap.get(q.id)! : q));
    const newItems = sanitizedList.filter(q => !current.some(c => c.id === q.id));
    saveLocalCachedQuestions([...newItems, ...updatedExisting]);

    throw new Error(error?.message || 'Lỗi ghi dữ liệu câu hỏi lên Firestore (dayhockhoi4).');
  }
}

/**
 * Tải danh sách câu hỏi dạng bản sao file JSON
 */
export function downloadQuestionsAsJSON(questions: QuestionItem[], filename = 'danh_sach_cau_hoi_ai.json'): void {
  try {
    const jsonStr = JSON.stringify(questions, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Lỗi khi tải file JSON câu hỏi:', e);
  }
}

/**
 * Tải danh sách câu hỏi dạng bản sao file Excel/CSV
 */
export function downloadQuestionsAsCSV(questions: QuestionItem[], filename = 'danh_sach_cau_hoi_ai.csv'): void {
  try {
    const headers = ['STT', 'Mã CH', 'Nội dung', 'Loại câu', 'Mức độ', 'Chủ đề/Bài học', 'Khối', 'Môn', 'Phương án/Mệnh đề', 'Đáp án đúng', 'Giải thích'];
    const rows = (questions || []).map((q, idx) => {
      let optionsText = '';
      if (Array.isArray(q.options)) {
        optionsText = q.options.join(' | ');
      } else if (Array.isArray(q.statements)) {
        optionsText = q.statements.map((s) => `${s.statement}: ${s.isCorrect ? 'Đúng' : 'Sai'}`).join(' | ');
      }
      return [
        idx + 1,
        q.code || '',
        `"${(q.content || '').replace(/"/g, '""')}"`,
        q.type || '',
        q.level || '',
        `"${(q.lessonName || '').replace(/"/g, '""')}"`,
        q.grade || '',
        q.subject || '',
        `"${optionsText.replace(/"/g, '""')}"`,
        `"${(q.correctAnswer || '').replace(/"/g, '""')}"`,
        `"${(q.explanation || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Lỗi khi tải file CSV câu hỏi:', e);
  }
}


/**
 * Delete a question from Firestore & cache
 */
export async function deleteQuestionFromFirestore(id: string): Promise<void> {
  const path = `${QUESTIONS_COLLECTION}/${id}`;

  if (!db) {
    const current = getLocalCachedQuestions();
    saveLocalCachedQuestions(current.filter(q => q.id !== id));
    return;
  }

  const TIMEOUT_MS = 15000;
  let timeoutId: any = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Hết thời gian kết nối đến Firestore (15 giây). Đã hủy thao tác xóa."));
    }, TIMEOUT_MS);
  });

  const deleteOp = async () => {
    const docRef = doc(db, QUESTIONS_COLLECTION, id);
    await trackedDeleteDoc(docRef);
    const current = getLocalCachedQuestions();
    saveLocalCachedQuestions(current.filter(q => q.id !== id));
  };

  try {
    await Promise.race([deleteOp(), timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    console.error('Error deleting question from Firestore:', error);
    handleFirestoreError(error, FirestoreOpType.DELETE, path);
    throw error;
  }
}

/**
 * Delete multiple questions from Firestore & cache
 */
export async function deleteQuestionsBatchFromFirestore(
  ids: string[],
  onProgress?: (deletedSoFar: number, total: number) => void
): Promise<{ success: boolean; count: number }> {
  if (!ids || ids.length === 0) return { success: true, count: 0 };

  localStorage.setItem('eduplay_k4_questions_db_initialized', 'true');
  const idSet = new Set(ids);

  if (!db) {
    const current = getLocalCachedQuestions();
    saveLocalCachedQuestions(current.filter(q => !idSet.has(q.id)));
    if (onProgress) onProgress(ids.length, ids.length);
    return { success: true, count: ids.length };
  }

  const TIMEOUT_MS = 15000;
  let timeoutId: any = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Hết thời gian kết nối đến Firestore (15 giây). Đã hủy thao tác xóa."));
    }, TIMEOUT_MS);
  });

  const deleteOperation = async (): Promise<{ success: boolean; count: number }> => {
    const chunkSize = 100;
    let deletedCount = 0;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const batch = trackedWriteBatch(db);
      chunk.forEach(id => {
        const docRef = doc(db, QUESTIONS_COLLECTION, id);
        batch.delete(docRef);
      });
      await batch.commit();
      deletedCount += chunk.length;
      if (onProgress) {
        onProgress(deletedCount, ids.length);
      }
    }

    const current = getLocalCachedQuestions();
    saveLocalCachedQuestions(current.filter(q => !idSet.has(q.id)));

    return { success: true, count: ids.length };
  };

  try {
    const result = await Promise.race([deleteOperation(), timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    console.error('Lỗi khi thực hiện writeBatch trên Firestore:', error);
    const path = `${QUESTIONS_COLLECTION}/[batch_${ids.length}]`;
    handleFirestoreError(error, FirestoreOpType.DELETE, path);
    throw error;
  }
}

/**
 * Fetch questions from Firestore using role-based `where()` scoping
 */
export async function fetchQuestionsFromFirestore(scopeOverride?: ScopeOverride): Promise<QuestionItem[]> {
  try {
    if (!db) return getLocalCachedQuestions();

    // Xóa các câu hỏi mẫu q_k4_01..q_k4_06 trên Firestore (chạy ngầm an toàn)
    purgeSampleQuestionsFromFirestore().catch(() => {});

    const snap = await getScopedDocs('questions', scopeOverride);
    if (snap && !snap.empty) {
      localStorage.setItem('eduplay_k4_questions_db_initialized', 'true');
      const items: QuestionItem[] = snap.docs
        .filter(docSnap => !isSampleQuestionId(docSnap.id))
        .map(docSnap => ({
          ...(docSnap.data() as QuestionItem),
          id: docSnap.id
        }));
      saveLocalCachedQuestions(items);
      return items;
    } else if (snap) {
      saveLocalCachedQuestions([]);
      return [];
    }
    return getLocalCachedQuestions();
  } catch (error) {
    console.warn('Error fetching questions from Firestore, returning local cache:', error);
    return getLocalCachedQuestions();
  }
}

/**
 * Live subscription to questions in Firestore using role-based `where()` scoping
 */
export function subscribeToQuestionsFromFirestore(
  onData: (questions: QuestionItem[]) => void,
  onError?: (error: any) => void,
  scopeOverride?: ScopeOverride
): () => void {
  if (!db) {
    onData(getLocalCachedQuestions());
    return () => {};
  }

  try {
    return subscribeScopedCollection(
      'questions',
      snapshot => {
        const isFromCache = snapshot.metadata.fromCache;
        const hasPending = snapshot.metadata.hasPendingWrites;

        updateCollectionCacheStatus('questions', isFromCache, snapshot.size, hasPending);

        if (!snapshot.empty) {
          localStorage.setItem('eduplay_k4_questions_db_initialized', 'true');
          const sampleDocs = snapshot.docs.filter(d => isSampleQuestionId(d.id));
          if (sampleDocs.length > 0) {
            purgeSampleQuestionsFromFirestore().catch(() => {});
          }
          const loaded: QuestionItem[] = snapshot.docs
            .filter(d => !isSampleQuestionId(d.id))
            .map(d => ({
              ...(d.data() as QuestionItem),
              id: d.id
            }));
          saveLocalCachedQuestions(loaded);
          onData(loaded);
        } else {
          saveLocalCachedQuestions([]);
          onData([]);
        }
      },
      err => {
        console.warn('Error in subscribeToQuestionsFromFirestore snapshot:', err);
        if (onError) onError(err);
        onData(getLocalCachedQuestions());
      },
      scopeOverride
    );
  } catch (err) {
    console.warn('Error setting up subscribeToQuestionsFromFirestore:', err);
    onData(getLocalCachedQuestions());
    return () => {};
  }
}

/**
 * Migration trực tiếp trên Firestore cho toàn bộ câu hỏi Sắp Xếp Thứ Tự (Ordering)
 */
export async function migrateFirestoreOrderingData(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    console.log('🔄 [MIGRATION START] Đang quét và nâng cấp dữ liệu câu hỏi Sắp xếp thứ tự...');
    
    // 1. Quét dữ liệu từ LocalStorage Cache trước
    const cachedQuestions = getLocalCachedQuestions();
    const migratedQuestions: QuestionItem[] = [];

    cachedQuestions.forEach(q => {
      const isOrdering = q.type === 'ordering' || q.type === 'sắp xếp' || q.type === 'sắp xếp thứ tự' || q.type === 'sap_xep';
      if (isOrdering) {
        const trueOrder = extractTrueOrderingFromQuestion(q);
        if (trueOrder.length > 0) {
          const newAnswerStr = trueOrder.map((s, i) => `${i + 1}. ${s}`).join('\n');
          console.log(`📌 [MIGRATION ĐỌC DỮ LIỆU CŨ] ID: ${q.id} | Nội dung: ${q.content?.slice(0, 50)}...`);
          console.log('   🔴 correctOrder TRƯỚC khi Migrate:', q.correctOrder);
          console.log('   🔴 correctAnswer TRƯỚC khi Migrate:', q.correctAnswer);
          console.log('   ✅ correctOrder SAU khi Migrate (CHUẨN SƯ PHẠM):', trueOrder);

          const updatedQ: QuestionItem = {
            ...q,
            correctOrder: trueOrder,
            order: (q.options || []).map((_, i) => i),
            indices: (q.options || []).map((_, i) => i),
            correctAnswer: newAnswerStr
          };
          migratedQuestions.push(updatedQ);
        }
      }
    });

    // 2. Đọc trực tiếp từ Firestore để ghi đè (chỉ Admin thực hiện ghi đè toàn bộ collection)
    const scope = getFirestoreAccessScope();
    if (db && scope.isAdmin) {
      const snap = await getDocs(collection(db, QUESTIONS_COLLECTION));
      if (!snap.empty) {
        const batch = trackedWriteBatch(db);
        let batchCount = 0;

        snap.docs.forEach(docSnap => {
          const q = { ...(docSnap.data() as QuestionItem), id: docSnap.id };
          const isOrdering = q.type === 'ordering' || q.type === 'sắp xếp' || q.type === 'sắp xếp thứ tự' || q.type === 'sap_xep';
          if (isOrdering) {
            const trueOrder = extractTrueOrderingFromQuestion(q);
            if (trueOrder.length > 0) {
              const newAnswerStr = trueOrder.map((s, i) => `${i + 1}. ${s}`).join('\n');
              const sanitized = sanitizeQuestionForFirestore({
                ...q,
                correctOrder: trueOrder,
                order: (q.options || []).map((_, i) => i),
                indices: (q.options || []).map((_, i) => i),
                correctAnswer: newAnswerStr
              });
              batch.set(doc(db, QUESTIONS_COLLECTION, q.id), sanitized);
              batchCount++;
            }
          }
        });

        if (batchCount > 0) {
          await batch.commit();
          console.log(`🚀 [MIGRATION FIRESTORE] Đã ghi đè trực tiếp thành công ${batchCount} câu hỏi Sắp xếp thứ tự vào Firestore!`);
        }
      }
    }

    if (migratedQuestions.length > 0) {
      saveLocalCachedQuestions(cachedQuestions.map(q => {
        const found = migratedQuestions.find(m => m.id === q.id);
        return found ? found : q;
      }));
    }
  } catch (err) {
    console.warn('Lỗi trong quá trình chạy Migration Firestore:', err);
  }
}

// Chạy Migration tự động khi ứng dụng khởi chạy
if (typeof window !== 'undefined') {
  setTimeout(() => {
    migrateFirestoreOrderingData().catch(console.warn);
  }, 500);
}


/**
 * Export question bank to JSON string
 */
export function exportQuestionsToJSON(questionsInput?: QuestionItem[]): string {
  const list = questionsInput && questionsInput.length > 0 ? questionsInput : getLocalCachedQuestions();
  return JSON.stringify(list, null, 2);
}

/**
 * Import question bank from JSON string
 */
export function importQuestionsFromJSON(jsonString: string): QuestionItem[] {
  try {
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed)) {
      saveLocalCachedQuestions(parsed);
      saveQuestionsBatchToFirestore(parsed).catch(console.warn);
      return parsed;
    }
    return [];
  } catch (err) {
    console.error('Lỗi khi đọc file JSON câu hỏi:', err);
    return [];
  }
}

/**
 * Seed initial questions manually (Vô hiệu hóa để giữ database sạch)
 */
export async function seedInitialQuestionsManually(): Promise<void> {
  return;
}

/**
 * Restore full question bank (Vô hiệu hóa để giữ database sạch)
 */
export async function restoreFullQuestionBank(): Promise<void> {
  return;
}
