import { db } from './firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { GameItem, QuizziGameItem } from '../types';
import { removeUndefined } from './teacherStorageService';
import {
  getScopedDocs,
  subscribeScopedCollection,
  resolveTeacherIdentityForWrite,
  ScopeOverride
} from './firestoreScopeService';

const GAMES_CACHE_KEY = 'eduplay_k4_cached_games';
export const QUIZZI_CACHE_KEY = 'eduplay_k4_quizzi_games';
export const QUIZZI_COLLECTION = 'quizzi_games';

export const DEFAULT_QUIZZI_GAMES: QuizziGameItem[] = [];

/**
 * Lấy danh sách Trò chơi từ LocalStorage Cache
 */
export function getLocalCachedGames(): GameItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const cached = localStorage.getItem(GAMES_CACHE_KEY);
    if (cached !== null) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Lỗi đọc cache trò chơi từ LocalStorage:', e);
  }
  return [];
}

/**
 * Lưu danh sách Trò chơi vào LocalStorage Cache
 */
export function saveGamesToLocalStorage(games: GameItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GAMES_CACHE_KEY, JSON.stringify(games));
  } catch (e) {
    console.warn('Lỗi lưu cache trò chơi vào LocalStorage:', e);
  }
}

/**
 * Lưu một GameItem lên Firestore
 */
export async function saveGameToFirestore(game: GameItem): Promise<void> {
  try {
    // Cập nhật LocalStorage cache trước
    const current = getLocalCachedGames();
    const existsIdx = current.findIndex(g => g.id === game.id);
    let updated: GameItem[];
    if (existsIdx >= 0) {
      updated = [...current];
      updated[existsIdx] = game;
    } else {
      updated = [game, ...current];
    }
    saveGamesToLocalStorage(updated);

    if (!db) {
      console.warn('Firestore chưa sẵn sàng, lưu cache cục bộ trò chơi');
      return;
    }

    const identity = resolveTeacherIdentityForWrite({
      teacherId: game.teacherId,
      teacherEmail: game.teacherEmail,
      teacherName: game.teacherName,
      createdBy: game.createdBy
    });

    const gameRef = doc(db, 'games', game.id);
    const cleanedPayload = removeUndefined({
      ...game,
      teacherId: game.teacherId && game.teacherId.length <= 12 ? game.teacherId : identity.teacherId,
      teacherEmail: game.teacherEmail || identity.teacherEmail,
      teacherName: game.teacherName || identity.teacherName,
      createdBy: game.createdBy && game.createdBy.length <= 12 ? game.createdBy : identity.createdBy,
      updatedAt: new Date().toISOString()
    });

    await setDoc(gameRef, cleanedPayload, { merge: true });
    console.log(`💾 Đã lưu trò chơi "${game.title}" (ID: ${game.id}) lên Cloud Firestore!`);
  } catch (error) {
    console.error("Lỗi khi lưu trò chơi lên Firestore:", error);
  }
}

/**
 * Lấy danh sách Trò chơi từ Firestore (phân quyền qua `where()`)
 */
export async function getGamesFromFirestore(scopeOverride?: ScopeOverride): Promise<GameItem[]> {
  try {
    if (!db) return getLocalCachedGames();

    const snap = await getScopedDocs('games', scopeOverride);
    if (!snap) return getLocalCachedGames();
    const items: GameItem[] = [];
    if (!snap.empty) {
      snap.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() } as GameItem);
      });
    }
    saveGamesToLocalStorage(items);
    return items;
  } catch (error) {
    console.warn("Lỗi đọc danh sách trò chơi từ Firestore:", error);
    return getLocalCachedGames();
  }
}

/**
 * Đăng ký lắng nghe thời gian thực (Real-time listener) danh sách Trò chơi từ Firestore với `where()` theo phân quyền
 */
export function subscribeToGamesFromFirestore(
  onUpdate: (games: GameItem[]) => void,
  onError?: (err: any) => void,
  scopeOverride?: ScopeOverride
) {
  if (!db) {
    onUpdate(getLocalCachedGames());
    return () => {};
  }

  try {
    return subscribeScopedCollection(
      'games',
      (snapshot) => {
        const loaded: GameItem[] = [];
        if (!snapshot.empty) {
          snapshot.forEach((docSnap) => {
            loaded.push({ id: docSnap.id, ...docSnap.data() } as GameItem);
          });
          loaded.sort((a, b) => (b.id > a.id ? 1 : -1));
        }
        saveGamesToLocalStorage(loaded);
        onUpdate(loaded);
      },
      (err) => {
        console.warn('Lỗi Firestore Live Games listener:', err);
        if (onError) onError(err);
        onUpdate(getLocalCachedGames());
      },
      scopeOverride
    );
  } catch (err) {
    console.warn('Lỗi khởi tạo subscribeToGamesFromFirestore:', err);
    onUpdate(getLocalCachedGames());
    return () => {};
  }
}

/**
 * Xóa một Trò chơi khỏi Firestore
 */
export async function deleteGameFromFirestore(gameId: string): Promise<void> {
  try {
    const current = getLocalCachedGames();
    const updated = current.filter(g => g.id !== gameId);
    saveGamesToLocalStorage(updated);

    if (db) {
      const ref = doc(db, 'games', gameId);
      await deleteDoc(ref);
      console.log(`🗑️ Đã xóa trò chơi ID ${gameId} trên Cloud Firestore!`);
    }
  } catch (error) {
    console.error("Lỗi khi xóa trò chơi khỏi Firestore:", error);
  }
}

// ==========================================
// QUIZZI GAMES STORAGE & REALTIME SYNC
// ==========================================

/**
 * Lấy danh sách Trò chơi Quizzi từ LocalStorage Cache
 */
export function getLocalCachedQuizziGames(): QuizziGameItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const cached = localStorage.getItem(QUIZZI_CACHE_KEY);
    if (cached !== null) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Lỗi đọc cache Quizzi từ LocalStorage:', e);
  }
  return [];
}

/**
 * Lưu danh sách Trò chơi Quizzi vào LocalStorage Cache
 */
export function saveQuizziGamesToLocalStorage(games: QuizziGameItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUIZZI_CACHE_KEY, JSON.stringify(games));
  } catch (e) {
    console.warn('Lỗi lưu cache Quizzi vào LocalStorage:', e);
  }
}

/**
 * Lưu một QuizziGameItem lên Firestore
 */
export async function saveQuizziGameToFirestore(game: QuizziGameItem): Promise<void> {
  try {
    // 1. Cập nhật LocalStorage cache trước
    const current = getLocalCachedQuizziGames();
    const existsIdx = current.findIndex(g => String(g.id) === String(game.id));
    let updated: QuizziGameItem[];
    if (existsIdx >= 0) {
      updated = [...current];
      updated[existsIdx] = game;
    } else {
      updated = [game, ...current];
    }
    saveQuizziGamesToLocalStorage(updated);

    // 2. Gửi lên Firestore
    if (!db) {
      console.warn('Firestore chưa sẵn sàng, lưu cache cục bộ Quizzi');
      return;
    }

    const identity = resolveTeacherIdentityForWrite({
      teacherId: game.teacherId,
      teacherEmail: game.teacherEmail,
      teacherName: game.teacherName,
      createdBy: game.createdBy
    });

    const docId = String(game.id);
    const gameRef = doc(db, QUIZZI_COLLECTION, docId);
    const cleanedPayload = removeUndefined({
      ...game,
      id: docId,
      teacherId: game.teacherId && game.teacherId.length <= 12 ? game.teacherId : identity.teacherId,
      teacherEmail: game.teacherEmail || identity.teacherEmail,
      teacherName: game.teacherName || identity.teacherName,
      createdBy: game.createdBy && game.createdBy.length <= 12 ? game.createdBy : identity.createdBy,
      updatedAt: new Date().toISOString()
    });

    await setDoc(gameRef, cleanedPayload, { merge: true });
    console.log(`✅ [Firestore] Đã lưu trò chơi Quizzi "${game.title}" (ID: ${docId}) vào collection "${QUIZZI_COLLECTION}" thành công!`);
  } catch (error) {
    console.error(`❌ [Firestore] Lỗi khi lưu trò chơi Quizzi "${game.title}" lên Firestore:`, error);
    throw error;
  }
}

/**
 * Lưu nhiều QuizziGameItem lên Firestore (hỗ trợ lưu nhiều lớp cùng lúc)
 */
export async function saveMultipleQuizziGamesToFirestore(games: QuizziGameItem[]): Promise<void> {
  for (const game of games) {
    await saveQuizziGameToFirestore(game);
  }
}

/**
 * Lấy danh sách Trò chơi Quizzi từ Firestore (phân quyền qua `where()`)
 */
export async function getQuizziGamesFromFirestore(scopeOverride?: ScopeOverride): Promise<QuizziGameItem[]> {
  try {
    if (!db) return getLocalCachedQuizziGames();

    const snap = await getScopedDocs('quizzi_games', scopeOverride);
    if (!snap) return getLocalCachedQuizziGames();
    const items: QuizziGameItem[] = [];
    if (!snap.empty) {
      snap.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() } as QuizziGameItem);
      });
    }
    saveQuizziGamesToLocalStorage(items);
    return items;
  } catch (error) {
    console.warn("Lỗi đọc danh sách Quizzi từ Firestore:", error);
    return getLocalCachedQuizziGames();
  }
}

/**
 * Đăng ký lắng nghe thời gian thực (Real-time listener) danh sách Trò chơi Quizzi từ Firestore với `where()` theo phân quyền
 */
export function subscribeToQuizziGamesFromFirestore(
  onUpdate: (games: QuizziGameItem[]) => void,
  onError?: (err: any) => void,
  scopeOverride?: ScopeOverride
): () => void {
  if (!db) {
    onUpdate(getLocalCachedQuizziGames());
    return () => {};
  }

  try {
    return subscribeScopedCollection(
      'quizzi_games',
      (snapshot) => {
        const loaded: QuizziGameItem[] = [];
        if (!snapshot.empty) {
          snapshot.forEach((docSnap) => {
            loaded.push({ id: docSnap.id, ...docSnap.data() } as QuizziGameItem);
          });
          loaded.sort((a, b) => {
            const timeA = a.updatedAt || a.createdAt || '';
            const timeB = b.updatedAt || b.createdAt || '';
            if (timeA && timeB && timeA !== timeB) return timeB.localeCompare(timeA);
            return String(b.id).localeCompare(String(a.id));
          });
        }
        saveQuizziGamesToLocalStorage(loaded);
        onUpdate(loaded);
      },
      (err) => {
        console.warn('Lỗi Firestore Live Quizzi games listener:', err);
        if (onError) onError(err);
        onUpdate(getLocalCachedQuizziGames());
      },
      scopeOverride
    );
  } catch (err) {
    console.warn('Lỗi khởi tạo subscribeToQuizziGamesFromFirestore:', err);
    onUpdate(getLocalCachedQuizziGames());
    return () => {};
  }
}

/**
 * Xóa một Trò chơi Quizzi khỏi Firestore
 */
export async function deleteQuizziGameFromFirestore(gameId: string | number): Promise<void> {
  try {
    const docId = String(gameId);
    const current = getLocalCachedQuizziGames();
    const updated = current.filter(g => String(g.id) !== docId);
    saveQuizziGamesToLocalStorage(updated);

    if (db) {
      const ref = doc(db, QUIZZI_COLLECTION, docId);
      await deleteDoc(ref);
      console.log(`🗑️ [Firestore] Đã xóa vĩnh viễn trò chơi Quizzi ID "${docId}" trên Firestore collection "${QUIZZI_COLLECTION}"!`);
    }
  } catch (error) {
    console.error(`❌ [Firestore] Lỗi khi xóa trò chơi Quizzi ID ${gameId} khỏi Firestore:`, error);
    throw error;
  }
}

export function extractGameIdFromPath(pathname?: string): string | null {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const match = path.match(/^\/game\/([^/?#]+)/i);
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}


