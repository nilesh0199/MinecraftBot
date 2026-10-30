import { useState, useEffect } from 'react';
import { 
  initFirebase,
  auth, 
  loginWithGoogle, 
  getUserProfile, 
  saveUserProfile, 
  type UserProfile, 
  isFirebaseConfigured 
} from './firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { LandingPage } from './components/landing/LandingPage';
import { OnboardingModal } from './components/onboarding/OnboardingModal';
import { Dashboard } from './components/dashboard/Dashboard';
import { MaceSmashAnimation } from './components/animations/MaceSmashAnimation';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showMaceEntrance, setShowMaceEntrance] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Helper to obtain secure signed session token from backend
  const fetchSessionToken = async (uid: string, ownerIgn: string) => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
      const res = await fetch(`${backendUrl}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, ownerIgn }),
      });
      if (res.ok) {
        const data = await res.json();
        setSessionToken(data.token);
      }
    } catch (e) {
      console.warn('Could not fetch signed session token, falling back to direct UID', e);
    }
  };

  // Monitor Firebase Auth State
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    async function init() {
      const configured = await initFirebase();
      if (configured && auth) {
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          setCurrentUser(user);
          if (user) {
            try {
              const profile = await getUserProfile(user.uid);
              if (profile && profile.ownerIgn) {
                setUserProfile(profile);
                setShowOnboarding(false);
                fetchSessionToken(user.uid, profile.ownerIgn);
              } else {
                // New user or missing owner IGN -> show onboarding
                setUserProfile(profile || {
                  uid: user.uid,
                  email: user.email,
                  displayName: user.displayName || 'Minecraft Player',
                  ownerIgn: '',
                  recentBotNames: [],
                  recentServerIp: 'localhost:25565',
                });
                setShowOnboarding(true);
              }
            } catch (err: any) {
              console.error('Error fetching profile:', err);
            }
          } else {
            setUserProfile(null);
            setShowOnboarding(false);
          }
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }

    init();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Handle Google Login with 1.21 Mace Smash Entrance Animation!
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);

    if (!isFirebaseConfigured) {
      // Demo Mode Fallback for local testing
      const demoUid = 'demo_user_123';
      const cached = localStorage.getItem(`profile_${demoUid}`);
      const profile: UserProfile = cached ? JSON.parse(cached) : {
        uid: demoUid,
        email: 'demo@example.com',
        displayName: 'Nilesh',
        ownerIgn: 'Nilesh_Gamer',
        recentBotNames: ['FarmerBob', 'Nilesh_AFK'],
        recentServerIp: 'localhost:25565',
      };

      setCurrentUser({
        uid: demoUid,
        email: 'demo@example.com',
        displayName: 'Nilesh',
      } as any);

      setUserProfile(profile);
      setShowOnboarding(!profile.ownerIgn);
      fetchSessionToken(demoUid, profile.ownerIgn);

      // Trigger the iconic 1.21 Mace Smash jump and hit!
      setShowMaceEntrance(true);
      setIsLoggingIn(false);
      return;
    }

    try {
      const user = await loginWithGoogle();
      if (user) {
        setShowMaceEntrance(true);
      }
    } catch (err: any) {
      console.warn('Login error:', err);
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/user-cancelled') {
        setAuthError('Sign-in window was closed or cancelled. Please click "Sign in with Google" again.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('Pop-up was blocked by browser. Please allow popups or disable Brave Shields for this page.');
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError('Domain not authorized. Add minecraftbot-yki0.onrender.com to Firebase Console > Authentication > Authorized Domains.');
      } else {
        setAuthError(err.message || 'Failed to sign in with Google');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle saving onboarding profile (Display Name + Owner IGN)
  const handleSaveProfile = async (displayName: string, ownerIgn: string) => {
    if (!currentUser && !userProfile) return;
    setIsSavingProfile(true);

    const updated: UserProfile = {
      uid: currentUser?.uid || userProfile?.uid || 'user_1',
      email: currentUser?.email || userProfile?.email || null,
      displayName,
      ownerIgn,
      recentBotNames: userProfile?.recentBotNames || [],
      recentServerIp: userProfile?.recentServerIp || 'localhost:25565',
    };

    try {
      await saveUserProfile(updated);
      setUserProfile(updated);
      setShowOnboarding(false);
      fetchSessionToken(updated.uid, ownerIgn);
      setShowMaceEntrance(true); // Mace hit celebration upon profile setup!
    } catch (err: any) {
      console.error('Error saving profile:', err);
      throw err;
    } finally {
      setIsSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0e12] flex flex-col items-center justify-center text-slate-300 font-pixel text-xs">
        <div className="w-12 h-12 bg-mc-panel border-2 border-mc-border flex items-center justify-center rounded mb-4 animate-bounce">
          <span>🟩</span>
        </div>
        <p>Loading CraftBot 24/7...</p>
      </div>
    );
  }

  // Not logged in -> Show Landing Page
  if (!currentUser && !userProfile) {
    return (
      <LandingPage
        onLogin={handleLogin}
        isLoggingIn={isLoggingIn}
        error={authError}
      />
    );
  }

  // Logged in -> Show Dashboard (with entrance Mace Smash if active)
  return (
    <>
      {showMaceEntrance && (
        <MaceSmashAnimation onComplete={() => setShowMaceEntrance(false)} />
      )}

      {userProfile && (
        <Dashboard
          userProfile={userProfile}
          sessionToken={sessionToken}
          onEditProfile={() => setShowOnboarding(true)}
        />
      )}

      {showOnboarding && (
        <OnboardingModal
          initialDisplayName={userProfile?.displayName || currentUser?.displayName || ''}
          onSave={handleSaveProfile}
          isSaving={isSavingProfile}
        />
      )}
    </>
  );
}

export default App;
