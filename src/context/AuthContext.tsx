import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { INITIAL_USERS } from '../lib/mockData';
import { 
  auth, 
  db, 
  loginWithGoogle, 
  logoutUser, 
  subscribeToCollection,
  FirestoreErrorInfo
} from '../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface AuthContextType {
  currentUser: UserProfile;
  setCurrentUser: (user: UserProfile) => void;
  usersList: UserProfile[];
  apiKey: string;
  setApiKey: (key: string) => void;
  semester: string;
  setSemester: (sem: string) => void;
  switchRole: (role: 'teacher' | 'student' | 'admin') => void;
  firebaseUser: FirebaseUser | null;
  handleGoogleSignIn: () => Promise<void>;
  handleSignOut: () => Promise<void>;
  connectionError: string | null;
  isConnecting: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile>(INITIAL_USERS[0]);
  const [usersList, setUsersList] = useState<UserProfile[]>(INITIAL_USERS);
  const [apiKey, setApiKey] = useState<string>('');
  const [semester, setSemester] = useState<string>('Học kỳ I • 2026-2027');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(true);

  // Auth State Listener
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      setIsConnecting(false);

      if (fbUser) {
        // Fetch or create user profile in Firestore `users/{uid}`
        try {
          const userRef = doc(db, 'users', fbUser.uid);
          const snap = await getDoc(userRef);

          if (snap.exists()) {
            const data = snap.data();
            const profile: UserProfile = {
              uid: fbUser.uid,
              displayName: data.displayName || fbUser.displayName || 'Giáo viên',
              email: data.email || fbUser.email || '',
              role: data.role || 'teacher',
              grade: data.grade || 'Khối 4',
              className: data.className || 'Lớp 4A'
            };
            setCurrentUser(profile);
          } else {
            // New user defaults to "teacher", unless email indicates admin
            const isAdmin = fbUser.email?.toLowerCase().includes('admin') || fbUser.email?.toLowerCase().includes('thuthuth');
            const defaultRole = isAdmin ? 'admin' : 'teacher';
            
            const newProfile: UserProfile = {
              uid: fbUser.uid,
              displayName: fbUser.displayName || 'Giáo viên mới',
              email: fbUser.email || '',
              role: defaultRole,
              grade: 'Khối 4',
              className: 'Lớp 4A'
            };

            await setDoc(userRef, {
              ...newProfile,
              ownerId: fbUser.uid,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });

            setCurrentUser(newProfile);
          }
        } catch (err: any) {
          console.warn('Error fetching Firestore user profile:', err);
          setConnectionError('Đang sử dụng chế độ mượt. Kết nối dự án dayhockhoi4-fb50c: ' + (err.message || 'Chờ phản hồi'));
        }
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Real-time Users Collection Listener
  useEffect(() => {
    const unsub = subscribeToCollection<UserProfile>(
      'users',
      (items) => {
        if (items && items.length > 0) {
          setUsersList(items);
        }
      },
      (err) => {
        console.warn('Users collection realtime error:', err);
      }
    );

    return () => unsub();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setConnectionError(null);
      await loginWithGoogle();
    } catch (err: any) {
      console.error('Sign in error:', err);
      setConnectionError('Lỗi đăng nhập Google Firebase: ' + (err.message || 'Không thể mở cửa sổ xác thực'));
    }
  };

  const handleSignOut = async () => {
    await logoutUser();
    setCurrentUser(INITIAL_USERS[0]);
  };

  const switchRole = (role: 'teacher' | 'student' | 'admin') => {
    const found = usersList.find(u => u.role === role) || {
      uid: `u_${role}_demo`,
      displayName: role === 'teacher' ? 'Thầy Nguyễn Văn Minh' : role === 'student' ? 'Lê Hoàng Nam (Lớp 4A)' : 'Ban Giám Hiệu (Admin)',
      email: `${role}@tieuhoc.edu.vn`,
      role: role,
      grade: 'Khối 4',
      className: 'Lớp 4A'
    };
    setCurrentUser(found);
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      setCurrentUser,
      usersList,
      apiKey,
      setApiKey,
      semester,
      setSemester,
      switchRole,
      firebaseUser,
      handleGoogleSignIn,
      handleSignOut,
      connectionError,
      isConnecting
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
