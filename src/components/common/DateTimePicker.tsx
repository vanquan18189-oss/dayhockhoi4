import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import {
  buildVietnamDate,
  formatDateTimeVN,
  getVietnamDateParts,
  isUnlimitedDeadline,
  parseFirestoreDate,
  toIsoDateTimeString,
} from '../../utils/dateTimeUtils';

interface DateTimePickerProps {
  value: Date | string | null | undefined;
  onChange?: (isoString: string) => void;
  onDateChange?: (date: Date | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Kept optional for backwards-compatible callers; display/storage is always 24h VN + ISO 8601 */
  format?: string;
  clearLabel?: string;
}

const MONTH_NAMES_VI = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_LIST = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 59];

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  value,
  onChange,
  onDateChange,
  placeholder = 'DD/MM/YYYY HH:mm (Hoặc để trống = Không giới hạn)',
  className = '',
  disabled = false,
  clearLabel = 'Không giới hạn',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsedValueDate = useMemo(() => {
    if (isUnlimitedDeadline(value)) return null;
    return parseFirestoreDate(value, { preferDayFirst: false, silent: true });
  }, [value]);

  const getInitialParts = (dateOrNull: Date | null) => {
    const base = dateOrNull || new Date();
    const parts = getVietnamDateParts(base);
    return {
      year: parts.year,
      month: parts.month - 1, // 0-indexed for calendar UI
      day: parts.day,
      hour24: dateOrNull ? parts.hour : 23,
      minute: dateOrNull ? parts.minute : 59,
    };
  };

  const initial = getInitialParts(parsedValueDate);
  const [selectedYear, setSelectedYear] = useState(initial.year);
  const [selectedMonth, setSelectedMonth] = useState(initial.month);
  const [selectedDay, setSelectedDay] = useState(initial.day);
  const [selectedHour24, setSelectedHour24] = useState(initial.hour24);
  const [selectedMinute, setSelectedMinute] = useState(initial.minute);

  useEffect(() => {
    const next = getInitialParts(parsedValueDate);
    setSelectedYear(next.year);
    setSelectedMonth(next.month);
    setSelectedDay(next.day);
    setSelectedHour24(next.hour24);
    setSelectedMinute(next.minute);
  }, [parsedValueDate]);

  // Close popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const emitSelection = (y: number, m0: number, d: number, h24: number, min: number) => {
    const dateObj = buildVietnamDate(y, m0 + 1, d, h24, min, 0);
    if (!dateObj) return;
    onDateChange?.(dateObj);
    onChange?.(toIsoDateTimeString(dateObj));
  };

  const handleSelectDay = (d: number, mOffset: number = 0) => {
    let newMonth = selectedMonth + mOffset;
    let newYear = selectedYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    setSelectedYear(newYear);
    setSelectedMonth(newMonth);
    setSelectedDay(d);
    emitSelection(newYear, newMonth, d, selectedHour24, selectedMinute);
  };

  const handleSelectHour24 = (h24: number) => {
    setSelectedHour24(h24);
    emitSelection(selectedYear, selectedMonth, selectedDay, h24, selectedMinute);
  };

  const handleSelectMinute = (min: number) => {
    setSelectedMinute(min);
    emitSelection(selectedYear, selectedMonth, selectedDay, selectedHour24, min);
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const handleToday = () => {
    const now = new Date();
    const parts = getVietnamDateParts(now);
    setSelectedYear(parts.year);
    setSelectedMonth(parts.month - 1);
    setSelectedDay(parts.day);
    setSelectedHour24(parts.hour);
    setSelectedMinute(parts.minute);
    emitSelection(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  };

  const handleClear = () => {
    onDateChange?.(null);
    onChange?.('');
    setIsOpen(false);
  };

  // Calendar grid calculations
  const firstDayOfMonth = new Date(Date.UTC(selectedYear, selectedMonth, 1)).getUTCDay();
  const daysInCurrentMonth = new Date(Date.UTC(selectedYear, selectedMonth + 1, 0)).getUTCDate();
  const daysInPrevMonth = new Date(Date.UTC(selectedYear, selectedMonth, 0)).getUTCDate();

  const prevMonthDays: number[] = [];
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    prevMonthDays.push(daysInPrevMonth - i);
  }

  const currentMonthDays: number[] = [];
  for (let i = 1; i <= daysInCurrentMonth; i++) {
    currentMonthDays.push(i);
  }

  const totalCells = prevMonthDays.length + currentMonthDays.length;
  const nextMonthDaysCount = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  const nextMonthDays: number[] = [];
  for (let i = 1; i <= nextMonthDaysCount; i++) {
    nextMonthDays.push(i);
  }

  const displayText = disabled
    ? 'Không giới hạn thời gian'
    : parsedValueDate
      ? formatDateTimeVN(parsedValueDate)
      : '';

  const minuteChoices = useMemo(() => {
    if (MINUTES_LIST.includes(selectedMinute)) return MINUTES_LIST;
    return [...MINUTES_LIST, selectedMinute].sort((a, b) => a - b);
  }, [selectedMinute]);

  return (
    <div ref={containerRef} className={`relative inline-block w-full ${className}`}>
      {/* Read-only Input Trigger */}
      <div
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl transition-colors shadow-2xs ${
          disabled
            ? 'opacity-60 cursor-not-allowed bg-slate-50'
            : 'cursor-pointer hover:border-indigo-500'
        } ${isOpen ? 'border-indigo-600 ring-2 ring-indigo-100' : ''}`}
      >
        <input
          type="text"
          readOnly
          value={displayText}
          placeholder={placeholder}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) setIsOpen(true);
          }}
          className={`w-full bg-transparent font-medium text-sm focus:outline-none ${
            disabled ? 'text-slate-500 cursor-not-allowed' : 'text-slate-800 cursor-pointer'
          }`}
        />
        {!disabled && parsedValueDate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
            title="Xóa thời hạn (Đặt không giới hạn)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) setIsOpen((prev) => !prev);
          }}
          className="p-1 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer shrink-0"
          title="Chọn ngày giờ (Giờ Việt Nam 24h)"
        >
          <CalendarIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Popover Calendar + 24h Time Picker */}
      {isOpen && !disabled && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 flex flex-col sm:flex-row gap-4 min-w-[330px] sm:min-w-[420px] animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Calendar Column */}
          <div className="flex-1 min-w-[215px]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-slate-800">
                {MONTH_NAMES_VI[selectedMonth]} / {selectedYear}
              </span>

              <div className="flex items-center gap-1 text-slate-500">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Tháng trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Tháng sau"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((day) => (
                <div key={day} className="text-[11px] font-bold text-slate-400 py-1">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {prevMonthDays.map((d) => (
                <button
                  key={`prev-${d}`}
                  type="button"
                  onClick={() => handleSelectDay(d, -1)}
                  className="h-8 text-xs text-slate-300 hover:bg-slate-50 rounded-lg flex items-center justify-center font-medium cursor-pointer"
                >
                  {d}
                </button>
              ))}

              {currentMonthDays.map((d) => {
                const isSelected = parsedValueDate !== null && selectedDay === d;
                return (
                  <button
                    key={`curr-${d}`}
                    type="button"
                    onClick={() => handleSelectDay(d, 0)}
                    className={`h-8 text-xs rounded-lg flex items-center justify-center transition-colors cursor-pointer font-bold ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}

              {nextMonthDays.map((d) => (
                <button
                  key={`next-${d}`}
                  type="button"
                  onClick={() => handleSelectDay(d, 1)}
                  className="h-8 text-xs text-slate-300 hover:bg-slate-50 rounded-lg flex items-center justify-center font-medium cursor-pointer"
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-xs font-semibold">
              <button
                type="button"
                onClick={handleClear}
                className="text-rose-600 hover:text-rose-800 transition-colors cursor-pointer"
              >
                {clearLabel}
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
              >
                Hôm nay
              </button>
            </div>
          </div>

          <div className="hidden sm:block w-px bg-slate-100 my-1" />

          {/* 24-Hour Time Column (Giờ Việt Nam) */}
          <div className="w-full sm:w-36 flex flex-col justify-between pt-1 sm:pt-0">
            <div className="mb-2 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-indigo-600" />
                Giờ VN (24h)
              </span>
              <span className="font-mono text-indigo-700 font-black">
                {String(selectedHour24).padStart(2, '0')}:{String(selectedMinute).padStart(2, '0')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 h-44 overflow-hidden">
              <div className="overflow-y-auto space-y-1 pr-0.5 scrollbar-thin">
                <div className="text-[10px] font-bold text-center text-slate-400 sticky top-0 bg-white pb-1">
                  Giờ
                </div>
                {HOURS_24.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleSelectHour24(h)}
                    className={`w-full py-1 text-xs font-semibold rounded text-center transition-colors cursor-pointer ${
                      selectedHour24 === h
                        ? 'bg-indigo-600 text-white font-black'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {String(h).padStart(2, '0')}
                  </button>
                ))}
              </div>

              <div className="overflow-y-auto space-y-1 pr-0.5 scrollbar-thin">
                <div className="text-[10px] font-bold text-center text-slate-400 sticky top-0 bg-white pb-1">
                  Phút
                </div>
                {minuteChoices.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSelectMinute(m)}
                    className={`w-full py-1 text-xs font-semibold rounded text-center transition-colors cursor-pointer ${
                      selectedMinute === m
                        ? 'bg-indigo-600 text-white font-black'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {String(m).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
