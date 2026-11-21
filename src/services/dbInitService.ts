import { db } from './firebase';
import {
  purgeLegacy4A4BFromStorageAndFirestore
} from './studentStorageService';

export async function initializeAndSyncAllCollections(): Promise<{ success: boolean; message: string }> {
  try {
    await purgeLegacy4A4BFromStorageAndFirestore();
    if (!db) {
      return { success: false, message: 'Chưa khởi tạo kết nối Firestore' };
    }

    // Không tự động chèn dữ liệu mẫu vào class_rosters, elearning_lessons, questions
    return {
      success: true,
      message: 'Hệ thống kết nối Firestore sạch sẵn sàng, không tự động nạp dữ liệu mẫu.'
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn('Lỗi kiểm tra kết nối Firestore:', err);
    return {
      success: false,
      message: msg
    };
  }
}

