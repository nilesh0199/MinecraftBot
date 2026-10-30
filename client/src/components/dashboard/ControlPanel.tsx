import React, { useState } from 'react';
import { 
  Footprints, 
  Clock, 
  Power, 
  Utensils, 
  RotateCcw, 
  Sword, 
  Terminal
} from 'lucide-react';

interface ControlPanelProps {
  ownerIgn: string;
  botUsername: string;
  antiAfk: boolean;
  autoEat: boolean;
  autoAttack: boolean;
  activeTimerRemaining?: number | null; // seconds
  onToggleAntiAfk: (enabled: boolean) => void;
  onToggleAutoEat: (enabled: boolean) => void;
  onToggleAutoAttack: (enabled: boolean) => void;
  onFollowPlayer: (playerName: string) => void;
  onStopFollow: () => void;
  onSetTimer: (minutes: number) => void;
  onCancelTimer: () => void;
  onDisconnect: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  ownerIgn,
  botUsername,
  antiAfk,
  autoEat,
  autoAttack,
  activeTimerRemaining,
  onToggleAntiAfk,
  onToggleAutoEat,
  onToggleAutoAttack,
  onFollowPlayer,
  onStopFollow,
  onSetTimer,
  onCancelTimer,
  onDisconnect,
}) => {
  const [targetPlayer, setTargetPlayer] = useState(ownerIgn);
  const [customMinutes, setCustomMinutes] = useState('60');

  const handleFollowSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPlayer.trim()) return;
    onFollowPlayer(targetPlayer.trim());
  };

  const handleTimerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = parseInt(customMinutes, 10);
    if (!isNaN(mins) && mins > 0) {
      onSetTimer(mins);
    }
  };

  // Format timer
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  return (
    <div className="mc-panel p-4 border border-mc-border shadow-lg space-y-4">
      <div className="flex items-center justify-between border-b border-mc-border pb-3">
        <h4 className="font-pixel text-xs text-slate-100 flex items-center gap-2">
          <span>⚡</span> Action & Automation Center
        </h4>
        <button
          onClick={onDisconnect}
          className="mc-btn-red py-1 px-3 text-[10px] flex items-center gap-1.5 cursor-pointer"
        >
          <Power className="w-3.5 h-3.5" />
          <span>Disconnect Bot</span>
        </button>
      </div>

      {/* Follow Player Section */}
      <div className="bg-[#121318] p-3 border border-mc-border rounded">
        <div className="flex items-center gap-1.5 text-xs font-mono uppercase text-slate-300 mb-2">
          <Footprints className="w-4 h-4 text-mc-diamond" />
          <span>Follow Player (Pathfinder)</span>
        </div>
        <form onSubmit={handleFollowSubmit} className="flex gap-2">
          <input
            type="text"
            value={targetPlayer}
            onChange={(e) => setTargetPlayer(e.target.value)}
            placeholder="Target Player IGN"
            className="flex-1 bg-[#181921] border border-mc-border px-3 py-1.5 text-xs text-slate-200 rounded focus:border-mc-green focus:outline-none font-mono"
          />
          <button
            type="submit"
            className="mc-btn-green py-1.5 px-3 text-xs cursor-pointer"
          >
            Follow
          </button>
          <button
            type="button"
            onClick={onStopFollow}
            className="mc-btn py-1.5 px-3 text-xs cursor-pointer"
          >
            Stop
          </button>
        </form>
      </div>

      {/* Automation Switches */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {/* Anti-AFK Switch */}
        <div
          onClick={() => onToggleAntiAfk(!antiAfk)}
          className={`p-3 border rounded cursor-pointer transition-all ${
            antiAfk
              ? 'bg-emerald-950/30 border-emerald-700/80'
              : 'bg-[#121318] border-mc-border opacity-70'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-pixel text-[10px] text-slate-200 flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5 text-mc-green" /> Anti-AFK
            </span>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                antiAfk
                  ? 'bg-mc-green text-black font-bold border-mc-green'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {antiAfk ? 'ON' : 'OFF'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">
            Jiggles yaw/pitch & sneak cycles
          </p>
        </div>

        {/* Auto-Eat Switch */}
        <div
          onClick={() => onToggleAutoEat(!autoEat)}
          className={`p-3 border rounded cursor-pointer transition-all ${
            autoEat
              ? 'bg-emerald-950/30 border-emerald-700/80'
              : 'bg-[#121318] border-mc-border opacity-70'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-pixel text-[10px] text-slate-200 flex items-center gap-1.5">
              <Utensils className="w-3.5 h-3.5 text-mc-gold" /> Auto-Eat
            </span>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                autoEat
                  ? 'bg-mc-green text-black font-bold border-mc-green'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {autoEat ? 'ON' : 'OFF'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">
            Eats food when hunger &lt; 14
          </p>
        </div>

        {/* Auto-Attack / Mob Farm Switch */}
        <div
          onClick={() => onToggleAutoAttack(!autoAttack)}
          className={`p-3 border rounded cursor-pointer transition-all ${
            autoAttack
              ? 'bg-emerald-950/30 border-emerald-700/80'
              : 'bg-[#121318] border-mc-border opacity-70'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-pixel text-[10px] text-slate-200 flex items-center gap-1.5">
              <Sword className="w-3.5 h-3.5 text-mc-diamond" /> Auto-Attack
            </span>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                autoAttack
                  ? 'bg-mc-green text-black font-bold border-mc-green'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {autoAttack ? 'ON' : 'OFF'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">
            Attacks mobs within 3 blocks
          </p>
        </div>
      </div>

      {/* Disconnect Timer */}
      <div className="bg-[#121318] p-3 border border-mc-border rounded">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-mono uppercase text-slate-300">
            <Clock className="w-4 h-4 text-mc-gold" />
            <span>Auto-Disconnect Timer</span>
          </div>

          {activeTimerRemaining ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-mc-gold animate-pulse">
                Leaves in {formatTimer(activeTimerRemaining)}
              </span>
              <button
                onClick={onCancelTimer}
                className="text-[10px] font-mono text-red-400 hover:text-red-300 underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <span className="text-[10px] font-mono text-slate-500">No active timer</span>
          )}
        </div>

        <form onSubmit={handleTimerSubmit} className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="1440"
            value={customMinutes}
            onChange={(e) => setCustomMinutes(e.target.value)}
            placeholder="Minutes"
            className="w-24 bg-[#181921] border border-mc-border px-2.5 py-1.5 text-xs text-slate-200 rounded focus:border-mc-green focus:outline-none font-mono"
          />
          <span className="text-xs font-mono text-slate-400">minutes</span>
          
          <button
            type="submit"
            className="mc-btn-gold py-1.5 px-3 text-xs cursor-pointer ml-auto"
          >
            Set Timer
          </button>
        </form>
      </div>

      {/* In-Game Command Cheatsheet */}
      <div className="p-2.5 bg-[#101115] border border-mc-border rounded text-[11px] font-mono text-slate-400">
        <div className="text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-mc-green" />
          <span>In-Game Commands (Only authorized for &lt;{ownerIgn}&gt;)</span>
        </div>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <div><code>!leave</code> or <code>/msg {botUsername} leave</code></div>
          <div><code>!follow</code> or <code>/msg {botUsername} follow</code></div>
          <div><code>!stop</code> (halt pathfinding)</div>
          <div><code>!status</code> (whispers health & coords)</div>
        </div>
      </div>
    </div>
  );
};
