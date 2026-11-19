import { doc, setDoc, getDocFromServer, getDoc } from 'firebase/firestore';
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

interface AssignmentSubmissionPayload {
  assignmentId: string;
  score: number;
  maxScore: number;
  submittedAt: string;
  attemptNumber?: number;
  answers?: Record<string, any>;
  keepAttempts?: KeepAttemptPolicy;
}

/**
 * Dịch vụ quản lý kết quả học tập tập trung theo studentCode
 */
export const studentResultService = {
  /**
   * Lưu kết quả làm bài tập của học sinh
   * Nếu cấu hình keepAttempts là 'last' (lần cuối), hệ thống ghi đè kết quả mới nhất.
   */
  async saveAssignmentResult(
    rawStudentCode: string,
    payload: AssignmentSubmissionPayload
  ): Promise<boolean> {
    try {
      const studentCode = normalizeStudentCode(rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');
      if (!payload?.assignmentId) throw new Error('Mã bài tập không hợp lệ');

      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode);
      const policy: KeepAttemptPolicy = payload.keepAttempts || 'last';
      const safeScore = Number.isFinite(Number(payload.score)) ? Number(payload.score) : 0;
      const safeMaxScore = Number.isFinite(Number(payload.maxScore)) ? Number(payload.maxScore) : 10;
      const safeSubmittedAt = payload.submittedAt || new Date().toISOString();
      const safeAnswers = sanitizeForFirestore(payload.answers || {});

      const assignmentData: any = {
        assignmentId: String(payload.assignmentId),
        studentCode,
        score: safeScore,
        maxScore: safeMaxScore,
        submittedAt: safeSubmittedAt,
        attemptNumber: Number.isFinite(Number(payload.attemptNumber)) ? Number(payload.attemptNumber) : 1,
      };

      // Nếu chính sách là 'last', chỉ lưu câu trả lời hoặc chi tiết của lần nộp mới nhất
      if (policy === 'last') {
        assignmentData.lastAttempt = {
          score: safeScore,
          submittedAt: safeSubmittedAt,
          answers: safeAnswers,
        };
      } else if (policy === 'best') {
        assignmentData.bestScore = safeScore;
      }

      // Cập nhật cấu trúc lồng nhau dùng dot notation qua { merge: true } để không ghi đè dữ liệu môn khác
      const updatePayload = sanitizeForFirestore({
        studentCode,
        [`assignments.${payload.assignmentId}`]: assignmentData,
        updatedAt: new Date().toISOString(),
      });

      // Thực hiện ghi an toàn bằng setDoc merge kèm timeout
      await withFirestoreTimeout(
        setDoc(docRef, updatePayload, { merge: true }),
        10000,
        'saveAssignmentResult.setDoc'
      );

      // Xác thực không chặn nếu server phản hồi chậm hoặc đang offline
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
      const studentCode = normalizeStudentCode(rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode);
      const safeScore = Number.isFinite(Number(resultData?.score)) ? Number(resultData.score) : 0;
      const safeMaxScore = Number.isFinite(Number(resultData?.maxScore)) ? Number(resultData.maxScore) : 10;

      const updatePayload = sanitizeForFirestore({
        studentCode,
        [`exams.${examId}`]: {
          ...resultData,
          examId,
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
      const studentCode = normalizeStudentCode(rawStudentCode);
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
      const studentCode = normalizeStudentCode(rawStudentCode);
      if (!studentCode) return null;
      // Fetch from: student_results/{studentCode}/exams/{examId}
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
      const studentCode = normalizeStudentCode(rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      // Save to: student_results/{studentCode}/exams/{examId}
      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode, 'exams', examId);
      const sanitizedPayload = sanitizeForFirestore({
        ...submissionData,
        studentCode,
        studentId: studentCode,
        examId,
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
      const studentCode = normalizeStudentCode(rawStudentCode);
      if (!studentCode) throw new Error('Mã học sinh không hợp lệ');

      // Save to: student_results/{studentCode}/assignments/{assignmentId}
      const docRef = doc(db, STUDENT_RESULTS_COLLECTION, studentCode, 'assignments', assignmentId);
      const sanitizedPayload = sanitizeForFirestore({
        ...submissionData,
        studentCode,
        studentId: studentCode,
        assignmentId,
        updatedAt: new Date().toISOString(),
      });

      await withFirestoreTimeout(
        setDoc(docRef, sanitizedPayload, { merge: true }),
        10000,
        'saveFullAssignmentSubmission.setDoc'
      );
      return true;
    } catch (error) {
      console.error('Lỗi khi lưu bài tập vào Firestore:', error);
      throw error;
    }
  }
};

