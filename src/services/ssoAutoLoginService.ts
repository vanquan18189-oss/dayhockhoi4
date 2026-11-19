import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from './firebase';
import {
  verifyTeacherAuthorization,
  resolveTeacherNameByEmail,
  TeacherProfileResult
} from './teacherStorageService';
import { ActiveModule, UserRole } from '../types';

export const SSO_SESSION_KEY = 'eduplay_k4_sso_session';
export const SSO_USER_KEY = 'eduplay_k4_sso_current_user';
export const SSO_TOKEN_KEY = 'eduplay_k4_sso_token';
export const ACTIVE_MODULE_KEY = 'eduplay_k4_active_module';

export const PK_TRUC_KHANG_REQUEST_SSO = 'PK_TRUC_KHANG_REQUEST_SSO';
export const PK_TRUC_KHANG_SSO_LOGIN = 'PK_TRUC_KHANG_SSO_LOGIN';

export interface SsoPayload {
  email?: string;
  token?: string;
  customToken?: string;
  autologin: boolean;
  module?: string;
  role?: string;
  name?: string;
  className?: string;
  sourceOrigin?: string;
  messageType?: string;
}

export interface StoredSsoSession {
  email: string;
  name: string;
  role: UserRole;
  teacherId?: string;
  targetModule?: ActiveModule;
  token?: string;
  authenticatedAt: number;
  viaIframe?: boolean;
}

export interface SsoAuthResult {
  authorized: boolean;
  email: string;
  name: string;
  role: UserRole;
  targetModule: ActiveModule;
  profile?: TeacherProfileResult;
  reason?: string;
}

const VALID_TEACHER_MODULES: ActiveModule[] = [
  'lesson_5e',
  'question_bank',
  'assignment',
  'interactive_games',
  'user_management'
];

const SSO_URL_PARAM_KEYS = [
  'sso_email',
  'email',
  'userEmail',
  'teacher_email',
  'sso_token',
  'token',
  'idToken',
  'accessToken',
  'authToken',
  'customToken',
  'firebaseCustomToken',
  'sso_custom_token',
  'auto_login',
  'autologin',
  'autoLogin',
  'sso',
  'sso_name',
  'name',
  'displayName',
  'sso_role',
  'role',
  'source',
  'parentOrigin'
];

/**
 * Detect whether the app is running inside a parent iframe.
 */
export function isEmbeddedInIframe(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Request parent portal ("Dạy và Học Số PK Trực Khang") for active SSO credentials via postMessage.
 * Note: Emitting this request does NOT grant login access on its own — valid credentials are still required.
 */
export function requestSsoFromParentWindow(): void {
  try {
    if (typeof window === 'undefined' || !isEmbeddedInIframe() || !window.parent) return;
    window.parent.postMessage(
      {
        type: PK_TRUC_KHANG_REQUEST_SSO,
        app: 'khoi4',
        source: 'quanlybaitap-khoi4',
        timestamp: Date.now()
      },
      '*'
    );
    window.parent.postMessage({ type: 'PK_TRUC_KHANG_SSO_READY', app: 'khoi4' }, '*');
    window.parent.postMessage({ type: 'EDUPLAY_SSO_READY', app: 'khoi4' }, '*');
  } catch (err) {
    console.warn('Không thể gửi tín hiệu PK_TRUC_KHANG_REQUEST_SSO lên parent window:', err);
  }
}

/**
 * Sanitize requested module for Teacher SSO.
 * Defaults to 'assignment' (Quản Lý Bài Tập) when launched from parent portal.
 */
export function sanitizeTeacherModule(rawModule?: string | null): ActiveModule {
  try {
    if (!rawModule || typeof rawModule !== 'string') return 'assignment';
    const normalized = rawModule.trim().toLowerCase();
    if (normalized === 'assignments' || normalized === 'baitap' || normalized === 'bai_tap') {
      return 'assignment';
    }
    if (normalized === 'lessons' || normalized === 'lesson' || normalized === 'baigiang') {
      return 'lesson_5e';
    }
    if (normalized === 'questions' || normalized === 'nganhang') {
      return 'question_bank';
    }
    if (normalized === 'games' || normalized === 'trochoi') {
      return 'interactive_games';
    }
    if (normalized === 'users' || normalized === 'nguoidung') {
      return 'user_management';
    }
    if ((VALID_TEACHER_MODULES as string[]).includes(normalized)) {
      return normalized as ActiveModule;
    }
  } catch {
    // fallback
  }
  return 'assignment';
}

function isTruthyFlag(val?: string | boolean | number | null): boolean {
  if (val === true || val === 1) return true;
  if (typeof val !== 'string') return false;
  const clean = val.trim().toLowerCase();
  return clean === 'true' || clean === '1' || clean === 'yes';
}

function isValidEmailFormat(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Safely decode standard or URL-safe Base64 string supporting UTF-8 Vietnamese text.
 */
export function decodeBase64Utf8Safe(base64Input?: string | null): string | null {
  try {
    if (!base64Input || typeof base64Input !== 'string') return null;
    const clean = base64Input.trim().replace(/\s+/g, '');
    if (!clean) return null;

    const standardB64 = clean.replace(/-/g, '+').replace(/_/g, '/');
    const padded = standardB64 + '='.repeat((4 - (standardB64.length % 4)) % 4);
    const binary = atob(padded);

    if (typeof TextDecoder !== 'undefined') {
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }

    return decodeURIComponent(
      binary
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    return null;
  }
}

/**
 * Safely decode an SSO token (JWT or Base64 UTF-8 JSON / email string).
 */
export function decodeSsoTokenPayloadSafe(token?: string | null): Record<string, any> | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const clean = token.trim();
    if (!clean) return null;

    // 1. Check 3-part JWT
    const parts = clean.split('.');
    if (parts.length === 3 && parts[1]) {
      const decodedJwt = decodeBase64Utf8Safe(parts[1]);
      if (decodedJwt) {
        const parsedJwt = JSON.parse(decodedJwt);
        if (parsedJwt && typeof parsedJwt === 'object') return parsedJwt;
      }
    }

    // 2. Check direct JSON string
    if (clean.startsWith('{') && clean.endsWith('}')) {
      const parsedDirect = JSON.parse(clean);
      if (parsedDirect && typeof parsedDirect === 'object') return parsedDirect;
    }

    // 3. Check Base64-encoded JSON or Base64-encoded email/delimited payload
    const decodedB64 = decodeBase64Utf8Safe(clean);
    if (decodedB64) {
      const trimmedDecoded = decodedB64.trim();
      if (trimmedDecoded.startsWith('{') && trimmedDecoded.endsWith('}')) {
        try {
          const parsedObj = JSON.parse(trimmedDecoded);
          if (parsedObj && typeof parsedObj === 'object') return parsedObj;
        } catch {}
      }
      if (isValidEmailFormat(trimmedDecoded)) {
        return { email: trimmedDecoded.toLowerCase() };
      }
      if (trimmedDecoded.includes('|')) {
        const [maybeEmail, maybeName, maybeRole] = trimmedDecoded.split('|').map((s) => s.trim());
        if (isValidEmailFormat(maybeEmail)) {
          return {
            email: maybeEmail.toLowerCase(),
            name: maybeName || undefined,
            role: maybeRole || undefined
          };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Validate sso_token (JWT or Base64 JSON) and extract embedded identity claims strictly.
 */
function validateAndDecodeSsoToken(
  token: string | undefined,
  providedEmail: string | undefined
): {
  valid: boolean;
  derivedEmail?: string;
  derivedName?: string;
  derivedRole?: string;
  derivedModule?: string;
  reason?: string;
} {
  try {
    if (!token) {
      return { valid: true, derivedEmail: providedEmail };
    }
    const cleanToken = token.trim();
    if (!cleanToken || cleanToken.length < 8) {
      return { valid: false, reason: 'Token xác thực SSO không hợp lệ.' };
    }

    const decoded = decodeSsoTokenPayloadSafe(cleanToken);
    if (decoded) {
      if (typeof decoded.exp === 'number' && decoded.exp * 1000 < Date.now() - 300_000) {
        return {
          valid: false,
          reason: 'Phiên đăng nhập từ cổng chính đã hết hạn. Vui lòng đăng nhập lại.'
        };
      }
      if (typeof decoded.expiresAt === 'number' && decoded.expiresAt < Date.now() - 300_000) {
        return {
          valid: false,
          reason: 'Phiên đăng nhập từ cổng chính đã hết hạn. Vui lòng đăng nhập lại.'
        };
      }

      const rawTokenEmail = decoded.sso_email || decoded.email || decoded.userEmail;
      const tokenEmail =
        typeof rawTokenEmail === 'string' && isValidEmailFormat(rawTokenEmail)
          ? rawTokenEmail.trim().toLowerCase()
          : undefined;

      if (tokenEmail && providedEmail && tokenEmail !== providedEmail.trim().toLowerCase()) {
        return {
          valid: false,
          reason: 'Thông tin email và token xác thực SSO không khớp.'
        };
      }

      const rawTokenName = decoded.sso_name || decoded.name || decoded.displayName;
      const rawTokenRole = decoded.sso_role || decoded.role;
      const rawTokenModule = decoded.module || decoded.target;

      return {
        valid: true,
        derivedEmail: providedEmail || tokenEmail,
        derivedName: typeof rawTokenName === 'string' ? rawTokenName.trim() : undefined,
        derivedRole: typeof rawTokenRole === 'string' ? rawTokenRole.trim() : undefined,
        derivedModule: typeof rawTokenModule === 'string' ? rawTokenModule.trim() : undefined
      };
    }

    // Opaque token requires a valid providedEmail to verify teacher identity
    if (!isValidEmailFormat(providedEmail)) {
      return {
        valid: false,
        reason: 'Token SSO không chứa thông tin tài khoản hợp lệ.'
      };
    }

    return { valid: true, derivedEmail: providedEmail };
  } catch {
    return { valid: false, reason: 'Không thể kiểm tra token SSO.' };
  }
}

/**
 * Parse SSO parameters from window.location.search and window.location.hash strictly.
 * ONLY activates when URL contains valid sso_token or sso_email (or email + token/customToken).
 * Bare ?auto_login=true without sso_token / sso_email is REJECTED.
 */
export function parseSsoParamsFromUrl(): SsoPayload | null {
  try {
    if (typeof window === 'undefined') return null;

    const searchParams = new URLSearchParams(window.location.search || '');
    const merged = new URLSearchParams();

    searchParams.forEach((value, key) => {
      merged.set(key, value);
    });

    const rawHash = window.location.hash || '';
    const hashQueryIndex = rawHash.indexOf('?');
    if (hashQueryIndex !== -1) {
      const hashQuery = rawHash.slice(hashQueryIndex + 1);
      const hashParams = new URLSearchParams(hashQuery);
      hashParams.forEach((value, key) => {
        if (!merged.has(key)) merged.set(key, value);
      });
    }

    const email = (
      merged.get('sso_email') ||
      merged.get('email') ||
      merged.get('userEmail') ||
      merged.get('teacher_email') ||
      ''
    )
      .trim()
      .toLowerCase() || undefined;

    const token = (
      merged.get('sso_token') ||
      merged.get('token') ||
      merged.get('idToken') ||
      merged.get('accessToken') ||
      merged.get('authToken') ||
      ''
    ).trim() || undefined;

    const customToken = (
      merged.get('customToken') ||
      merged.get('firebaseCustomToken') ||
      merged.get('sso_custom_token') ||
      ''
    ).trim() || undefined;

    const decodedFromToken = token ? decodeSsoTokenPayloadSafe(token) : null;
    const tokenEmail =
      typeof (decodedFromToken?.sso_email || decodedFromToken?.email) === 'string'
        ? String(decodedFromToken?.sso_email || decodedFromToken?.email).trim().toLowerCase()
        : undefined;

    const effectiveEmail = email || tokenEmail;
    const hasExplicitParentSsoKey =
      merged.has('sso_email') ||
      merged.has('sso_token') ||
      Boolean(email && (token || customToken || isTruthyFlag(merged.get('auto_login')) || isTruthyFlag(merged.get('autologin')) || isTruthyFlag(merged.get('sso'))));

    // Strict Security Check: Require at least a valid email OR a valid customToken/decodable sso_token
    if (!hasExplicitParentSsoKey || (!isValidEmailFormat(effectiveEmail) && !customToken)) {
      return null;
    }

    const tokenName =
      typeof (decodedFromToken?.sso_name || decodedFromToken?.name || decodedFromToken?.displayName) === 'string'
        ? String(decodedFromToken?.sso_name || decodedFromToken?.name || decodedFromToken?.displayName).trim()
        : undefined;
    const tokenRole =
      typeof (decodedFromToken?.sso_role || decodedFromToken?.role) === 'string'
        ? String(decodedFromToken?.sso_role || decodedFromToken?.role).trim()
        : undefined;

    return {
      email: effectiveEmail,
      token,
      customToken,
      autologin: true,
      module: (merged.get('module') || merged.get('tab') || merged.get('target') || '').trim() || undefined,
      role: (merged.get('sso_role') || merged.get('role') || tokenRole || '').trim() || undefined,
      name: (merged.get('sso_name') || merged.get('name') || merged.get('displayName') || tokenName || '').trim() || undefined,
      className: (merged.get('class') || merged.get('className') || '').trim() || undefined,
      sourceOrigin: (merged.get('parentOrigin') || merged.get('source') || '').trim() || undefined
    };
  } catch (err) {
    console.warn('parseSsoParamsFromUrl warning:', err);
    return null;
  }
}

/**
 * Extract SSO payload from incoming iframe window.postMessage event data strictly.
 * Requires valid email or decodable token/customToken — NEVER allows empty payloads.
 */
export function extractSsoPayloadFromMessage(data: any, origin?: string): SsoPayload | null {
  try {
    if (!data || typeof data !== 'object') return null;

    const msgType = typeof data.type === 'string' ? data.type.trim().toUpperCase() : '';
    const isKnownMessageType =
      msgType === PK_TRUC_KHANG_SSO_LOGIN ||
      msgType === 'EDUPLAY_SSO_LOGIN' ||
      msgType === 'SSO_LOGIN' ||
      msgType === 'AUTH_SSO' ||
      msgType === 'PARENT_AUTH_SYNC' ||
      msgType === 'EDUPLAY_AUTH_PAYLOAD';

    const nestedSource =
      (data.payload && typeof data.payload === 'object' && data.payload) ||
      (data.user && typeof data.user === 'object' && data.user) ||
      (data.currentUser && typeof data.currentUser === 'object' && data.currentUser) ||
      (data.teacher && typeof data.teacher === 'object' && data.teacher) ||
      data;

    const token = (
      nestedSource.sso_token ||
      nestedSource.token ||
      nestedSource.idToken ||
      nestedSource.accessToken ||
      nestedSource.authToken ||
      data.sso_token ||
      data.token ||
      ''
    )
      .toString()
      .trim() || undefined;

    const decodedToken = token ? decodeSsoTokenPayloadSafe(token) : null;

    const email = (
      nestedSource.sso_email ||
      nestedSource.email ||
      nestedSource.userEmail ||
      data.sso_email ||
      data.email ||
      decodedToken?.sso_email ||
      decodedToken?.email ||
      ''
    )
      .toString()
      .trim()
      .toLowerCase() || undefined;

    const customToken = (
      nestedSource.customToken ||
      nestedSource.firebaseCustomToken ||
      nestedSource.sso_custom_token ||
      data.customToken ||
      ''
    )
      .toString()
      .trim() || undefined;

    const autologin =
      isKnownMessageType ||
      isTruthyFlag(nestedSource.auto_login) ||
      isTruthyFlag(nestedSource.autologin) ||
      isTruthyFlag(nestedSource.autoLogin) ||
      isTruthyFlag(nestedSource.sso) ||
      isTruthyFlag(data.auto_login) ||
      isTruthyFlag(data.autologin);

    if (!autologin) {
      return null;
    }

    // Strictly require valid email or customToken — never trigger empty SSO payloads
    if (!isValidEmailFormat(email) && !customToken) {
      return null;
    }

    const rawName =
      nestedSource.sso_name ||
      nestedSource.name ||
      nestedSource.displayName ||
      data.sso_name ||
      data.name ||
      data.displayName ||
      decodedToken?.sso_name ||
      decodedToken?.name;

    const rawRole =
      nestedSource.sso_role ||
      nestedSource.role ||
      data.sso_role ||
      data.role ||
      decodedToken?.sso_role ||
      decodedToken?.role;

    const rawModule =
      nestedSource.module || nestedSource.target || data.module || data.target;

    return {
      email,
      token,
      customToken,
      autologin: true,
      module: typeof rawModule === 'string' ? rawModule : undefined,
      role: typeof rawRole === 'string' ? rawRole : undefined,
      name: typeof rawName === 'string' ? rawName : undefined,
      className: typeof nestedSource.className === 'string' ? nestedSource.className : undefined,
      sourceOrigin: origin,
      messageType: msgType || undefined
    };
  } catch {
    return null;
  }
}

/**
 * Remove sensitive SSO tokens/parameters from the browser address bar without reloading.
 */
export function stripSensitiveSsoParamsFromUrl(): void {
  try {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    const url = new URL(window.location.href);
    let modified = false;

    for (const key of SSO_URL_PARAM_KEYS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        modified = true;
      }
    }

    if (url.searchParams.has('module')) {
      url.searchParams.delete('module');
      modified = true;
    }
    if (url.searchParams.has('tab')) {
      url.searchParams.delete('tab');
      modified = true;
    }
    if (url.searchParams.has('target')) {
      url.searchParams.delete('target');
      modified = true;
    }

    if (modified) {
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, document.title, nextUrl || '/');
    }
  } catch (err) {
    console.warn('Không thể làm sạch tham số SSO khỏi URL:', err);
  }
}

/**
 * Read persisted verified SSO session from localStorage (primary) or sessionStorage (fallback).
 */
export function getStoredSsoSession(): StoredSsoSession | null {
  try {
    if (typeof window === 'undefined') return null;

    const readFromStorage = (storage: Storage): StoredSsoSession | null => {
      try {
        const isSsoActive = storage.getItem('eduplay_k4_sso_active') === 'true';
        const rawSession = storage.getItem(SSO_SESSION_KEY) || storage.getItem(SSO_USER_KEY);
        if (rawSession) {
          const parsed = JSON.parse(rawSession);
          if (parsed && typeof parsed === 'object' && isValidEmailFormat(parsed.email)) {
            return parsed as StoredSsoSession;
          }
        }
        if (isSsoActive) {
          const email = storage.getItem('eduplay_k4_teacher_email');
          if (isValidEmailFormat(email)) {
            const savedRole = storage.getItem('eduplay_k4_active_role');
            const savedName = storage.getItem('eduplay_k4_teacher_name') || 'Giáo viên';
            const savedModule = storage.getItem(ACTIVE_MODULE_KEY);
            return {
              email: email!.trim().toLowerCase(),
              name: savedName,
              role: savedRole === 'admin' ? 'admin' : 'teacher',
              teacherId: storage.getItem('eduplay_k4_teacher_id') || undefined,
              targetModule: sanitizeTeacherModule(savedModule),
              authenticatedAt: Date.now()
            };
          }
        }
      } catch {
        return null;
      }
      return null;
    };

    return readFromStorage(localStorage) || readFromStorage(sessionStorage);
  } catch {
    return null;
  }
}

/**
 * Persist verified SSO session to BOTH localStorage and sessionStorage.
 */
export function persistSsoSessionToStorages(session: StoredSsoSession): void {
  try {
    if (typeof window === 'undefined') return;
    if (!isValidEmailFormat(session.email)) return;

    const serialized = JSON.stringify(session);

    const writeToStorage = (storage: Storage) => {
      try {
        storage.setItem('eduplay_k4_active_session', 'true');
        storage.setItem('eduplay_k4_sso_active', 'true');
        storage.setItem('eduplay_k4_active_role', session.role);
        storage.setItem('eduplay_k4_teacher_email', session.email);
        storage.setItem('eduplay_k4_teacher_name', session.name);
        if (session.teacherId) {
          storage.setItem('eduplay_k4_teacher_id', session.teacherId);
        }
        if (session.token) {
          storage.setItem(SSO_TOKEN_KEY, session.token);
        }
        if (session.targetModule) {
          storage.setItem(ACTIVE_MODULE_KEY, session.targetModule);
        }
        storage.setItem(SSO_SESSION_KEY, serialized);
        storage.setItem(SSO_USER_KEY, serialized);
      } catch {}
    };

    writeToStorage(localStorage);
    writeToStorage(sessionStorage);

    window.dispatchEvent(
      new CustomEvent('eduplay_teacher_session_updated', {
        detail: {
          email: session.email,
          name: session.name,
          role: session.role,
          sso: true
        }
      })
    );
  } catch (storageErr) {
    console.warn('Không thể lưu phiên SSO vào bộ nhớ trình duyệt:', storageErr);
  }
}

/**
 * Strict SSO validation & authentication:
 * - NO default fallback email is ever used.
 * - Requires valid email (from sso_email or decoded sso_token/customToken).
 * - Requires verifyTeacherAuthorization(email) to pass before establishing session.
 */
export async function authenticateSsoPayload(payload: SsoPayload): Promise<SsoAuthResult> {
  try {
    const tokenCheck = validateAndDecodeSsoToken(payload.token, payload.email);
    if (!tokenCheck.valid) {
      return {
        authorized: false,
        email: payload.email || '',
        name: '',
        role: 'teacher',
        targetModule: sanitizeTeacherModule(payload.module),
        reason: tokenCheck.reason || 'Token xác thực SSO không hợp lệ.'
      };
    }

    let resolvedEmail = (tokenCheck.derivedEmail || payload.email || '').trim().toLowerCase();
    const resolvedInputName = payload.name || tokenCheck.derivedName;
    const resolvedInputRole = payload.role || tokenCheck.derivedRole;
    const resolvedInputModule = payload.module || tokenCheck.derivedModule;

    // Sign in to Firebase Auth if parent supplied a Firebase Custom Token
    if (payload.customToken && auth) {
      try {
        const cred = await signInWithCustomToken(auth, payload.customToken);
        if (!resolvedEmail && cred.user?.email) {
          resolvedEmail = cred.user.email.trim().toLowerCase();
        }
      } catch (firebaseErr: any) {
        return {
          authorized: false,
          email: resolvedEmail,
          name: '',
          role: 'teacher',
          targetModule: sanitizeTeacherModule(resolvedInputModule),
          reason: firebaseErr?.message || 'Token xác thực Firebase SSO không hợp lệ hoặc đã hết hạn.'
        };
      }
    }

    // Security Guard: Reject immediately if no valid email was supplied by parent SSO
    if (!isValidEmailFormat(resolvedEmail)) {
      return {
        authorized: false,
        email: '',
        name: '',
        role: 'teacher',
        targetModule: sanitizeTeacherModule(resolvedInputModule),
        reason: 'Thiếu sso_email hoặc sso_token hợp lệ từ hệ thống chính.'
      };
    }

    // Security Guard: Verify teacher is registered & active in Firestore / whitelist / teacher registry
    const authCheck = await verifyTeacherAuthorization(resolvedEmail);
    if (!authCheck.authorized || !authCheck.profile) {
      return {
        authorized: false,
        email: resolvedEmail,
        name: '',
        role: 'teacher',
        targetModule: sanitizeTeacherModule(resolvedInputModule),
        reason:
          authCheck.reason ||
          `Tài khoản ${resolvedEmail} chưa được cấp quyền truy cập hệ thống.`
      };
    }

    const profile = authCheck.profile;
    const resolvedName =
      profile.name ||
      resolveTeacherNameByEmail(resolvedEmail, resolvedInputName || null, undefined, profile.userRole);

    const resolvedRole: UserRole =
      profile.userRole === 'admin' ||
      resolvedInputRole?.toLowerCase().includes('admin') ||
      resolvedInputRole?.toLowerCase().includes('quản trị')
        ? 'admin'
        : 'teacher';

    const targetModule = sanitizeTeacherModule(resolvedInputModule);

    persistSsoSessionToStorages({
      email: resolvedEmail,
      name: resolvedName,
      role: resolvedRole,
      teacherId: profile.id,
      targetModule,
      token: payload.token,
      authenticatedAt: Date.now(),
      viaIframe: isEmbeddedInIframe()
    });

    return {
      authorized: true,
      email: resolvedEmail,
      name: resolvedName,
      role: resolvedRole,
      targetModule,
      profile
    };
  } catch (err: any) {
    console.error('SSO authentication error:', err);
    return {
      authorized: false,
      email: payload.email || '',
      name: '',
      role: 'teacher',
      targetModule: sanitizeTeacherModule(payload.module),
      reason: err?.message || 'Đã xảy ra lỗi khi xác thực đăng nhập tự động (SSO).'
    };
  }
}

/**
 * Resolve synchronous SSO bootstrap strictly:
 * - Only bypasses login screen when URL has valid SSO token/email OR a verified SSO session is already stored.
 * - Running inside an iframe WITHOUT valid credentials NEVER bypasses login on its own.
 */
export function resolveInitialSsoBootstrap(): {
  urlPayload: SsoPayload | null;
  storedSession: StoredSsoSession | null;
  inIframe: boolean;
  shouldBypassLogin: boolean;
} {
  const urlPayload = parseSsoParamsFromUrl();
  const storedSession = getStoredSsoSession();
  const inIframe = isEmbeddedInIframe();
  const shouldBypassLogin = Boolean(urlPayload || storedSession);
  return { urlPayload, storedSession, inIframe, shouldBypassLogin };
}

/**
 * Completely wipe all auth & SSO keys from BOTH localStorage and sessionStorage and sign out of Firebase Auth.
 */
export async function clearAllAuthSessions(): Promise<void> {
  const keysToRemove = [
    'eduplay_k4_active_session',
    'eduplay_k4_sso_active',
    'eduplay_k4_active_role',
    'eduplay_k4_teacher_email',
    'eduplay_k4_teacher_name',
    'eduplay_k4_teacher_id',
    'eduplay_k4_teacher_profile',
    'eduplay_k4_student_session',
    'eduplay_k4_current_class',
    'eduplay_k4_active_class',
    SSO_SESSION_KEY,
    SSO_USER_KEY,
    SSO_TOKEN_KEY,
    ACTIVE_MODULE_KEY
  ];

  try {
    if (typeof window !== 'undefined') {
      for (const k of keysToRemove) {
        try {
          localStorage.removeItem(k);
        } catch {}
        try {
          sessionStorage.removeItem(k);
        } catch {}
      }
      window.dispatchEvent(new CustomEvent('eduplay_logout'));
    }
  } catch (err) {
    console.warn('Lỗi khi xóa phiên đăng nhập:', err);
  }

  try {
    if (auth && auth.currentUser) {
      await signOut(auth);
    }
  } catch (err) {
    console.warn('Lỗi khi đăng xuất Firebase Auth:', err);
  }
}
