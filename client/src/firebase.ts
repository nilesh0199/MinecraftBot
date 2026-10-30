import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as fbSignOut, 
  type User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc 
} from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string;
  ownerIgn: string; // Authorized player Minecraft username
  recentBotNames: string[]; // Max 3 items
  recentServerIp: string;
  createdAt?: number;
  updatedAt?: number;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

const app = !getApps().length && isFirebaseConfigured
  ? initializeApp(firebaseConfig)
  : getApps().length
  ? getApp()
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

export const googleProvider = new GoogleAuthProvider();

export async function loginWithGoogle(): Promise<User | null> {
  if (!auth) {
    throw new Error("Firebase is not configured. Please add your credentials to .env");
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logout(): Promise<void> {
  if (auth) {
    await fbSignOut(auth);
  }
}

/**
 * Fetch user profile from Firestore (or localStorage fallback)
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) {
    const cached = localStorage.getItem(`profile_${uid}`);
    return cached ? JSON.parse(cached) : null;
  }
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data() as UserProfile;
  }
  return null;
}

/**
 * Save / Update user profile in Firestore
 */
export async function saveUserProfile(profile: UserProfile): Promise<void> {
  if (!db) {
    localStorage.setItem(`profile_${profile.uid}`, JSON.stringify(profile));
    return;
  }
  const ref = doc(db, 'users', profile.uid);
  await setDoc(ref, {
    ...profile,
    updatedAt: Date.now(),
  }, { merge: true });
}

/**
 * Helper to update recent bot username and server IP (stores last 3 usernames)
 */
export async function recordBotUsage(uid: string, botName: string, serverIp: string): Promise<void> {
  const current = await getUserProfile(uid);
  if (!current) return;

  const filtered = (current.recentBotNames || []).filter(name => name.toLowerCase() !== botName.toLowerCase());
  const updatedBotNames = [botName, ...filtered].slice(0, 3);

  const updated: UserProfile = {
    ...current,
    recentBotNames: updatedBotNames,
    recentServerIp: serverIp,
    updatedAt: Date.now(),
  };

  await saveUserProfile(updated);
}
