import React, { useState } from 'react';
import { 
  Footprints, 
  Clock, 
  Power, 
  Utensils, 
  RotateCcw, 
  Sword, 
  Terminal,
  Bot,
  Moon,
  Sun
} from 'lucide-react';

interface ControlPanelProps {
  ownerIgn: string;
  botUsername: string;
  antiAfk: boolean;
  autoEat: boolean;
  autoAttack: boolean;
  aiChat?: boolean;
  isSleeping?: boolean;
  activeTimerRemaining?: number | null; // seconds
  onToggleAntiAfk: (enabled: boolean) => void;
  onToggleAutoEat: (enabled: boolean) => void;
  onToggleAutoAttack: (enabled: boolean) => void;
  onToggleAiChat?: (enabled: boolean) => void;
  onSleepInBed?: () => void;
  onWakeUp?: () => void;
  onNightSkip?: () => void;
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
  aiChat = true,
  isSleeping = false,
  activeTimerRemaining,
  onToggleAntiAfk,
  onToggleAutoEat,
  onToggleAutoAttack,
  onToggleAiChat,
  onSleepInBed,
  onWakeUp,
  onNightSkip,
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-mc-border pb-3">
        <h4 className="font-pixel text-xs text-slate-100 flex items-center gap-2">
          <span>⚡</span> Action & Automation Center
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          {/* Bed Sleeping Quick Action */}
          {onSleepInBed && (
            <button
              onClick={isSleeping ? onWakeUp : onSleepInBed}
              className={`px-2.5 py-1 text-[11px] font-pixel rounded flex items-center gap-1.5 cursor-pointer shadow transition border ${
                isSleeping
                  ? 'bg-amber-950/80 hover:bg-amber-900 border-amber-600/80 text-amber-200'
                  : 'bg-indigo-950/80 hover:bg-indigo-900 border-indigo-600/80 text-indigo-200'
              }`}
              title={isSleeping ? "Wake up from bed" : "Find nearest bed within 24 blocks and sleep"}
            >
              {isSleeping ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <span>🛏️</span>}
              <span>{isSleeping ? 'Wake Up' : 'Sleep in Bed'}</span>
            </button>
          )}

          {/* Night Skip (1m Leave & Auto-Rejoin) */}
          {onNightSkip && (
            <button
              onClick={onNightSkip}
              className="px-2.5 py-1 text-[11px] font-pixel bg-purple-950/80 hover:bg-purple-900 border border-purple-600/80 text-purple-200 rounded flex items-center gap-1.5 cursor-pointer shadow transition"
              title="Leave for 60 seconds so players can sleep through the night, then auto-rejoin"
            >
              <Moon className="w-3.5 h-3.5 text-purple-300" />
              <span>Night Skip (1m)</span>
            </button>
          )}

          <button
            onClick={onDisconnect}
            className="mc-btn-red py-1 px-3 text-[10px] flex items-center gap-1.5 cursor-pointer"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Disconnect</span>
          </button>
        </div>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
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

        {/* Groq AI Chat Companion Switch */}
        <div
          onClick={() => onToggleAiChat && onToggleAiChat(!aiChat)}
          className={`p-3 border rounded cursor-pointer transition-all ${
            aiChat
              ? 'bg-purple-950/30 border-purple-600/80'
              : 'bg-[#121318] border-mc-border opacity-70'
          }`}
          title="Toggle Groq Llama-3.1 AI Chat Companion"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-pixel text-[10px] text-slate-200 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-purple-400" /> Groq AI Chat
            </span>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                aiChat
                  ? 'bg-purple-500 text-black font-bold border-purple-400'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {aiChat ? 'ON' : 'OFF'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">
            Replies to mentions &amp; !ask
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
      <div className="p-3 bg-[#111217] border-2 border-mc-border rounded text-[11px] font-mono">
        <div className="text-slate-200 font-pixel text-[10px] mb-2 flex items-center justify-between flex-wrap gap-1">
          <span className="flex items-center gap-1.5 text-mc-green">
            <Terminal className="w-3.5 h-3.5" /> In-Game Chat Commands & Mentions
          </span>
          <span className="text-[9px] text-slate-400 font-normal">Mention <strong>@{botUsername}</strong> or type <code>!help</code></span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
          <div className="bg-[#161821] p-2 rounded border border-slate-800 shadow-sm">
            <span className="text-mc-diamond font-pixel text-[9px] block mb-1">🌐 Public (Anyone):</span>
            <div className="text-slate-300 space-y-0.5">
              <div><code>!help</code> or mention <code>@{botUsername}</code> in chat</div>
              <div><code>!sleep</code> (find nearest bed & sleep)</div>
              <div><code>!wake</code> (wake up from bed)</div>
              <div><code>!nightskip</code> (leaves for 1 min so you can sleep, then auto-rejoins)</div>
              <div><code>!ask &lt;msg&gt;</code> (queries Groq AI companion)</div>
              <div><code>!follow</code> / <code>!stop</code> / <code>!status</code></div>
            </div>
          </div>
          <div className="bg-[#161821] p-2 rounded border border-slate-800 shadow-sm">
            <span className="text-mc-gold font-pixel text-[9px] block mb-1">👑 Owner Only (&lt;{ownerIgn}&gt;):</span>
            <div className="text-slate-300 space-y-0.5">
              <div><code>!shutdown bot</code> (safely & permanently turns off bot)</div>
              <div><code>!transfer &lt;PlayerIGN&gt;</code> (transfer bot ownership)</div>
              <div><code>!ai on</code> / <code>!ai off</code> (toggle Groq AI companion)</div>
              <div><code>!dropall</code>, <code>!eat</code>, <code>!attack</code></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
