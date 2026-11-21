import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import {
  app as defaultApp,
  analytics as defaultAnalytics,
  db as defaultDb,
  auth as defaultAuth,
  isFirestoreQuotaExceeded,
  markFirestoreQuotaExceeded,
  resetFirestoreQuotaAndEnableNetwork,
  testFirestoreServerConnectionOnBoot
} from "./firebaseConfig";

export const firebaseConfig = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || "AIzaSyCaB5uJUspOJrPmDJAR8gpb7zTt7pwwROY",
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || "dayhockhoi4.firebaseapp.com",
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || "dayhockhoi4",
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || "dayhockhoi4.firebasestorage.app",
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "786618686046",
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || "1:786618686046:web:fae7ac57c10d5c2c8ef2cf",
  measurementId: (import.meta as any).env?.VITE_FIREBASE_MEASUREMENT_ID || "G-F539RT65NV"
};

export const app = defaultApp || (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig));
export const analytics = defaultAnalytics;
export const db = defaultDb || getFirestore(app);
export const auth = defaultAuth || getAuth(app);

export {
  isFirestoreQuotaExceeded,
  markFirestoreQuotaExceeded,
  resetFirestoreQuotaAndEnableNetwork,
  testFirestoreServerConnectionOnBoot
};

export default app;
