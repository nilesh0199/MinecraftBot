/**
 * Local Profile & Session Storage for CraftBot (Zero-Auth Cloud Architecture)
 * Persists Owner IGN, recent server addresses, and bot usernames locally in browser
 */

export interface UserProfile {
  displayName: string;
  ownerIgn: string;
  recentBotNames: string[];
  recentServerIp: string;
  recentServerIps: string[];
}

const STORAGE_KEY = 'craftbot_user_profile_v2';

const DEFAULT_PROFILE: UserProfile = {
  displayName: 'Commander',
  ownerIgn: 'Player',
  recentBotNames: ['Bot999', 'AFKBOT'],
  recentServerIp: '',
  recentServerIps: [],
};

export const getUserProfile = (): UserProfile => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        displayName: parsed.displayName || DEFAULT_PROFILE.displayName,
        ownerIgn: parsed.ownerIgn || DEFAULT_PROFILE.ownerIgn,
        recentBotNames: Array.isArray(parsed.recentBotNames) ? parsed.recentBotNames : DEFAULT_PROFILE.recentBotNames,
        recentServerIp: parsed.recentServerIp || '',
        recentServerIps: Array.isArray(parsed.recentServerIps) ? parsed.recentServerIps : [],
      };
    }
  } catch (e) {
    console.warn('Failed to read profile from localStorage:', e);
  }
  return { ...DEFAULT_PROFILE };
};

export const saveUserProfile = (profile: Partial<UserProfile>): UserProfile => {
  try {
    const current = getUserProfile();
    const updated: UserProfile = {
      ...current,
      ...profile,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn('Failed to save profile to localStorage:', e);
    return { ...DEFAULT_PROFILE, ...profile };
  }
};

export const recordBotUsage = (botUsername: string, serverAddress: string): void => {
  try {
    const profile = getUserProfile();
    const botNames = [botUsername, ...(profile.recentBotNames || [])]
      .filter((name, idx, arr) => name && arr.indexOf(name) === idx)
      .slice(0, 5);

    const cleanAddress = serverAddress.trim();
    let recentServerIps = profile.recentServerIps || [];
    if (cleanAddress && !cleanAddress.toLowerCase().startsWith('localhost')) {
      recentServerIps = [cleanAddress, ...recentServerIps.filter(ip => ip.toLowerCase() !== cleanAddress.toLowerCase())].slice(0, 10);
    }

    saveUserProfile({
      recentBotNames: botNames,
      recentServerIp: cleanAddress,
      recentServerIps,
    });
  } catch (e) {
    console.warn('Failed to record bot usage:', e);
  }
};

export const removeRecentServer = (serverAddress: string): void => {
  try {
    const profile = getUserProfile();
    const lower = serverAddress.toLowerCase();
    const updated = (profile.recentServerIps || []).filter(ip => ip.toLowerCase() !== lower);
    saveUserProfile({
      recentServerIps: updated,
      recentServerIp: profile.recentServerIp.toLowerCase() === lower ? (updated[0] || '') : profile.recentServerIp,
    });
  } catch (e) {}
};

export const clearAllRecentServers = (): void => {
  try {
    saveUserProfile({
      recentServerIps: [],
      recentServerIp: '',
    });
  } catch (e) {}
};
