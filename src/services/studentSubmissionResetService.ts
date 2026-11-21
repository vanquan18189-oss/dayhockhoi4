import { db } from './firebase';
import { 
  doc, 
  deleteDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  deleteField 
} from 'firebase/firestore';
import { normalizeStudentCode } from './studentCode';
import { deleteExamDraft } from './examDraftService';
import { invalidateAllSubmissionsCache } from './hocBaDataService';
import { backupSubmissionBeforeDelete } from './unmatchedSubmissionsService';
import {
  studentResultService,
  extractCleanStudentCode,
  getCandidateAssignmentIds,
  isMatchingStudentCode
} from './studentResultService';
import { clearMemoryTrackingData, clearIndexedDBTrackingData } from './assignmentTrackingData';

export interface ResetSubmissionOptions {
  studentCode: string;
  studentName?: string;
  studentId?: string;
  examId: string;
  originalExamId?: string;
  targetClass?: string;
}

/**
 * Xóa triệt để và đồng bộ toàn bộ dữ liệu bài làm của học sinh trên Firestore & LocalStorage
 * DUY NHẤT theo Mã học sinh (studentCode viết hoa, trim khoảng trắng), KHÔNG phụ thuộc tên học sinh.
 */
export async function resetOrDeleteStudentExamSubmission(
  options: ResetSubmissionOptions
): Promise<{ success: boolean; deletedCount: number }> {
  const { studentCode, studentId, examId, originalExamId, targetClass } = options;
  const rawInputCode = String(studentCode || studentId || '').trim();
  const normCode = (
    extractCleanStudentCode({ studentCode: rawInputCode }, rawInputCode) ||
    normalizeStudentCode(rawInputCode)
  )
    .trim()
    .toUpperCase();

  if (!normCode) {
    throw new Error('Mã học sinh không hợp lệ.');
  }
  if (!examId) {
    throw new Error('Mã đề kiểm tra không hợp lệ.');
  }

  const candDocIds = getCandidateAssignmentIds({
    id: examId,
    originalAssignmentId: originalExamId,
    targetClass
  });

  let deletedCount = 0;

  // 1. Quét và xóa triệt để trên Firestore
  if (db) {
    for (const docId of candDocIds) {
      try {
        // A. Xóa trong subcollection 'exams/{docId}/submissions'
        const subColRef = collection(db, 'exams', docId, 'submissions');
        const subSnap = await getDocs(subColRef);

        const deletePromises: Promise<any>[] = [];
        subSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (isMatchingStudentCode(normCode, data, docSnap.id)) {
            deletePromises.push(
              deleteDoc(doc(db, 'exams', docId, 'submissions', docSnap.id))
                .then(() => { deletedCount++; })
                .catch((err) => {
                  console.warn(`Lỗi xóa doc ${docSnap.id} trong exams/${docId}/submissions:`, err);
                })
            );
          }
        });

        // Đảm bảo xóa cả các ID cố định
        deletePromises.push(deleteDoc(doc(db, 'exams', docId, 'submissions', normCode)).catch(() => {}));
        deletePromises.push(deleteDoc(doc(db, 'exams', docId, 'submissions', `${normCode}_${docId}`)).catch(() => {}));
        deletePromises.push(deleteDoc(doc(db, 'exams', docId, 'submissions', `${normCode}_${docId}_1`)).catch(() => {}));
        deletePromises.push(deleteDoc(doc(db, 'exams', docId, 'submissions', `sub-${docId}-${normCode}`)).catch(() => {}));

        await Promise.allSettled(deletePromises);

        // B. Cập nhật mảng submissions trên master document exams/{docId}
        const masterRef = doc(db, 'exams', docId);
        const masterSnap = await getDoc(masterRef);
        if (masterSnap.exists()) {
          const masterData = masterSnap.data();
          if (Array.isArray(masterData.submissions)) {
            const filteredSubs = masterData.submissions.filter((s: any) => {
              if (!s) return false;
              return !isMatchingStudentCode(normCode, s, s.id);
            });

            await updateDoc(masterRef, {
              submissions: filteredSubs,
              updatedAt: new Date().toISOString()
            });
          }
        }

        // C. Kiểm tra cả collection assignments nếu có
        try {
          const asColRef = collection(db, 'assignments', docId, 'submissions');
          const asSnap = await getDocs(asColRef);
          const asDeletePromises: Promise<any>[] = [];
          asSnap.forEach((docSnap) => {
            const data = docSnap.data();
            if (isMatchingStudentCode(normCode, data, docSnap.id)) {
              asDeletePromises.push(deleteDoc(doc(db, 'assignments', docId, 'submissions', docSnap.id)).catch(() => {}));
            }
          });
          await Promise.allSettled(asDeletePromises);

          const asMasterRef = doc(db, 'assignments', docId);
          const asMasterSnap = await getDoc(asMasterRef);
          if (asMasterSnap.exists()) {
            const asData = asMasterSnap.data();
            if (Array.isArray(asData.submissions)) {
              const filteredAsSubs = asData.submissions.filter((s: any) => {
                if (!s) return false;
                return !isMatchingStudentCode(normCode, s, s.id);
              });
              await updateDoc(asMasterRef, {
                submissions: filteredAsSubs,
                updatedAt: new Date().toISOString()
              });
            }
          }
        } catch {}
      } catch (err: any) {
        console.warn(`Lỗi khi dọn dẹp Firestore cho exam ${docId}:`, err);
      }
    }

    // D. Xóa trong collection `student_results` theo studentCode & targetId/assignmentId/examId
    try {
      const srDeleted = await studentResultService.deleteAssignmentSubmissionByStudentCode(normCode, {
        id: examId,
        originalAssignmentId: originalExamId,
        targetClass
      });
      deletedCount += srDeleted;
    } catch (srErr) {
      console.warn('Lỗi cập nhật student_results khi xóa bài:', srErr);
    }

    // E. Xóa bản nháp `exam_drafts` và `exam_progress`
    for (const docId of candDocIds) {
      await deleteExamDraft(normCode, docId).catch(() => {});
      try {
        await deleteDoc(doc(db, 'exam_drafts', `${normCode}_${docId}`));
      } catch {}
      try {
        await deleteDoc(doc(db, 'exam_progress', `${normCode}_${docId}`));
      } catch {}
    }
  }

  // 2. Dọn dẹp triệt để trong LocalStorage
  cleanLocalStorageSubmissionsForStudent(normCode, [rawInputCode, studentId, studentCode], candDocIds);

  // 3. Làm mới Cache và Broadcast sự kiện toàn hệ thống
  try {
    invalidateAllSubmissionsCache();
    clearMemoryTrackingData();
    await clearIndexedDBTrackingData();
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
    window.dispatchEvent(new Event('eduplay_student_submissions_updated'));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('eduplay_submission_reset', {
      detail: {
        studentCode: normCode,
        examId,
        candDocIds
      }
    }));
  }

  return { success: true, deletedCount };
}

/**
 * Helper dọn sạch mọi bản ghi bài nộp của một học sinh cho một bài tập/đề thi trong LocalStorage
 */
function cleanLocalStorageSubmissionsForStudent(
  normCode: string,
  extraStudentKeys: (string | undefined)[],
  candDocIds: string[]
): void {
  if (typeof window === 'undefined') return;
  try {
    const candIdSet = new Set(candDocIds);
    const matchesTargetAssignment = (rawId: any): boolean => {
      const idStr = String(rawId || '').trim();
      if (!idStr) return false;
      const rootStr = idStr.replace(/-class-.*$/i, '').trim();
      return (
        candIdSet.has(idStr) ||
        (Boolean(rootStr) && candIdSet.has(rootStr)) ||
        candDocIds.some((cid) => idStr.includes(cid) || cid.includes(idStr))
      );
    };

    const studentKeys = Array.from(
      new Set([normCode, normCode.toLowerCase(), ...extraStudentKeys].filter(Boolean) as string[])
    );

    // 1. Lọc hoặc xóa các key theo mã bài tập: eduplay_k4_exam_subs_${docId}
    candDocIds.forEach((docId) => {
      const key = `eduplay_k4_exam_subs_${docId}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((s: any) => !isMatchingStudentCode(normCode, s, s?.id));
            if (filtered.length > 0) {
              localStorage.setItem(key, JSON.stringify(filtered));
            } else {
              localStorage.removeItem(key);
            }
          } else {
            localStorage.removeItem(key);
          }
        } catch {
          localStorage.removeItem(key);
        }
      }

      studentKeys.forEach((k) => {
        localStorage.removeItem(`eduplay_k4_exam_draft_${k}_${docId}`);
      });
    });

    // 2. Lọc bỏ khỏi eduplay_k4_all_exam_submissions và eduplay_k4_all_assignment_submissions
    for (const globalKey of ['eduplay_k4_all_exam_submissions', 'eduplay_k4_all_assignment_submissions']) {
      const allSubsRaw = localStorage.getItem(globalKey);
      if (allSubsRaw) {
        try {
          const allSubs = JSON.parse(allSubsRaw);
          if (Array.isArray(allSubs)) {
            const filtered = allSubs.filter((s: any) => {
              if (!s) return false;
              const isCodeMatch = isMatchingStudentCode(normCode, s, s.id);
              if (!isCodeMatch) return true;
              const itemTargetId =
                s.assignmentId || s.targetId || s.examId || s.assignment?.id || s.exam?.id || s.id || '';
              return !matchesTargetAssignment(itemTargetId);
            });
            localStorage.setItem(globalKey, JSON.stringify(filtered));
          }
        } catch {}
      }
    }

    // 3. Quét toàn bộ các key lưu bài làm của học sinh trong localStorage
    const keysToInspect: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keysToInspect.push(k);
    }

    for (const k of keysToInspect) {
      if (
        k.startsWith('eduplay_k4_student_submissions_') ||
        k.startsWith('eduplay_k4_student_exam_subs_') ||
        k.startsWith('eduplay_k4_student_exam_submissions_')
      ) {
        const keySuffix = k
          .replace(/^eduplay_k4_student_submissions_/, '')
          .replace(/^eduplay_k4_student_exam_subs_/, '')
          .replace(/^eduplay_k4_student_exam_submissions_/, '')
          .trim();
        const isKeyForStudent = isMatchingStudentCode(normCode, { studentCode: keySuffix }, keySuffix);

        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter((item: any) => {
              if (!item) return false;
              const isCodeMatch = isKeyForStudent || isMatchingStudentCode(normCode, item, item.id);
              if (!isCodeMatch) return true;
              const itemAssignId =
                item.assignmentId ||
                item.targetId ||
                item.examId ||
                item.assignment?.id ||
                item.exam?.id ||
                item.id ||
                '';
              return !matchesTargetAssignment(itemAssignId);
            });
            localStorage.setItem(k, JSON.stringify(cleaned));
          }
        } catch {}
      }
    }
  } catch (lsErr) {
    console.warn('Lỗi dọn LocalStorage khi xóa bài nộp:', lsErr);
  }
}

/**
 * Xóa một bài nộp chưa khớp (orphaned/unmatched submission) cụ thể trên Firestore
 */
export async function deleteSingleUnmatchedSubmission(
  examId: string,
  submissionDocId: string,
  rawStudentCode?: string
): Promise<boolean> {
  if (!db || !examId || !submissionDocId) return false;

  try {
    try {
      const snap = await getDoc(doc(db, 'exams', examId, 'submissions', submissionDocId));
      if (snap.exists()) {
        await backupSubmissionBeforeDelete(examId, submissionDocId, snap.data(), 'single_unmatched_delete');
      }
    } catch (bErr) {
      console.warn('Lỗi sao lưu trước khi xóa đơn:', bErr);
    }

    await deleteDoc(doc(db, 'exams', examId, 'submissions', submissionDocId));

    const masterRef = doc(db, 'exams', examId);
    const snap = await getDoc(masterRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.submissions)) {
        const filtered = data.submissions.filter((s: any) => {
          if (s.id === submissionDocId) return false;
          if (rawStudentCode && isMatchingStudentCode(rawStudentCode, s, s.id)) return false;
          return true;
        });
        await updateDoc(masterRef, {
          submissions: filtered,
          updatedAt: new Date().toISOString()
        });
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
      window.dispatchEvent(new Event('storage'));
    }

    return true;
  } catch (err) {
    console.error('Lỗi khi xóa bài nộp chưa khớp:', err);
    throw err;
  }
}

/**
 * Dọn dẹp hàng loạt toàn bộ bài nộp chưa khớp (không thuộc danh sách lớp)
 */
export async function cleanAllUnmatchedExamSubmissions(
  examId: string,
  validRosterCodes: string[],
  additionalExamIds?: string[]
): Promise<{ deletedCount: number }> {
  if (!db || !examId) return { deletedCount: 0 };

  const validSet = new Set(validRosterCodes.map(c => normalizeStudentCode(c)));
  const allExamIds = Array.from(new Set([examId, ...(additionalExamIds || [])].filter(Boolean) as string[]));
  let totalDeleted = 0;

  for (const exId of allExamIds) {
    try {
      const subColRef = collection(db, 'exams', exId, 'submissions');
      const subSnap = await getDocs(subColRef);

      const deletePromises: Promise<any>[] = [];
      subSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const code = extractCleanStudentCode(data, docSnap.id);
        if (!validSet.has(code)) {
          deletePromises.push(
            (async () => {
              await backupSubmissionBeforeDelete(exId, docSnap.id, data, 'clean_all_unmatched');
              await deleteDoc(doc(db, 'exams', exId, 'submissions', docSnap.id));
              totalDeleted++;
            })().catch(() => {})
          );
        }
      });

      await Promise.all(deletePromises);

      const masterRef = doc(db, 'exams', exId);
      const masterSnap = await getDoc(masterRef);
      if (masterSnap.exists()) {
        const data = masterSnap.data();
        if (Array.isArray(data.submissions)) {
          const filtered = data.submissions.filter((s: any) => {
            const code = extractCleanStudentCode(s, s?.id);
            return validSet.has(code);
          });
          await updateDoc(masterRef, {
            submissions: filtered,
            updatedAt: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      console.error(`Lỗi khi dọn dẹp submissions cho ${exId}:`, err);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const allRaw = localStorage.getItem('eduplay_k4_all_exam_submissions');
      if (allRaw) {
        const parsed = JSON.parse(allRaw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((item: any) => {
            const code = extractCleanStudentCode(item, item?.id);
            const isMatchExam = allExamIds.some(id => String(item.examId || '').includes(id));
            if (isMatchExam && !validSet.has(code)) return false;
            return true;
          });
          localStorage.setItem('eduplay_k4_all_exam_submissions', JSON.stringify(cleaned));
        }
      }
      for (const exId of allExamIds) {
        localStorage.removeItem(`eduplay_k4_exam_subs_${exId}`);
      }
    } catch {}
    try {
      invalidateAllSubmissionsCache();
    } catch {}
    window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
    window.dispatchEvent(new Event('storage'));
  }

  return { deletedCount: totalDeleted };
}

export interface ResetAssignmentSubmissionOptions {
  studentCode: string;
  studentName?: string;
  studentId?: string;
  assignmentId: string;
  originalAssignmentId?: string;
  targetClass?: string;
  title?: string;
}

/**
 * Xóa triệt để và đồng bộ toàn bộ dữ liệu bài làm của học sinh cho bài tập rèn luyện trên Firestore & LocalStorage
 * DUY NHẤT theo Mã học sinh (studentCode viết hoa, trim khoảng trắng), TUYỆT ĐỐI KHÔNG phụ thuộc tên học sinh.
 */
export async function resetOrDeleteStudentAssignmentSubmission(
  options: ResetAssignmentSubmissionOptions
): Promise<{ success: boolean; deletedCount: number }> {
  const { studentCode, studentId, assignmentId, originalAssignmentId, targetClass, title } = options;
  const rawInputCode = String(studentCode || studentId || '').trim();
  const normCode = (
    extractCleanStudentCode({ studentCode: rawInputCode }, rawInputCode) ||
    normalizeStudentCode(rawInputCode)
  )
    .trim()
    .toUpperCase();

  if (!normCode) {
    throw new Error('Mã học sinh không hợp lệ.');
  }
  if (!assignmentId) {
    throw new Error('Mã bài tập không hợp lệ.');
  }

  const candDocIds = getCandidateAssignmentIds({
    id: assignmentId,
    originalAssignmentId,
    targetClass
  });

  let deletedCount = 0;

  if (db) {
    // 1. Xóa trong assignments/{docId}/submissions, assignments/{docId}, exams/{docId}/submissions, exams/{docId}
    for (const docId of candDocIds) {
      // 1A. Subcollection assignments/{docId}/submissions
      try {
        const subColRef = collection(db, 'assignments', docId, 'submissions');
        const subSnap = await getDocs(subColRef);

        const deletePromises: Promise<any>[] = [];
        subSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (isMatchingStudentCode(normCode, data, docSnap.id)) {
            deletePromises.push(
              deleteDoc(doc(db, 'assignments', docId, 'submissions', docSnap.id))
                .then(() => { deletedCount++; })
                .catch(() => {})
            );
          }
        });

        // Xóa trực tiếp các docId cố định
        deletePromises.push(deleteDoc(doc(db, 'assignments', docId, 'submissions', normCode)).catch(() => {}));
        deletePromises.push(deleteDoc(doc(db, 'assignments', docId, 'submissions', normCode.toLowerCase())).catch(() => {}));
        deletePromises.push(deleteDoc(doc(db, 'assignments', docId, 'submissions', `${normCode}_${docId}`)).catch(() => {}));
        deletePromises.push(deleteDoc(doc(db, 'assignments', docId, 'submissions', `${normCode}_${docId}_1`)).catch(() => {}));
        deletePromises.push(deleteDoc(doc(db, 'assignments', docId, 'submissions', `sub-${docId}-${normCode}`)).catch(() => {}));

        await Promise.allSettled(deletePromises);
      } catch (subErr) {
        console.warn(`Lỗi xóa subcollection assignments/${docId}/submissions:`, subErr);
      }

      // 1B. Master document assignments/{docId}
      try {
        const masterRef = doc(db, 'assignments', docId);
        const masterSnap = await getDoc(masterRef);
        if (masterSnap.exists()) {
          const masterData = masterSnap.data() || {};
          let shouldUpdateMaster = false;
          const updateMasterPayload: Record<string, any> = {
            updatedAt: new Date().toISOString()
          };

          if (Array.isArray(masterData.submissions)) {
            const filteredSubs = masterData.submissions.filter((s: any) => {
              if (!s) return false;
              return !isMatchingStudentCode(normCode, s, s.id);
            });
            if (filteredSubs.length !== masterData.submissions.length) {
              shouldUpdateMaster = true;
              deletedCount++;
            }
            const uniqueStudentCodes = Array.from(
              new Set(
                filteredSubs
                  .map((s: any) => extractCleanStudentCode(s, s?.id))
                  .filter(Boolean)
              )
            );
            updateMasterPayload.submissions = filteredSubs;
            updateMasterPayload.submittedIds = uniqueStudentCodes;
            updateMasterPayload.completedCount = uniqueStudentCodes.length;
            updateMasterPayload.submittedCount = uniqueStudentCodes.length;
          } else if (Array.isArray(masterData.submittedIds)) {
            const filteredIds = masterData.submittedIds.filter(
              (id: any) => !isMatchingStudentCode(normCode, { studentCode: String(id || '') }, String(id || ''))
            );
            if (filteredIds.length !== masterData.submittedIds.length) {
              shouldUpdateMaster = true;
              updateMasterPayload.submittedIds = filteredIds;
              updateMasterPayload.completedCount = filteredIds.length;
              updateMasterPayload.submittedCount = filteredIds.length;
            }
          }

          if (shouldUpdateMaster) {
            await updateDoc(masterRef, updateMasterPayload).catch((uErr) => {
              console.warn(`Lỗi cập nhật master doc assignments/${docId}:`, uErr);
            });
          }
        }
      } catch (masterErr) {
        console.warn(`Lỗi đọc/cập nhật assignments/${docId}:`, masterErr);
      }

      // 1C. Subcollection exams/{docId}/submissions & master doc exams/{docId} (do StudentExamModule lưu song song)
      try {
        const exSubColRef = collection(db, 'exams', docId, 'submissions');
        const exSubSnap = await getDocs(exSubColRef);
        const exDeletePromises: Promise<any>[] = [];

        exSubSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (isMatchingStudentCode(normCode, data, docSnap.id)) {
            exDeletePromises.push(
              deleteDoc(doc(db, 'exams', docId, 'submissions', docSnap.id))
                .then(() => { deletedCount++; })
                .catch(() => {})
            );
          }
        });

        exDeletePromises.push(deleteDoc(doc(db, 'exams', docId, 'submissions', normCode)).catch(() => {}));
        exDeletePromises.push(deleteDoc(doc(db, 'exams', docId, 'submissions', `${normCode}_${docId}`)).catch(() => {}));
        exDeletePromises.push(deleteDoc(doc(db, 'exams', docId, 'submissions', `${normCode}_${docId}_1`)).catch(() => {}));
        exDeletePromises.push(deleteDoc(doc(db, 'exams', docId, 'submissions', `sub-${docId}-${normCode}`)).catch(() => {}));

        await Promise.allSettled(exDeletePromises);

        const exMasterRef = doc(db, 'exams', docId);
        const exMasterSnap = await getDoc(exMasterRef);
        if (exMasterSnap.exists()) {
          const exData = exMasterSnap.data() || {};
          if (Array.isArray(exData.submissions)) {
            const filteredExSubs = exData.submissions.filter((s: any) => {
              if (!s) return false;
              return !isMatchingStudentCode(normCode, s, s.id);
            });
            if (filteredExSubs.length !== exData.submissions.length) {
              await updateDoc(exMasterRef, {
                submissions: filteredExSubs,
                updatedAt: new Date().toISOString()
              }).catch(() => {});
            }
          }
        }
      } catch {}

      // 1D. Xóa bản nháp exam_drafts và exam_progress nếu có
      await deleteExamDraft(normCode, docId).catch(() => {});
      try {
        await deleteDoc(doc(db, 'exam_drafts', `${normCode}_${docId}`));
      } catch {}
      try {
        await deleteDoc(doc(db, 'exam_progress', `${normCode}_${docId}`));
      } catch {}
    }

    // 2. Xóa toàn diện trong collection `student_results` theo `studentCode` & `targetId` / `assignmentId`
    try {
      const srDeleted = await studentResultService.deleteAssignmentSubmissionByStudentCode(normCode, {
        id: assignmentId,
        originalAssignmentId,
        targetClass,
        title
      });
      deletedCount += srDeleted;
    } catch (srErr) {
      console.warn('Lỗi xóa trong student_results:', srErr);
    }
  }

  // 3. Dọn sạch LocalStorage cho mã học sinh và bài tập này
  cleanLocalStorageSubmissionsForStudent(normCode, [rawInputCode, studentId, studentCode], candDocIds);

  // 4. Xóa cache bộ nhớ và IndexedDB của bảng theo dõi nộp bài
  try {
    invalidateAllSubmissionsCache();
    clearMemoryTrackingData();
    await clearIndexedDBTrackingData();
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eduplay_student_submissions_updated'));
    window.dispatchEvent(new Event('eduplay_exam_submissions_updated'));
    window.dispatchEvent(new Event('eduplay_assignments_updated'));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('eduplay_submission_reset', {
      detail: {
        studentCode: normCode,
        assignmentId,
        candDocIds
      }
    }));
  }

  return { success: true, deletedCount };
}

