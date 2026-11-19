export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const UNLIMITED_LABELS = new Set([
  '',
  'vô thời hạn',
  'vo thoi han',
  'không giới hạn',
  'khong gioi han',
  'không giới hạn thời gian',
  'khong gioi han thoi gian',
  'unlimited',
  'none',
  'null',
  'undefined',
  '-',
]);

export interface VietnamDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
}

export function isUnlimitedDeadline(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
    return UNLIMITED_LABELS.has(normalized);
  }
  return false;
}

/**
 * Construct a Date from Vietnam (Asia/Ho_Chi_Minh, UTC+7) calendar components
 * and verify no calendar overflow occurred (e.g. Feb 30 -> Mar 2).
 */
export function buildVietnamDate(
  year: number,
  month1To12: number,
  day: number,
  hour24: number = 0,
  minute: number = 0,
  second: number = 0
): Date | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month1To12) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour24) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  ) {
    return null;
  }
  if (
    year < 1970 ||
    year > 2100 ||
    month1To12 < 1 ||
    month1To12 > 12 ||
    day < 1 ||
    day > 31 ||
    hour24 < 0 ||
    hour24 > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const yyyy = String(year).padStart(4, '0');
  const mm = String(month1To12).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour24).padStart(2, '0');
  const min = String(minute).padStart(2, '0');
  const ss = String(second).padStart(2, '0');

  const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+07:00`);
  if (isNaN(d.getTime())) return null;

  // Verify no day/month rollover occurred in Asia/Ho_Chi_Minh
  const parts = getVietnamDateParts(d);
  if (
    parts.year !== year ||
    parts.month !== month1To12 ||
    parts.day !== day ||
    parts.hour !== hour24 ||
    parts.minute !== minute
  ) {
    return null;
  }

  return d;
}

export function getVietnamDateParts(date: Date): VietnamDateParts {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = parseInt(p.value, 10);
    }
  }
  const hour = map.hour === 24 ? 0 : (map.hour || 0);
  return {
    year: map.year || date.getUTCFullYear(),
    month: map.month || date.getUTCMonth() + 1,
    day: map.day || date.getUTCDate(),
    hour,
    minute: map.minute || 0,
    second: map.second || 0,
  };
}

export interface ParseDateOptions {
  defaultEndOfDay?: boolean;
  /**
   * When parsing slash dates with AM/PM where both p1 <= 12 and p2 <= 12,
   * prefer DD/MM unless false (legacy US picker wrote MM/DD/YYYY hh:mm AM/PM).
   */
  preferDayFirst?: boolean;
  silent?: boolean;
}

/**
 * Safely parse Firestore Timestamp, Date, epoch ms, ISO 8601, or legacy Vietnamese/US date strings.
 * NEVER passes slash-formatted DD/MM/YYYY strings directly to `new Date(str)`.
 */
export function parseFirestoreDate(
  value: unknown,
  options: ParseDateOptions = {}
): Date | null {
  const { defaultEndOfDay = false, preferDayFirst = true, silent = false } = options;

  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    if (typeof obj.toDate === 'function') {
      try {
        const d = obj.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    if (typeof obj.seconds === 'number') {
      const ms = obj.seconds * 1000 + Math.floor((obj.nanoseconds || 0) / 1e6);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    if (!silent) {
      console.warn('[dateTimeUtils] Unsupported date object:', value);
    }
    return null;
  }

  if (typeof value !== 'string') {
    if (!silent) {
      console.warn('[dateTimeUtils] Unsupported date type:', typeof value, value);
    }
    return null;
  }

  const raw = value.trim();
  if (isUnlimitedDeadline(raw)) return null;

  // 1. ISO 8601 (e.g. "2026-12-03T23:59:00+07:00", "2026-12-03T16:59:00.000Z", "2026-12-03T23:59", "2026-12-03")
  const isoMatch = raw.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?$/i
  );
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    const hasTime = isoMatch[4] !== undefined;
    const hasZone = isoMatch[8] !== undefined;

    if (hasZone) {
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) return parsed;
    } else {
      const h = hasTime ? parseInt(isoMatch[4], 10) : (defaultEndOfDay ? 23 : 0);
      const min = hasTime ? parseInt(isoMatch[5], 10) : (defaultEndOfDay ? 59 : 0);
      const sec = isoMatch[6] ? parseInt(isoMatch[6], 10) : (defaultEndOfDay && !hasTime ? 59 : 0);
      const vnDate = buildVietnamDate(y, m, d, h, min, sec);
      if (vnDate) return vnDate;
    }
  }

  // 2. Time-first Vietnamese format: "HH:mm[:ss] - DD/MM/YYYY" or "HH:mm DD/MM/YYYY"
  const timeFirstMatch = raw.match(
    /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(?:[-–]\s*|\s+)(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/
  );
  if (timeFirstMatch) {
    const h = parseInt(timeFirstMatch[1], 10);
    const min = parseInt(timeFirstMatch[2], 10);
    const sec = timeFirstMatch[3] ? parseInt(timeFirstMatch[3], 10) : 0;
    const d = parseInt(timeFirstMatch[4], 10);
    const m = parseInt(timeFirstMatch[5], 10);
    const y = parseInt(timeFirstMatch[6], 10);
    const vnDate = buildVietnamDate(y, m, d, h, min, sec);
    if (vnDate) return vnDate;
  }

  // 3. Slash/dash date-first format: "DD/MM/YYYY [HH:mm[:ss]] [AM/PM]" or legacy US "MM/DD/YYYY hh:mm AM/PM"
  const slashMatch = raw.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(AM|PM))?)?$/i
  );
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    const y = parseInt(slashMatch[3], 10);
    const hasTime = slashMatch[4] !== undefined;
    let h = hasTime ? parseInt(slashMatch[4], 10) : (defaultEndOfDay ? 23 : 0);
    const min = hasTime ? parseInt(slashMatch[5], 10) : (defaultEndOfDay ? 59 : 0);
    const sec = slashMatch[6] ? parseInt(slashMatch[6], 10) : (defaultEndOfDay && !hasTime ? 59 : 0);
    const ampm = slashMatch[7] ? slashMatch[7].toUpperCase() : null;

    if (ampm) {
      if (h > 12) {
        // Invalid 12-hour value with AM/PM marker — treat hour as 24h safely
      } else if (ampm === 'PM' && h < 12) {
        h += 12;
      } else if (ampm === 'AM' && h === 12) {
        h = 0;
      }
    }

    let day = p1;
    let month = p2;
    if (p1 <= 12 && p2 > 12) {
      // Unambiguously MM/DD/YYYY (e.g. 10/30/2026)
      month = p1;
      day = p2;
    } else if (p1 > 12 && p2 <= 12) {
      // Unambiguously DD/MM/YYYY (e.g. 18/11/2026)
      day = p1;
      month = p2;
    } else if (ampm && !preferDayFirst) {
      // Legacy DateTimePicker format="MM/DD/YYYY hh:mm A" always emitted AM/PM in MM/DD order
      month = p1;
      day = p2;
    } else if (!ampm) {
      // Vietnamese DD/MM/YYYY convention
      day = p1;
      month = p2;
    } else {
      // Ambiguous with AM/PM and preferDayFirst === false handled above; default DD/MM
      day = p1;
      month = p2;
    }

    const vnDate = buildVietnamDate(y, month, day, h, min, sec);
    if (vnDate) return vnDate;
  }

  if (!silent) {
    console.warn('[dateTimeUtils] Unparseable date string (treating as null / not expired):', raw);
  }
  return null;
}

/**
 * Convert Date or valid date input to canonical ISO 8601 string in Vietnam timezone (+07:00),
 * e.g. "2026-12-03T23:59:00+07:00". Returns "" for null/unlimited.
 */
export function toIsoDateTimeString(value: unknown): string {
  if (isUnlimitedDeadline(value)) return '';
  const d = parseFirestoreDate(value, { preferDayFirst: false });
  if (!d) return '';
  const parts = getVietnamDateParts(d);
  const yyyy = String(parts.year).padStart(4, '0');
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  const hh = String(parts.hour).padStart(2, '0');
  const min = String(parts.minute).padStart(2, '0');
  const ss = String(parts.second).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+07:00`;
}

/**
 * Single shared display formatter across the whole app:
 * strictly DD/MM/YYYY HH:mm (24h, Asia/Ho_Chi_Minh, never AM/PM).
 */
export function formatDateTimeVN(
  value: unknown,
  fallback: string = 'Không giới hạn thời gian'
): string {
  if (isUnlimitedDeadline(value)) return fallback;
  const d = parseFirestoreDate(value, { preferDayFirst: false });
  if (!d) {
    return fallback;
  }
  const parts = getVietnamDateParts(d);
  const dd = String(parts.day).padStart(2, '0');
  const mm = String(parts.month).padStart(2, '0');
  const yyyy = String(parts.year).padStart(4, '0');
  const hh = String(parts.hour).padStart(2, '0');
  const min = String(parts.minute).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export type ScheduleStatusCode = 'upcoming' | 'open' | 'expired' | 'completed';

export interface ScheduleStatusInput {
  startTime?: unknown;
  dueDate?: unknown;
  isUnlimited?: boolean;
  isDone?: boolean;
  now?: Date;
}

export interface ScheduleStatusResult {
  status: ScheduleStatusCode;
  badgeLabel: string;
  deadlineText: string;
  startText: string;
  countdownText: string | null;
  isNearDeadline: boolean;
  isUnlimited: boolean;
  isExpired: boolean;
  isUpcoming: boolean;
  hadInvalidDueDate: boolean;
  hadInvalidStartTime: boolean;
  startDate: Date | null;
  dueDate: Date | null;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function getScheduleStatus(input: ScheduleStatusInput): ScheduleStatusResult {
  const now = input.now || new Date();
  const nowMs = now.getTime();

  const hasRawStart = !isUnlimitedDeadline(input.startTime);
  const startDate = hasRawStart
    ? parseFirestoreDate(input.startTime, { preferDayFirst: false })
    : null;
  const hadInvalidStartTime = hasRawStart && startDate === null;
  if (hadInvalidStartTime) {
    console.warn('[dateTimeUtils] Invalid startTime value (ignored):', input.startTime);
  }

  const explicitlyUnlimited = input.isUnlimited === true || isUnlimitedDeadline(input.dueDate);
  const hasRawDue = !explicitlyUnlimited;
  const dueDate = hasRawDue
    ? parseFirestoreDate(input.dueDate, { defaultEndOfDay: true, preferDayFirst: false })
    : null;
  const hadInvalidDueDate = hasRawDue && dueDate === null;
  if (hadInvalidDueDate) {
    console.warn(
      '[dateTimeUtils] Invalid dueDate value — treating as NOT expired so students are not locked out:',
      input.dueDate
    );
  }

  const isUnlimited = explicitlyUnlimited || dueDate === null;

  let status: ScheduleStatusCode = 'open';
  let badgeLabel = 'Đang mở';
  let isUpcoming = false;
  let isExpired = false;

  if (input.isDone) {
    status = 'completed';
    badgeLabel = 'Đã hoàn thành';
  } else if (startDate && nowMs < startDate.getTime()) {
    status = 'upcoming';
    badgeLabel = 'Chưa mở';
    isUpcoming = true;
  } else if (dueDate && nowMs > dueDate.getTime()) {
    status = 'expired';
    badgeLabel = 'Đã hết hạn';
    isExpired = true;
  } else {
    status = 'open';
    badgeLabel = 'Đang mở';
  }

  const startText = startDate ? `Mở: ${formatDateTimeVN(startDate)}` : '';
  const deadlineText = dueDate
    ? `Hạn: ${formatDateTimeVN(dueDate)}`
    : hadInvalidDueDate
      ? 'Không xác định hạn (Đang mở)'
      : 'Không giới hạn thời gian';

  let countdownText: string | null = null;
  let isNearDeadline = false;

  if (status === 'open' && dueDate) {
    const remainingMs = dueDate.getTime() - nowMs;
    if (remainingMs > 0 && remainingMs < TWENTY_FOUR_HOURS_MS) {
      isNearDeadline = true;
      const totalMinutes = Math.max(1, Math.floor(remainingMs / 60000));
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      countdownText = hours > 0 ? `Còn ${hours} giờ ${mins} phút` : `Còn ${mins} phút`;
    }
  }

  return {
    status,
    badgeLabel,
    deadlineText,
    startText,
    countdownText,
    isNearDeadline,
    isUnlimited,
    isExpired,
    isUpcoming,
    hadInvalidDueDate,
    hadInvalidStartTime,
    startDate,
    dueDate,
  };
}
