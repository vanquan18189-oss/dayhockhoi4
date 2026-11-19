import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import {
  firebaseConfig,
  app,
  analytics,
  db,
  auth
} from '../firebaseConfig';

export { firebaseConfig, app, analytics, db, auth };
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  return errInfo;
}

// Google Sign-In helper
export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Check or create user document in `users` collection
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      // First user / admin check (thuthuthtk@gmail.com or first user -> Admin, else Teacher)
      const isAdminEmail = user.email?.toLowerCase().includes('thuthuth') || user.email?.toLowerCase().includes('admin');
      const defaultRole = isAdminEmail ? 'admin' : 'teacher';

      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName || 'Người dùng mới',
        email: user.email || '',
        role: defaultRole,
        ownerId: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    return user;
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
};

// Logout helper
export const logoutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.warn('Sign out error:', error);
  }
};

// Generic Firestore Realtime Subscription helper for the 7 required collections:
// students, lessons, questions, exams, assignments, users, activities
export const subscribeToCollection = <T>(
  collectionName: 'students' | 'lessons' | 'questions' | 'exams' | 'assignments' | 'users' | 'activities',
  onUpdate: (data: T[]) => void,
  onError: (err: FirestoreErrorInfo) => void
) => {
  try {
    const colRef = collection(db, collectionName);

    return onSnapshot(
      colRef,
      (snapshot) => {
        const items = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as T[];
        onUpdate(items);
      },
      (error) => {
        const errObj = handleFirestoreError(error, OperationType.LIST, collectionName);
        onError(errObj);
      }
    );
  } catch (error) {
    const errObj = handleFirestoreError(error, OperationType.LIST, collectionName);
    onError(errObj);
    return () => {};
  }
};

// Generic Document Writer with mandatory ownerId, createdAt, updatedAt
export const saveFirestoreDoc = async (
  collectionName: string,
  docId: string | null,
  data: Record<string, any>
) => {
  const currentUid = auth.currentUser?.uid || 'system_guest';
  const now = new Date().toISOString();

  const payload = {
    ...data,
    ownerId: data.ownerId || currentUid,
    updatedAt: now,
    ...(docId ? {} : { createdAt: now })
  };

  try {
    if (docId) {
      const docRef = doc(db, collectionName, docId);
      await updateDoc(docRef, payload);
      return docId;
    } else {
      const colRef = collection(db, collectionName);
      const res = await addDoc(colRef, payload);
      return res.id;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, collectionName);
    throw error;
  }
};
