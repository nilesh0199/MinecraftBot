import React, { useState } from 'react';
import { User, Shield, CheckCircle, Info } from 'lucide-react';

interface OnboardingModalProps {
  initialDisplayName?: string;
  onSave: (displayName: string, ownerIgn: string) => Promise<void>;
  isSaving: boolean;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  initialDisplayName = '',
  onSave,
  isSaving,
}) => {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [ownerIgn, setOwnerIgn] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Please enter a display name for your dashboard account.');
      return;
    }
    if (!ownerIgn.trim()) {
      setError('Please enter your Minecraft in-game username.');
      return;
    }
    // Minecraft usernames are 3-16 chars, letters/numbers/underscores
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(ownerIgn.trim())) {
      setError('Minecraft username must be 3-16 characters long and contain only letters, numbers, and underscores.');
      return;
    }

    try {
      setError(null);
      await onSave(displayName.trim(), ownerIgn.trim());
    } catch (err: any) {
      setError(err?.message || 'Failed to save profile. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md mc-panel p-6 border-2 border-mc-border relative shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 border-b border-mc-border pb-4 mb-5">
          <div className="w-10 h-10 bg-mc-green/20 border border-mc-green/40 flex items-center justify-center rounded">
            <Shield className="w-5 h-5 text-mc-green" />
          </div>
          <div>
            <h3 className="font-pixel text-sm text-slate-100">Setup Bot Ownership</h3>
            <p className="text-xs text-slate-400 font-mono">Welcome to CraftBot 24/7</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Display Name */}
          <div>
            <label className="block text-xs font-mono uppercase text-slate-300 mb-1">
              Account Display Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Nilesh"
                className="w-full bg-[#121318] border border-mc-border px-3 py-2.5 text-sm text-slate-100 rounded focus:border-mc-green focus:outline-none font-sans"
              />
              <User className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              This name will be visible to your friends on this dashboard.
            </p>
          </div>

          {/* Minecraft Owner Username */}
          <div>
            <label className="block text-xs font-mono uppercase text-slate-300 mb-1">
              Your Minecraft Username (Owner IGN)
            </label>
            <div className="relative">
              <input
                type="text"
                value={ownerIgn}
                onChange={(e) => setOwnerIgn(e.target.value)}
                placeholder="e.g. Nilesh_Gamer"
                className="w-full bg-[#121318] border border-mc-border px-3 py-2.5 text-sm text-mc-diamond rounded focus:border-mc-diamond focus:outline-none font-mono"
              />
              <span className="absolute right-3 top-2.5 text-xs">🎮</span>
            </div>
            
            {/* Explanatory callout */}
            <div className="mt-2 p-2.5 bg-[#141822] border border-blue-900/50 rounded flex items-start gap-2 text-[11px] text-blue-300">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span>
                <strong>Crucial:</strong> Your bot uses this IGN to know who owns it. It will only obey in-game chat and whisper commands (like <code>!leave</code> or <code>!follow</code>) when typed by this player.
              </span>
            </div>
          </div>

          {error && (
            <div className="p-2.5 bg-red-950/60 border border-red-800 rounded text-xs text-red-300 font-mono">
              ⚠️ {error}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full mc-btn-green py-3 flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isSaving ? 'Saving Profile...' : 'Save & Enter Dashboard'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
