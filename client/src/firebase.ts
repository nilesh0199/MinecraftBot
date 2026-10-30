import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as fbSignOut, 
  type Auth,
  type User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc,
  type Firestore
} from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string;
  ownerIgn: string; // Authorized player Minecraft username
  recentBotNames: string[]; // Max 3 items
  recentServerIp: string;
  recentServerIps?: string[]; // Max 3 recent server addresses
  createdAt?: number;
  updatedAt?: number;
}

export let app: FirebaseApp | null = null;
export let auth: Auth | null = null;
export let db: Firestore | null = null;
export const googleProvider = new GoogleAuthProvider();

export let isFirebaseConfigured = false;

// Initialize Firebase either from Vite build environment or runtime backend API (/api/firebase-config)
export async function initFirebase(): Promise<boolean> {
  let cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  };

  // If not configured in Vite env, fetch dynamically from server environment variables (/api/firebase-config)
  if (!cfg.apiKey || !cfg.projectId) {
    try {
      const res = await fetch('/api/firebase-config');
      if (res.ok) {
        const remoteCfg = await res.json();
        if (remoteCfg.apiKey && remoteCfg.projectId) {
          cfg = remoteCfg;
        }
      }
    } catch {
      // Offline or local dev fallback
    }
  }

  if (cfg.apiKey && cfg.projectId) {
    if (!getApps().length) {
      app = initializeApp(cfg);
    } else {
      app = getApp();
    }
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseConfigured = true;
    return true;
  }

  isFirebaseConfigured = false;
  return false;
}

export async function loginWithGoogle(): Promise<User | null> {
  if (!auth) {
    const ok = await initFirebase();
    if (!ok || !auth) {
      throw new Error("Firebase is not configured. Please add your credentials in HOKAS environment variables or .env");
    }
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

  const filteredNames = (current.recentBotNames || []).filter(name => name.toLowerCase() !== botName.toLowerCase());
  const updatedBotNames = [botName, ...filteredNames].slice(0, 3);

  const existingServers = current.recentServerIps || (current.recentServerIp ? [current.recentServerIp] : []);
  const filteredServers = existingServers.filter(ip => ip.toLowerCase() !== serverIp.toLowerCase());
  const updatedServers = [serverIp, ...filteredServers].slice(0, 3);

  const updated: UserProfile = {
    ...current,
    recentBotNames: updatedBotNames,
    recentServerIp: serverIp,
    recentServerIps: updatedServers,
    updatedAt: Date.now(),
  };

  await saveUserProfile(updated);
}
