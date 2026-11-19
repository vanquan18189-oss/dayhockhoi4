import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  formatDateTimeVN,
  isUnlimitedDeadline,
  parseFirestoreDate,
  toIsoDateTimeString,
} from '../utils/dateTimeUtils';

export type AuditCollectionName = 'assignments' | 'exams' | 'assigned_elearning';

export type DeadlineIssueCode =
  | 'string_format'
  | 'suspected_swapped_date'
  | 'deadline_before_start'
  | 'blank_or_invalid';

export interface DeadlineAuditRow {
  docId: string;
  collectionName: AuditCollectionName;
  typeLabel: string;
  title: string;
  targetClass: string;
  subject: string;
  grade: string;
  rawStartValue: unknown;
  rawDueValue: unknown;
  rawStartDisplay: string;
  rawDueDisplay: string;
  rawDueType: string;
  issues: DeadlineIssueCode[];
  issueDescriptions: string[];
  needsFix: boolean;
  suggestedStartIso: string;
  suggestedDueIso: string;
  suggestedUnlimited: boolean;
  suggestedDueDisplayVN: string;
  suggestedStartDisplayVN: string;
  rawDocSnapshot: Record<string, any>;
}

const BACKUP_STORAGE_KEY = 'eduplay_k4_deadline_audit_backups';

function describeRawValue(val: unknown): { display: string; typeName: string } {
  if (val === undefined) return { display: '(undefined)', typeName: 'undefined' };
  if (val === null) return { display: '(null)', typeName: 'null' };
  if (typeof val === 'string') return { display: val === '' ? '"" (trống)' : `"${val}"`, typeName: 'string' };
  if (typeof val === 'object' && typeof (val as any).toDate === 'function') {
    const d = (val as any).toDate();
    return { display: `Timestamp(${formatDateTimeVN(d)})`, typeName: 'Timestamp' };
  }
  if (typeof val === 'object' && typeof (val as any).seconds === 'number') {
    const d = new Date((val as any).seconds * 1000);
    return { display: `Timestamp(${formatDateTimeVN(d)})`, typeName: 'Timestamp' };
  }
  return { display: String(val), typeName: typeof val };
}

function isCanonicalIsoString(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(val.trim());
}

function isFirestoreTimestampLike(val: unknown): boolean {
  if (!val || typeof val !== 'object') return false;
  return typeof (val as any).toDate === 'function' || typeof (val as any).seconds === 'number';
}

function detectSlashAmbiguity(val: unknown): {
  isSlashString: boolean;
  isSuspectedSwap: boolean;
  hasAmPm: boolean;
} {
  if (typeof val !== 'string') return { isSlashString: false, isSuspectedSwap: false, hasAmPm: false };
  const s = val.trim();
  const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(AM|PM))?)?$/i);
  if (!match) return { isSlashString: false, isSuspectedSwap: false, hasAmPm: false };
  const p1 = parseInt(match[1], 10);
  const p2 = parseInt(match[2], 10);
  const hasAmPm = Boolean(match[7]);
  // Browser `new Date("03/12/2026...")` swaps DD/MM into MM/DD whenever p1 <= 12 && p2 <= 12,
  // or returns Invalid Date when p1 > 12 (e.g. "18/11/2026").
  const isSuspectedSwap = hasAmPm || (p1 <= 12 && p2 <= 12 && p1 !== p2) || p1 > 12;
  return { isSlashString: true, isSuspectedSwap, hasAmPm };
}

function analyzeDocument(
  collectionName: AuditCollectionName,
  docId: string,
  data: Record<string, any>
): DeadlineAuditRow {
  const isExam = collectionName === 'exams';
  const rawStartValue = isExam
    ? (data.startTime ?? data.assignmentDate ?? data.createdAt)
    : (data.startDate ?? data.startTime ?? data.assignedDate ?? data.createdAt);
  const rawDueValue = isExam
    ? (data.endTime ?? data.dueDate)
    : (data.dueDate ?? data.deadline);

  const rawStartMeta = describeRawValue(rawStartValue);
  const rawDueMeta = describeRawValue(rawDueValue);

  const parsedStart = !isUnlimitedDeadline(rawStartValue)
    ? parseFirestoreDate(rawStartValue, { preferDayFirst: false })
    : null;

  const isExplicitUnlimited =
    data.isUnlimited === true ||
    (typeof rawDueValue === 'string' &&
      ['vô thời hạn', 'không giới hạn', 'không giới hạn thời gian'].includes(rawDueValue.trim().toLowerCase()));

  const isBlankDue = rawDueValue === undefined || rawDueValue === null || (typeof rawDueValue === 'string' && rawDueValue.trim() === '');

  const parsedDue = !isExplicitUnlimited && !isBlankDue
    ? parseFirestoreDate(rawDueValue, { defaultEndOfDay: true, preferDayFirst: false })
    : null;

  const issues: DeadlineIssueCode[] = [];
  const issueDescriptions: string[] = [];

  // 1. Check string format vs ISO/Timestamp
  const dueIsCanonical =
    isExplicitUnlimited ||
    isFirestoreTimestampLike(rawDueValue) ||
    isCanonicalIsoString(rawDueValue);
  const startIsCanonical =
    rawStartValue === undefined ||
    rawStartValue === null ||
    isFirestoreTimestampLike(rawStartValue) ||
    isCanonicalIsoString(rawStartValue);

  if (!isBlankDue && !dueIsCanonical) {
    issues.push('string_format');
    issueDescriptions.push('Hạn nộp đang lưu dạng chuỗi thường, chưa chuẩn ISO 8601 / Timestamp');
  } else if (!startIsCanonical) {
    issues.push('string_format');
    issueDescriptions.push('Thời gian mở/giao bài chưa chuẩn ISO 8601 / Timestamp');
  }

  // 2. Check suspected DD/MM vs MM/DD swap
  const dueSlash = detectSlashAmbiguity(rawDueValue);
  const startSlash = detectSlashAmbiguity(rawStartValue);
  if (dueSlash.isSuspectedSwap || startSlash.isSuspectedSwap) {
    issues.push('suspected_swapped_date');
    if (dueSlash.hasAmPm || startSlash.hasAmPm) {
      issueDescriptions.push('Định dạng Mỹ MM/DD/YYYY AM/PM dễ gây nhầm ngày/tháng');
    } else {
      issueDescriptions.push('Chuỗi DD/MM/YYYY dễ bị trình duyệt đọc nhầm thành MM/DD/YYYY');
    }
  }

  // 3. Check blank or invalid deadline
  if ((isBlankDue && !isExplicitUnlimited) || (!isExplicitUnlimited && !isBlankDue && !parsedDue)) {
    issues.push('blank_or_invalid');
    issueDescriptions.push(
      isBlankDue
        ? 'Trống hạn nộp và chưa đánh dấu "Không giới hạn thời gian"'
        : 'Giá trị hạn nộp không hợp lệ / không đọc được'
    );
  }

  // 4. Check deadline before start/assigned date
  if (parsedStart && parsedDue && parsedDue.getTime() <= parsedStart.getTime()) {
    issues.push('deadline_before_start');
    issueDescriptions.push(
      `Hạn nộp (${formatDateTimeVN(parsedDue)}) nhỏ hơn hoặc bằng thời điểm mở/giao (${formatDateTimeVN(parsedStart)})`
    );
  }

  const suggestedUnlimited = isExplicitUnlimited || !parsedDue;
  const suggestedDueIso = suggestedUnlimited ? '' : toIsoDateTimeString(parsedDue);
  const suggestedStartIso = parsedStart ? toIsoDateTimeString(parsedStart) : '';

  const typeLabel =
    collectionName === 'exams'
      ? 'Đề kiểm tra'
      : collectionName === 'assigned_elearning'
        ? 'Bài giảng E-Learning'
        : 'Bài tập';

  return {
    docId,
    collectionName,
    typeLabel,
    title: data.title || data.lessonTitle || '(Chưa đặt tên)',
    targetClass: data.targetClass || (Array.isArray(data.targetClasses) ? data.targetClasses.join(', ') : '') || '-',
    subject: data.subject || '-',
    grade: data.grade || 'Khối 4',
    rawStartValue,
    rawDueValue,
    rawStartDisplay: rawStartMeta.display,
    rawDueDisplay: rawDueMeta.display,
    rawDueType: rawDueMeta.typeName,
    issues,
    issueDescriptions,
    needsFix: issues.length > 0,
    suggestedStartIso,
    suggestedDueIso,
    suggestedUnlimited,
    suggestedDueDisplayVN: suggestedUnlimited
      ? 'Không giới hạn thời gian'
      : formatDateTimeVN(parsedDue),
    suggestedStartDisplayVN: suggestedStartIso
      ? formatDateTimeVN(suggestedStartIso)
      : 'Mở ngay',
    rawDocSnapshot: data,
  };
}

/**
 * Scan all assignments, exams, and assigned_elearning documents in Firestore (READ-ONLY).
 */
export async function scanAllDeadlinesReadOnly(): Promise<DeadlineAuditRow[]> {
  const rows: DeadlineAuditRow[] = [];
  if (!db) {
    throw new Error('Kết nối Firestore chưa sẵn sàng.');
  }

  const collectionsToScan: AuditCollectionName[] = [
    'assignments',
    'exams',
    'assigned_elearning',
  ];

  for (const colName of collectionsToScan) {
    try {
      const snap = await getDocs(collection(db, colName));
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        rows.push(analyzeDocument(colName, docSnap.id, data));
      });
    } catch (err) {
      console.warn(`[deadlineAuditService] Không thể đọc collection ${colName}:`, err);
    }
  }

  // Sort problem rows first, then by title
  return rows.sort((a, b) => {
    if (a.needsFix !== b.needsFix) return a.needsFix ? -1 : 1;
    return a.title.localeCompare(b.title, 'vi');
  });
}

export interface DeadlineBackupEntry {
  backupId: string;
  createdAt: string;
  collectionName: AuditCollectionName;
  docId: string;
  title: string;
  originalData: Record<string, any>;
}

/**
 * Save an automatic JSON backup snapshot before modifying any Firestore document.
 */
export function createDeadlineBackupSnapshot(row: DeadlineAuditRow): DeadlineBackupEntry {
  const entry: DeadlineBackupEntry = {
    backupId: `bk-${Date.now()}-${row.docId}`,
    createdAt: new Date().toISOString(),
    collectionName: row.collectionName,
    docId: row.docId,
    title: row.title,
    originalData: row.rawDocSnapshot,
  };

  try {
    const existingRaw = localStorage.getItem(BACKUP_STORAGE_KEY);
    const existing: DeadlineBackupEntry[] = existingRaw ? JSON.parse(existingRaw) : [];
    const updated = [entry, ...existing].slice(0, 100);
    localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[deadlineAuditService] Không thể lưu bản sao lưu vào localStorage:', err);
  }

  return entry;
}

export function getSavedDeadlineBackups(): DeadlineBackupEntry[] {
  try {
    const raw = localStorage.getItem(BACKUP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function downloadDeadlineBackupJson(rowsOrBackups: unknown, filenamePrefix: string = 'backup-han-nop'): void {
  try {
    const json = JSON.stringify(rowsOrBackups, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn('[deadlineAuditService] Lỗi tải xuống tệp sao lưu:', err);
  }
}

/**
 * Apply confirmed deadline normalization to a single Firestore document,
 * strictly preserving submissions, student answers, scores, and questions.
 */
export async function applyConfirmedDeadlineFix(params: {
  row: DeadlineAuditRow;
  targetStartIso: string;
  targetDueIso: string;
  setUnlimited: boolean;
}): Promise<void> {
  if (!db) {
    throw new Error('Kết nối Firestore chưa sẵn sàng.');
  }

  const { row, targetStartIso, targetDueIso, setUnlimited } = params;

  // 1. Always create backup snapshot before writing
  createDeadlineBackupSnapshot(row);

  // 2. Build minimal patch touching ONLY schedule fields
  const patch: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  if (row.collectionName === 'exams') {
    if (targetStartIso) patch.startTime = targetStartIso;
    patch.endTime = setUnlimited ? '' : targetDueIso;
    patch.isUnlimited = setUnlimited;
  } else if (row.collectionName === 'assigned_elearning') {
    if (targetStartIso) patch.startDate = targetStartIso;
    patch.dueDate = setUnlimited ? '' : targetDueIso;
    patch.isUnlimited = setUnlimited;
  } else {
    if (targetStartIso) {
      patch.startDate = targetStartIso;
      patch.assignedDate = targetStartIso;
    }
    patch.dueDate = setUnlimited ? '' : targetDueIso;
    patch.isUnlimited = setUnlimited;
  }

  try {
    const docRef = doc(db, row.collectionName, row.docId);
    await setDoc(docRef, patch, { merge: true });

    // Also update localStorage cache if applicable so UI reflects immediately without stale cache
    if (row.collectionName === 'assignments') {
      try {
        const cachedRaw = localStorage.getItem('eduplay_k4_cached_assignments');
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (Array.isArray(parsed)) {
            const updated = parsed.map((item: any) =>
              item && item.id === row.docId ? { ...item, ...patch } : item
            );
            localStorage.setItem('eduplay_k4_cached_assignments', JSON.stringify(updated));
            window.dispatchEvent(
              new CustomEvent('eduplay_assignments_updated', {
                detail: { assignments: updated, timestamp: Date.now() },
              })
            );
          }
        }
      } catch {}
    } else if (row.collectionName === 'assigned_elearning') {
      try {
        const cachedRaw = localStorage.getItem('eduplay_k4_assigned_elearning_lessons');
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (Array.isArray(parsed)) {
            const updated = parsed.map((item: any) =>
              item && item.id === row.docId ? { ...item, ...patch } : item
            );
            localStorage.setItem('eduplay_k4_assigned_elearning_lessons', JSON.stringify(updated));
            window.dispatchEvent(
              new CustomEvent('eduplay_elearning_assigned_updated', { detail: updated })
            );
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error('[deadlineAuditService] Lỗi ghi chuẩn hóa hạn nộp:', err);
    throw err;
  }
}
