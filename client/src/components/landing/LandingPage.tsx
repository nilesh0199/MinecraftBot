import React, { useState } from 'react';
import { 
  ShieldCheck, 
  MessageSquare, 
  Repeat, 
  Sword, 
  Package, 
  Clock, 
  Lock, 
  Sparkles,
  Zap
} from 'lucide-react';
import { MaceSmashAnimation } from '../animations/MaceSmashAnimation';

interface LandingPageProps {
  onLogin: () => void;
  isLoggingIn: boolean;
  error?: string | null;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, isLoggingIn, error }) => {
  const [showMaceDemo, setShowMaceDemo] = useState(false);

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0d0e12] overflow-x-hidden selection:bg-mc-green selection:text-black">
      {/* 1.21 Mace Smash Modal if triggered */}
      {showMaceDemo && (
        <MaceSmashAnimation onComplete={() => setShowMaceDemo(false)} />
      )}

      {/* Background Minecraft grid effect */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #383b45 1px, transparent 1px),
            linear-gradient(to bottom, #383b45 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px'
        }}
      />

      {/* Navigation Header */}
      <header className="relative z-10 border-b border-mc-border bg-[#14151b]/90 backdrop-blur-md px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#252830] border-2 border-mc-border shadow-mc-slot flex items-center justify-center rounded">
              <span className="text-xl">🟩</span>
            </div>
            <div>
              <h1 className="font-pixel text-sm text-slate-100 flex items-center gap-2">
                CraftBot <span className="text-mc-green text-[10px] bg-mc-green/10 px-2 py-0.5 border border-mc-green/30 rounded">24/7 Cloud</span>
              </h1>
              <p className="text-xs text-slate-400">Headless Minecraft AFK Farming System</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Interactive Mace Smash Demo Button */}
            <button
              onClick={() => setShowMaceDemo(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-pixel bg-[#22242e] hover:bg-[#2c303f] border border-mc-diamond/40 text-mc-diamond rounded shadow-sm transition-all cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>1.21 Mace Smash</span>
            </button>

            <button
              onClick={onLogin}
              disabled={isLoggingIn}
              className="mc-btn-green flex items-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>{isLoggingIn ? 'Authenticating...' : 'Sign in with Google'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 max-w-5xl mx-auto px-6 pt-16 pb-20 flex flex-col items-center text-center">
        {/* Top Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-mc-panel border border-mc-border text-mc-diamond text-xs font-mono uppercase tracking-wider rounded mb-6 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-mc-diamond animate-pulse" />
          <span>Cracked & Offline Server Optimized • 24/7 Always Online</span>
        </div>

        {/* Main Headline */}
        <h2 className="font-pixel text-2xl md:text-4xl text-slate-100 tracking-wide leading-tight max-w-3xl mb-6">
          NEVER TURN OFF YOUR PC FOR <span className="text-mc-green underline decoration-mc-green/40">AFK FARMS</span> AGAIN
        </h2>

        <p className="text-slate-300 text-base md:text-lg max-w-2xl font-normal leading-relaxed mb-10">
          Deploy headless cloud bots that keep mob grinders running, load mob chunks, auto-eat food, and deposit loot into chests. Control everything from your browser or your phone.
        </p>

        {/* Call to action & Error notification */}
        <div className="flex flex-col items-center gap-3 mb-16">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={onLogin}
              disabled={isLoggingIn}
              className="mc-btn-green text-sm md:text-base py-4 px-8 flex items-center gap-3 shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-transform"
            >
              <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center text-black font-bold text-xs">
                G
              </div>
              <span>{isLoggingIn ? 'Connecting to Google...' : 'Launch Dashboard with Google'}</span>
            </button>

            <button
              onClick={() => setShowMaceDemo(true)}
              className="mc-btn text-sm md:text-base py-4 px-6 flex items-center gap-2.5 bg-[#1e2029] hover:bg-[#282a36] border border-mc-diamond/50 text-mc-diamond shadow-lg transition-transform hover:scale-[1.02]"
            >
              <Zap className="w-4 h-4 fill-current text-mc-diamond" />
              <span>Preview 1.21 Mace Smash</span>
            </button>
          </div>

          {error && (
            <div className="mt-2 text-xs font-mono text-mc-red bg-mc-red/10 border border-mc-red/30 px-4 py-2 rounded">
              ⚠️ {error}
            </div>
          )}

          <p className="text-xs text-slate-500 font-mono mt-2">
            Free & Open Source • Designed to run 24/7 on Oracle Cloud Free Tier
          </p>
        </div>

        {/* Mock Bot Status Card Preview */}
        <div className="w-full max-w-3xl mc-panel p-6 mb-20 text-left border-2 border-mc-border shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-mc-green via-mc-diamond to-mc-gold" />
          
          <div className="flex flex-wrap items-center justify-between border-b border-mc-border pb-4 mb-4 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-mc-green animate-ping" />
              <span className="font-pixel text-xs text-slate-200">BOT: Nilesh_AFK</span>
              <span className="text-[10px] font-mono text-slate-400 bg-[#121318] px-2 py-0.5 border border-mc-border rounded">
                play.mycraftserver.net:25565
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-mc-green bg-mc-green/10 border border-mc-green/30 px-2 py-0.5 rounded">
                ● 24h 12m Online
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs text-slate-300">
            <div className="bg-[#121318] p-3 border border-mc-border rounded">
              <div className="text-slate-500 text-[10px] uppercase mb-1">Health & Hunger</div>
              <div className="text-mc-red flex items-center gap-1 font-bold">
                ❤️❤️❤️❤️❤️❤️❤️❤️❤️❤️
              </div>
              <div className="text-mc-gold flex items-center gap-1 font-bold mt-1">
                🍗🍗🍗🍗🍗🍗🍗🍗🍗🍗
              </div>
            </div>

            <div className="bg-[#121318] p-3 border border-mc-border rounded">
              <div className="text-slate-500 text-[10px] uppercase mb-1">Active Farm Modes</div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className="px-1.5 py-0.5 bg-emerald-950/80 text-emerald-400 border border-emerald-800 rounded text-[10px]">
                  ✓ Anti-AFK
                </span>
                <span className="px-1.5 py-0.5 bg-emerald-950/80 text-emerald-400 border border-emerald-800 rounded text-[10px]">
                  ✓ Auto-Eat
                </span>
                <span className="px-1.5 py-0.5 bg-sky-950/80 text-sky-400 border border-sky-800 rounded text-[10px]">
                  ⚔️ Auto-Attack
                </span>
              </div>
            </div>

            <div className="bg-[#121318] p-3 border border-mc-border rounded">
              <div className="text-slate-500 text-[10px] uppercase mb-1">Live In-Game Chat</div>
              <div className="text-[11px] text-slate-300 truncate">
                <span className="text-mc-diamond">[Nilesh_Gamer]</span> !bot follow
              </div>
              <div className="text-[11px] text-mc-green truncate mt-1">
                <span className="text-slate-500">[Bot]</span> Following Nilesh_Gamer
              </div>
            </div>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="w-full">
          <div className="text-center mb-10">
            <h3 className="font-pixel text-lg text-slate-100 uppercase tracking-wide">
              Built Specifically for Survival & Farming
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-2">
              All tools required to maintain automated farms effortlessly
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="mc-panel p-5 border border-mc-border hover:border-mc-green/50 transition-colors">
              <div className="w-10 h-10 bg-mc-green/10 border border-mc-green/30 flex items-center justify-center rounded mb-4">
                <Sword className="w-5 h-5 text-mc-green" />
              </div>
              <h4 className="font-pixel text-xs text-slate-100 mb-2">Mob Grinder Auto-Clicker</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Automatically swings weapons at falling mobs (Enderman, Blaze, Skeleton) on optimal sweep cooldowns.
              </p>
            </div>

            <div className="mc-panel p-5 border border-mc-border hover:border-mc-diamond/50 transition-colors">
              <div className="w-10 h-10 bg-mc-diamond/10 border border-mc-diamond/30 flex items-center justify-center rounded mb-4">
                <Package className="w-5 h-5 text-mc-diamond" />
              </div>
              <h4 className="font-pixel text-xs text-slate-100 mb-2">Visual Inventory & Toss</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                View your bot's 9x4 inventory in real time. Click any item to equip it, drop one, or toss full stacks.
              </p>
            </div>

            <div className="mc-panel p-5 border border-mc-border hover:border-mc-gold/50 transition-colors">
              <div className="w-10 h-10 bg-mc-gold/10 border border-mc-gold/30 flex items-center justify-center rounded mb-4">
                <Repeat className="w-5 h-5 text-mc-gold" />
              </div>
              <h4 className="font-pixel text-xs text-slate-100 mb-2">Smart Anti-AFK & Auto-Eat</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Cycles random micro-angles, sneaks, and jumps to bypass server kickers, and feeds itself whenever hunger drops.
              </p>
            </div>

            <div className="mc-panel p-5 border border-mc-border hover:border-mc-green/50 transition-colors">
              <div className="w-10 h-10 bg-mc-green/10 border border-mc-green/30 flex items-center justify-center rounded mb-4">
                <MessageSquare className="w-5 h-5 text-mc-green" />
              </div>
              <h4 className="font-pixel text-xs text-slate-100 mb-2">Bidirectional Live Chat</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Read Minecraft server chat live in your browser and send messages into the game seamlessly.
              </p>
            </div>

            <div className="mc-panel p-5 border border-mc-border hover:border-mc-diamond/50 transition-colors">
              <div className="w-10 h-10 bg-mc-diamond/10 border border-mc-diamond/30 flex items-center justify-center rounded mb-4">
                <ShieldCheck className="w-5 h-5 text-mc-diamond" />
              </div>
              <h4 className="font-pixel text-xs text-slate-100 mb-2">In-Game Owner Commands</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Control the bot directly in Minecraft chat or via whisper (`!bot leave`, `!bot follow`). Only authorized player IGNs are obeyed.
              </p>
            </div>

            <div className="mc-panel p-5 border border-mc-border hover:border-mc-gold/50 transition-colors">
              <div className="w-10 h-10 bg-mc-gold/10 border border-mc-gold/30 flex items-center justify-center rounded mb-4">
                <Clock className="w-5 h-5 text-mc-gold" />
              </div>
              <h4 className="font-pixel text-xs text-slate-100 mb-2">Auto-Disconnect Timers</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Set a runtime timer (e.g. 2 hours). The bot stays online even with browser tabs closed and cleanly leaves when time expires.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-mc-border bg-[#101115] py-8 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© 2024 CraftBot 24/7. Not an official Minecraft product. Not approved by or associated with Mojang.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Oracle Cloud Ready</span>
            <span>•</span>
            <span>Cracked & Offline</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
