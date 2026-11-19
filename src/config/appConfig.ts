/**
 * Cấu hình Tên thương hiệu và Thông tin Hệ thống chung
 * KHỐI 4 HỌC CÙNG AI
 */

export const APP_NAME = 'KHỐI 4 HỌC CÙNG AI';
export const APP_SHORT_NAME = 'KHỐI 4 HỌC CÙNG AI';
export const APP_GRADE_LABEL = 'KHỐI 4';
export const APP_SUBTITLE = 'Hệ Thống Quản Lý Dạy & Học Sư Phạm Thông Minh • Khối 4';
export const APP_FULL_TITLE = 'KHỐI 4 HỌC CÙNG AI - Hệ Thống Quản Lý Dạy Và Học';
export const APP_SCHOOL_NAME = 'HỆ THỐNG KHỐI 4 HỌC CÙNG AI';
export const APP_DESCRIPTION = 'Hệ thống Quản lý Dạy và Học Khối 4 tích hợp AI Sư Phạm Tiểu Học.';

export function showToastMessage(
  title: string,
  message: string,
  type: 'success' | 'error' | 'warning' | 'info' = 'info'
) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('eduplay_toast', {
        detail: { title, message, type }
      })
    );
  }
}

