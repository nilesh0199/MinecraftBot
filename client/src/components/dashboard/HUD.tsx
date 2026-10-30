import React, { useState, useEffect, useRef } from 'react';
import { Activity, Compass, MapPin, Wifi, Shield, Copy, Check } from 'lucide-react';
import { sounds } from '../../utils/audio';

export interface BotState {
  status: 'offline' | 'connecting' | 'online' | 'error';
  username: string;
  serverIp: string;
  serverPort: number;
  health: number; // 0 to 20
  food: number;   // 0 to 20
  xpLevel: number;
  xpProgress: number; // 0 to 1
  dimension: string;
  position: { x: number; y: number; z: number };
  ping: number;
  uptimeSeconds: number;
  error?: string | null;
  ownerIgn: string;
  retryInfo?: {
    attempt: number;
    maxAttempts: number;
    nextRetryAt: number;
  } | null;
}

interface HUDProps {
  botState: BotState;
  onRetryConnect?: () => void;
}

export const HUD: React.FC<HUDProps> = ({ botState, onRetryConnect }) => {
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [damageFlash, setDamageFlash] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);
  const prevHealthRef = useRef(botState.health);

  // Live countdown timer for reconnection backoff
  useEffect(() => {
    if (!botState.retryInfo?.nextRetryAt) {
      setCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((botState.retryInfo!.nextRetryAt - Date.now()) / 1000));
      setCountdown(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 500);
    return () => clearInterval(interval);
  }, [botState.retryInfo?.nextRetryAt]);

  // Monitor health drops for damage flash & hurt sound
  useEffect(() => {
    if (botState.health < prevHealthRef.current && botState.status === 'online') {
      sounds.playHurt();
      setDamageFlash(true);
      const timer = setTimeout(() => setDamageFlash(false), 350);
      return () => clearTimeout(timer);
    }
    prevHealthRef.current = botState.health;
  }, [botState.health, botState.status]);

  // Format uptime
  const hours = Math.floor(botState.uptimeSeconds / 3600);
  const minutes = Math.floor((botState.uptimeSeconds % 3600) / 60);
  const seconds = botState.uptimeSeconds % 60;
  const uptimeString = `${hours}h ${minutes}m ${seconds}s`;

  // Latency styling
  const getPingColor = (ping: number) => {
    if (ping <= 60) return 'text-emerald-400 bg-emerald-950/60 border-emerald-800';
    if (ping <= 150) return 'text-amber-400 bg-amber-950/60 border-amber-800';
    return 'text-red-400 bg-red-950/60 border-red-800';
  };

  // Copy coordinates to clipboard
  const handleCopyCoords = () => {
    sounds.playClick();
    const x = Math.round(botState.position.x);
    const y = Math.round(botState.position.y);
    const z = Math.round(botState.position.z);
    const text = `X: ${x}, Y: ${y}, Z: ${z} (${botState.dimension.replace('minecraft:', '')})`;
    navigator.clipboard.writeText(text);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 1800);
  };

  // Render 10 hearts based on health (0 - 20)
  const renderHearts = () => {
    const totalHearts = 10;
    const currentHealth = Math.max(0, Math.min(20, botState.health));
    const hearts = [];

    for (let i = 1; i <= totalHearts; i++) {
      const heartValue = i * 2;
      if (currentHealth >= heartValue) {
        hearts.push(<span key={i} className="text-red-500 select-none text-sm">❤️</span>);
      } else if (currentHealth >= heartValue - 1) {
        hearts.push(<span key={i} className="text-red-400 select-none text-sm opacity-80">💔</span>);
      } else {
        hearts.push(<span key={i} className="text-slate-600 select-none text-sm opacity-40">🖤</span>);
      }
    }
    return hearts;
  };

  // Render 10 hunger drumsticks based on food (0 - 20)
  const renderFood = () => {
    const totalDrumsticks = 10;
    const currentFood = Math.max(0, Math.min(20, botState.food));
    const foodItems = [];

    for (let i = 1; i <= totalDrumsticks; i++) {
      const foodValue = i * 2;
      if (currentFood >= foodValue) {
        foodItems.push(<span key={i} className="text-amber-500 select-none text-sm">🍗</span>);
      } else if (currentFood >= foodValue - 1) {
        foodItems.push(<span key={i} className="text-amber-400 select-none text-sm opacity-75">🦴</span>);
      } else {
        foodItems.push(<span key={i} className="text-slate-600 select-none text-sm opacity-30">🍗</span>);
      }
    }
    return foodItems;
  };

  return (
    <div
      className={`mc-panel p-4 border shadow-lg transition-all duration-150 ${
        damageFlash ? 'border-red-600 ring-2 ring-red-600/50 bg-red-950/20' : 'border-mc-border'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-mc-border pb-3 mb-3">
        {/* Bot Name and Online Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#16171d] border border-mc-border flex items-center justify-center rounded">
            <span className="text-xl">🤖</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-pixel text-xs text-slate-100">{botState.username}</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase ${
                  botState.status === 'online'
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                    : botState.status === 'connecting'
                    ? 'bg-amber-950/80 text-amber-400 border-amber-800 animate-pulse'
                    : 'bg-red-950/80 text-red-400 border-red-800'
                }`}
              >
                ● {botState.status}
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2 mt-0.5">
              <span>{botState.serverIp}:{botState.serverPort}</span>
              <span>•</span>
              <span
                className={`flex items-center gap-1 px-1.5 py-0.2 rounded border text-[10px] ${getPingColor(
                  botState.ping
                )}`}
              >
                <Wifi className="w-3 h-3" />
                {botState.ping}ms
              </span>
              <span>•</span>
              <span className="text-mc-green font-semibold">Uptime: {uptimeString}</span>
            </div>
          </div>
        </div>

        {/* In-Game Owner Whitelist Indicator */}
        <div className="flex items-center gap-2 bg-[#121318] px-3 py-1.5 border border-mc-border rounded text-xs font-mono text-slate-300">
          <Shield className="w-3.5 h-3.5 text-mc-diamond" />
          <span className="text-slate-500">Authorized Controller:</span>
          <span className="text-mc-diamond font-bold">{botState.ownerIgn || 'Not set'}</span>
        </div>
      </div>

      {/* Offline / Reconnecting Status Banner */}
      {(botState.status === 'connecting' || botState.error) && (
        <div
          className={`p-3.5 rounded border mb-4 flex flex-wrap items-center justify-between gap-3 ${
            botState.status === 'connecting'
              ? 'bg-amber-950/60 border-amber-600/70 text-amber-200'
              : 'bg-red-950/60 border-red-600/70 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`w-3 h-3 rounded-full inline-block ${
                botState.status === 'connecting' ? 'bg-amber-400 animate-ping' : 'bg-red-500'
              }`}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-pixel text-xs tracking-wide uppercase">
                  {botState.status === 'connecting' ? 'Reconnecting to Server' : 'Connection Alert'}
                </span>
                {botState.retryInfo && (
                  <span className="font-mono text-[10px] bg-black/50 px-2 py-0.5 rounded border border-amber-500/30 text-amber-300">
                    Attempt {botState.retryInfo.attempt}/{botState.retryInfo.maxAttempts}
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-slate-200 mt-0.5">
                {botState.error || (countdown > 0 ? `Reconnecting in ${countdown}s...` : 'Connecting to server...')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRetryConnect && (
              <button
                onClick={() => {
                  sounds.playClick();
                  onRetryConnect();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 border border-emerald-400 font-pixel text-xs text-emerald-100 rounded shadow-md transition cursor-pointer"
                title="Immediately reconnect without waiting for timer"
              >
                <span>⚡</span> Retry Now
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stats Grid: Health, Hunger, Coords, Dimension */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Health & Hunger */}
        <div className="bg-[#121318] p-3 border border-mc-border rounded">
          <div className="flex justify-between items-center text-[10px] font-mono uppercase text-slate-400 mb-1">
            <span className={damageFlash ? 'text-red-400 font-bold' : ''}>
              Health: {botState.health}/20
            </span>
            <span>Hunger: {botState.food}/20</span>
          </div>
          <div className="flex flex-wrap gap-0.5 mb-1.5">{renderHearts()}</div>
          <div className="flex flex-wrap gap-0.5">{renderFood()}</div>

          {/* XP Bar */}
          <div className="mt-2.5 pt-2 border-t border-mc-border/60">
            <div className="flex justify-between text-[10px] font-mono text-mc-green mb-1">
              <span>XP Level: {botState.xpLevel}</span>
              <span>{Math.round(botState.xpProgress * 100)}%</span>
            </div>
            <div className="w-full bg-[#1e2029] h-1.5 rounded-full overflow-hidden border border-mc-border">
              <div
                className="bg-mc-green h-full transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, botState.xpProgress * 100))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Position & Coordinates with 1-Click Copy */}
        <div
          onClick={handleCopyCoords}
          className="bg-[#121318] hover:bg-[#15161f] p-3 border border-mc-border hover:border-mc-diamond/60 rounded flex flex-col justify-between cursor-pointer group transition-all"
          title="Click to copy coordinates"
        >
          <div>
            <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-400 mb-1">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-mc-diamond" />
                <span>Coordinates</span>
              </span>
              <span className="text-[10px] text-mc-diamond flex items-center gap-1">
                {copiedCoords ? (
                  <>
                    <Check className="w-3 h-3 text-mc-green" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" /> Copy
                  </>
                )}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 font-mono text-xs text-center mt-2">
              <div className="bg-[#181921] p-1.5 border border-mc-border/80 rounded">
                <span className="text-slate-500 text-[10px] block">X</span>
                <span className="text-mc-diamond font-bold">{Math.round(botState.position.x)}</span>
              </div>
              <div className="bg-[#181921] p-1.5 border border-mc-border/80 rounded">
                <span className="text-slate-500 text-[10px] block">Y</span>
                <span className="text-mc-diamond font-bold">{Math.round(botState.position.y)}</span>
              </div>
              <div className="bg-[#181921] p-1.5 border border-mc-border/80 rounded">
                <span className="text-slate-500 text-[10px] block">Z</span>
                <span className="text-mc-diamond font-bold">{Math.round(botState.position.z)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2 pt-2 border-t border-mc-border/60">
            <span className="flex items-center gap-1">
              <Compass className="w-3 h-3 text-mc-gold" /> Dimension:
            </span>
            <span className="text-slate-200 uppercase font-semibold flex items-center gap-1">
              {botState.dimension.includes('nether') ? '🔥 Nether' : botState.dimension.includes('end') ? '🌌 The End' : '🌿 Overworld'}
            </span>
          </div>
        </div>

        {/* Quick Connection Details & Status */}
        <div className="bg-[#121318] p-3 border border-mc-border rounded flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1 text-[10px] font-mono uppercase text-slate-400 mb-2">
              <Activity className="w-3 h-3 text-mc-green" />
              <span>Session Activity</span>
            </div>
            <div className="text-xs font-mono text-slate-300 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Host IP:</span>
                <span className="text-slate-200 truncate max-w-[150px]">{botState.serverIp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Daemon:</span>
                <span className="text-mc-green font-semibold">24/7 Cloud Background</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Shortcuts:</span>
                <span className="text-slate-400 font-mono">Press <code>1-9</code> for hotbar</span>
              </div>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-500 bg-[#15161d] p-1.5 rounded border border-mc-border text-center mt-2">
            Closing this browser tab will NOT disconnect the bot.
          </div>
        </div>
      </div>
    </div>
  );
};
