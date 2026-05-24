import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // 1. Import Auth

const firebaseConfig = {
  apiKey: "AIzaSyDVtMJa90Jwd4aDus5aSC-Wf6OyYc1yYhk",
  authDomain: "bacanaustore.firebaseapp.com",
  projectId: "bacanaustore",
  storageBucket: "bacanaustore.firebasestorage.app",
  messagingSenderId: "879033133286",
  appId: "1:879033133286:web:876bf5186670600154b327",
  measurementId: "G-0LXW0VZHM4"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      getAnalytics(app);
    }
  });
}

export const db = getFirestore(app);
export const auth = getAuth(app); // 2. Export Auth