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
} from "../firebaseConfig";

export const firebaseConfig = {
  apiKey: "AIzaSyCaB5uJUspOJrPmDJAR8gpb7zTt7pwwROY",
  authDomain: "dayhockhoi4.firebaseapp.com",
  projectId: "dayhockhoi4",
  storageBucket: "dayhockhoi4.firebasestorage.app",
  messagingSenderId: "786618686046",
  appId: "1:786618686046:web:fae7ac57c10d5c2c8ef2cf",
  measurementId: "G-F539RT65NV"
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
