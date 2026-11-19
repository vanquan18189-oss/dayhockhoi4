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
  apiKey: "AIzaSyCposG8jGC7Z_RsUDd1BCLyLtbCkD6AtAs",
  authDomain: "dayhockhoi4-fb50c.firebaseapp.com",
  projectId: "dayhockhoi4-fb50c",
  storageBucket: "dayhockhoi4-fb50c.firebasestorage.app",
  messagingSenderId: "790815510589",
  appId: "1:790815510589:web:226835314651490aa5da54",
  measurementId: "G-1SSG7WN1KG"
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
