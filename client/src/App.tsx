import { useState, useEffect } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { MaceSmashAnimation } from './components/animations/MaceSmashAnimation';
import { getUserProfile, saveUserProfile, type UserProfile } from './utils/storage';

export function App() {
  const [userProfile, setUserProfile] = useState<UserProfile>(getUserProfile);
  const [showMaceEntrance, setShowMaceEntrance] = useState(false);

  useEffect(() => {
    const profile = getUserProfile();
    setUserProfile(profile);
  }, []);

  const handleUpdateOwnerIgn = (newIgn: string) => {
    const updated = saveUserProfile({ ownerIgn: newIgn });
    setUserProfile(updated);
  };

  return (
    <>
      {showMaceEntrance && (
        <MaceSmashAnimation onComplete={() => setShowMaceEntrance(false)} />
      )}

      <Dashboard
        userProfile={userProfile}
        onUpdateOwnerIgn={handleUpdateOwnerIgn}
        onTriggerMace={() => setShowMaceEntrance(true)}
      />
    </>
  );
}

export default App;
