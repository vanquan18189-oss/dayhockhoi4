/**
 * Tiện ích quản lý và chuẩn hóa Mã học sinh duy nhất theo định dạng chuẩn: Lớp-NămHọc-STT (Ví dụ: 5D26-27-1)
 * Quy tắc: Khóa duy nhất của học sinh là Mã HS dạng 5D26-27-1 (lớp, năm học, số thứ tự). 
 * Không dùng sddcn, studentId cũ, tên hay mã khác.
 */

export interface ParsedStudentCode {
  className: string;      // e.g. "5D"
  academicYear: string;   // e.g. "2026-2027" (represented as "26-27")
  stt: number;            // e.g. 1
  raw: string;            // normalized raw string
}

/**
 * Chuẩn hóa mã học sinh: loại bỏ toàn bộ khoảng trắng thừa, chuẩn hóa dấu gạch ngang, viết hoa toàn bộ.
 * Ví dụ: " 5c 26-27-36 " -> "5C26-27-36", "5c_26_27_36" -> "5C26-27-36"
 */
export function normalizeStudentCode(code?: string): string {
  if (!code || typeof code !== 'string') return '';
  return code
    .replace(/[–—−_]/g, '-')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Lấy tiền tố Mã HS chuẩn theo mã lớp và năm học (ví dụ: "Lớp 3D" -> "3D26-27-", "4C" -> "4C26-27-")
 */
export function getClassCodePrefix(classCode?: string, academicYear: string = '2026-2027'): string {
  const cleanClass = (classCode || '4C').replace(/^Lớp\s*/i, '').replace(/\s+/g, '').trim().toUpperCase() || '4C';
  let yearCode = '26-27';
  if (academicYear.includes('26-27') || academicYear.includes('2026')) {
    yearCode = '26-27';
  } else if (academicYear.includes('-')) {
    const parts = academicYear.split('-');
    if (parts.length === 2) {
      const y1 = parts[0].trim().slice(-2);
      const y2 = parts[1].trim().slice(-2);
      if (y1 && y2) yearCode = `${y1}-${y2}`;
    }
  }
  return `${cleanClass}${yearCode}-`;
}

/**
 * Chuẩn hóa họ tên học sinh: bỏ dấu tiếng Việt, bỏ khoảng trắng thừa, chuyển về chữ thường để so khớp chính xác.
 * Ví dụ: "  TRẦN   MINH  ĐỨC  " -> "tran minh duc", "Trần Minh Đức" -> "tran minh duc"
 */
export function normalizeStudentName(name?: string): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Kiểm tra mã học sinh có hợp lệ theo định dạng chuẩn hay không.
 * Định dạng mẫu: ^[A-Z0-9]+\d{2}-\d{2}-\d+$ (Ví dụ: 5D26-27-1, 3C26-27-12, 5C26-27-36)
 */
export function isValidStudentCode(code?: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const normalized = normalizeStudentCode(code);
  const regex = /^[A-Z0-9]+\d{2}-\d{2}-\d+$/;
  return regex.test(normalized);
}

/**
 * Tạo mã học sinh mới dựa trên lớp, năm học và số thứ tự lớn nhất hiện có + 1.
 * Đảm bảo không dùng lại số cũ (Mã HS bất biến).
 */
export function generateStudentCode(className: string, academicYear: string = '2026-2027', existingStts: number[] = []): { code: string; stt: number } {
  const prefix = getClassCodePrefix(className, academicYear);

  // Tính số thứ tự tiếp theo (lớn nhất + 1, tránh trùng lặp, không bao giờ cấp lại số cũ)
  let nextStt = 1;
  if (Array.isArray(existingStts) && existingStts.length > 0) {
    const validNums = existingStts.filter(n => typeof n === 'number' && !isNaN(n) && n > 0 && n < 10000);
    if (validNums.length > 0) {
      const maxStt = Math.max(...validNums);
      nextStt = maxStt >= 1 ? maxStt + 1 : 1;
    }
  }

  const code = `${prefix}${nextStt}`;
  return { code, stt: nextStt };
}

/**
 * Đọc và tách mã học sinh thành các thành phần: lớp, năm học, số thứ tự.
 */
export function parseStudentCode(code?: string): ParsedStudentCode | null {
  if (!isValidStudentCode(code)) return null;
  const normalized = normalizeStudentCode(code);

  // Ví dụ: 5D26-27-1 -> className: 5D, academicYear: 26-27, stt: 1
  const match = normalized.match(/^([A-Z0-9]+)(\d{2}-\d{2})-(\d+)$/);
  if (!match) return null;

  return {
    className: match[1],
    academicYear: match[2],
    stt: parseInt(match[3], 10),
    raw: normalized
  };
}

/**
 * Chuẩn hóa mọi biến thể của Mã học sinh về dạng chuẩn duy nhất Lớp-NămHọc-STT (ví dụ: 3C26-27-1, 5D26-27-12)
 */
export function formatStandardStudentCode(rawCode?: string, defaultClass: string = '4A', stt?: number): string {
  const cleanCls = (defaultClass || '4A').replace(/^Lớp\s*/i, '').replace(/\s+/g, '').trim().toUpperCase() || '4A';
  if (!rawCode && !stt) {
    return `${cleanCls}26-27-1`;
  }
  const clean = normalizeStudentCode(rawCode || '');
  if (/^[A-Z0-9]+\d{2}-\d{2}-\d+$/.test(clean)) {
    return clean;
  }
  // Nếu là dạng 4A1, 4a1, st-4a-1, hs-4a-1, 4a-1
  const legacyMatch = clean.match(/^(?:ST-|HS-)?([0-9][A-Z0-9]*)[-_]?(\d+)$/i);
  if (legacyMatch) {
    const cls = legacyMatch[1].toUpperCase();
    const num = parseInt(legacyMatch[2], 10);
    if (num > 0 && num < 10000) {
      return `${cls}26-27-${num}`;
    }
  }
  if (stt && typeof stt === 'number' && !isNaN(stt) && stt > 0) {
    return `${cleanCls}26-27-${stt}`;
  }
  // Check if clean has a trailing number in valid STT range (e.g. "st-temp-7", "user-22", "hs-7")
  const trailingNumMatch = clean.match(/(\d+)(?!.*\d)/);
  if (trailingNumMatch) {
    const num = parseInt(trailingNumMatch[1], 10);
    if (!isNaN(num) && num > 0 && num <= 500) {
      return `${cleanCls}26-27-${num}`;
    }
  }
  return clean || `${cleanCls}26-27-1`;
}

/**
 * Phân định loại bản ghi kết quả bài làm: 'exam' (Bài kiểm tra) hoặc 'assignment' (Bài tập rèn luyện)
 * - Nếu sub?.recordType có giá trị 'exam' hoặc 'assignment' thì trả về giá trị đó.
 * - Nếu không có thì suy ra: có examId thì 'exam', có assignmentId thì 'assignment', còn lại trả về 'assignment'.
 * - Dùng optional chaining, không ném lỗi.
 */
export function getRecordType(sub: any): 'exam' | 'assignment' {
  try {
    if (sub?.recordType === 'exam' || sub?.recordType === 'assignment') {
      return sub.recordType;
    }
    if (sub?.examId) {
      return 'exam';
    }
    if (sub?.assignmentId) {
      return 'assignment';
    }
    // Hỗ trợ thêm trường hợp đối tượng lồng hoặc type/title nếu không có id trực tiếp
    if (sub?.exam || sub?.type === 'exam' || sub?.submissionType === 'exam') {
      return 'exam';
    }
    return 'assignment';
  } catch {
    return 'assignment';
  }
}

/**
 * Trích xuất mã học sinh đầy đủ chuẩn hóa từ đối tượng hoặc chuỗi bất kỳ
 */
export function extractFullStudentCode(raw: any, defaultClass: string = '4C'): string {
  if (!raw) return '';
  if (typeof raw === 'string') {
    return formatStandardStudentCode(raw, defaultClass);
  }
  const codeCandidate =
    raw.studentCode ||
    raw.maHs ||
    raw.code ||
    raw.studentId ||
    raw.sddcn ||
    raw.id ||
    '';
  const clsCandidate = raw.className || raw.targetClass || defaultClass || '4C';
  return formatStandardStudentCode(String(codeCandidate), String(clsCandidate), raw.stt);
}

/**
 * So sánh 2 bản ghi hoặc mã học sinh xem có phải cùng 1 học sinh không (dựa trên studentCode duy nhất)
 */
export function isSameStudent(a: any, b: any, defaultClass: string = '4C'): boolean {
  if (!a || !b) return false;
  const codeA = normalizeStudentCode(extractFullStudentCode(a, defaultClass));
  const codeB = normalizeStudentCode(extractFullStudentCode(b, defaultClass));
  if (codeA && codeB && codeA === codeB) return true;
  return false;
}




