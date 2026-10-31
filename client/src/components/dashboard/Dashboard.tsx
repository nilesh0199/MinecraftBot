import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { HUD, type BotState } from './HUD';
import { LiveChat, type ChatMessage } from './LiveChat';
import { InventoryView, type InventoryItem } from './InventoryView';
import { ControlPanel } from './ControlPanel';
import { BotLauncher, type BotLaunchConfig } from './BotLauncher';
import { MaceSmashAnimation } from '../animations/MaceSmashAnimation';
import { sounds } from '../../utils/audio';
import { recordBotUsage, type UserProfile } from '../../utils/storage';
import { Settings, Shield, Zap, Volume2, VolumeX, Bot as BotIcon, RefreshCw } from 'lucide-react';

export type SlotId = 'bot_1' | 'bot_2';

interface SlotData {
  botState: BotState;
  chatMessages: ChatMessage[];
  inventoryItems: InventoryItem[];
  antiAfk: boolean;
  autoEat: boolean;
  autoAttack: boolean;
  aiChat: boolean;
  timerRemaining: number | null;
  serverAlert: string | null;
  isLaunching: boolean;
}

interface DashboardProps {
  userProfile: UserProfile;
  onUpdateOwnerIgn?: (newIgn: string) => void;
  onTriggerMace?: () => void;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;

export const Dashboard: React.FC<DashboardProps> = ({
  userProfile,
  onUpdateOwnerIgn,
  onTriggerMace,
}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeSlot, setActiveSlot] = useState<SlotId>('bot_1');
  const [showMaceSmash, setShowMaceSmash] = useState(false);
  const [isMuted, setIsMuted] = useState(sounds.isMuted());
  const [isEditingOwner, setIsEditingOwner] = useState(false);
  const [ownerInput, setOwnerInput] = useState(userProfile.ownerIgn || 'Player');

  // Multi-Bot Slots State
  const [slots, setSlots] = useState<Record<SlotId, SlotData>>({
    bot_1: {
      botState: {
        status: 'offline',
        username: userProfile.recentBotNames?.[0] || 'Bot999',
        serverIp: userProfile.recentServerIp || '',
        serverPort: 25565,
        health: 20,
        food: 20,
        xpLevel: 0,
        xpProgress: 0,
        dimension: 'minecraft:overworld',
        position: { x: 0, y: 64, z: 0 },
        ping: 0,
        uptimeSeconds: 0,
        ownerIgn: userProfile.ownerIgn || 'Player',
      },
      chatMessages: [],
      inventoryItems: [],
      antiAfk: true,
      autoEat: true,
      autoAttack: false,
      aiChat: true,
      timerRemaining: null,
      serverAlert: null,
      isLaunching: false,
    },
    bot_2: {
      botState: {
        status: 'offline',
        username: userProfile.recentBotNames?.[1] || 'AFKBOT',
        serverIp: userProfile.recentServerIp || '',
        serverPort: 25565,
        health: 20,
        food: 20,
        xpLevel: 0,
        xpProgress: 0,
        dimension: 'minecraft:overworld',
        position: { x: 0, y: 64, z: 0 },
        ping: 0,
        uptimeSeconds: 0,
        ownerIgn: userProfile.ownerIgn || 'Player',
      },
      chatMessages: [],
      inventoryItems: [],
      antiAfk: true,
      autoEat: true,
      autoAttack: false,
      aiChat: true,
      timerRemaining: null,
      serverAlert: null,
      isLaunching: false,
    },
  });

  const currentSlot = slots[activeSlot];

  // Sound toggle handler
  const toggleSound = () => {
    const nextMuted = sounds.toggleMute();
    setIsMuted(nextMuted);
    if (!nextMuted) {
      sounds.playClick();
    }
  };

  // Global keyboard shortcuts (Press '/' to focus chat)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        const chatInput = document.querySelector('input[placeholder*="Type message"]') as HTMLInputElement;
        if (chatInput) {
          chatInput.focus();
          chatInput.value = '/';
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initialize Socket.io connection (Zero-Auth public access)
  useEffect(() => {
    const s = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => {
      console.log('Connected to CraftBot Public Gateway Socket:', s.id);
    });

    // Initial sync of both slots from backend
    s.on('init-slots', (allSlots: Record<SlotId, any>) => {
      if (!allSlots) return;
      setSlots((prev) => {
        const next = { ...prev };
        for (const id of ['bot_1', 'bot_2'] as SlotId[]) {
          if (allSlots[id]) {
            const raw = allSlots[id];
            next[id] = {
              ...next[id],
              botState: {
                ...next[id].botState,
                ...raw,
              },
            };
          }
        }
        return next;
      });
    });

    // Real-time state update for a specific slot
    s.on('bot-state', (state: Partial<BotState> & { slotId?: SlotId }) => {
      const targetSlot = state.slotId || 'bot_1';
      setSlots((prev) => {
        const prevSlot = prev[targetSlot];
        const wasOnline = prevSlot.botState.status === 'online';
        const isNowOnline = state.status === 'online';

        // Trigger celebratory 1.21 Mace Smash entrance when bot connects!
        if (!wasOnline && isNowOnline) {
          setShowMaceSmash(true);
        }

        return {
          ...prev,
          [targetSlot]: {
            ...prevSlot,
            isLaunching: (state.status === 'online' || state.status === 'offline' || state.status === 'error') ? false : prevSlot.isLaunching,
            botState: {
              ...prevSlot.botState,
              ...state,
            },
            aiChat: typeof state.isAiChatActive === 'boolean' ? state.isAiChatActive : prevSlot.aiChat,
          },
        };
      });
    });

    // In-Game chat messages
    s.on('chat-message', (msg: ChatMessage & { slotId?: SlotId }) => {
      const targetSlot = msg.slotId || 'bot_1';
      setSlots((prev) => {
        const prevSlot = prev[targetSlot];
        const prevMsgs = prevSlot.chatMessages;
        if (prevMsgs.length > 0) {
          const last = prevMsgs[prevMsgs.length - 1];
          if (last.text === msg.text && Math.abs(msg.timestamp - last.timestamp) < 1000) {
            return prev;
          }
        }
        return {
          ...prev,
          [targetSlot]: {
            ...prevSlot,
            chatMessages: [...prevMsgs.slice(-150), msg],
          },
        };
      });
    });

    // Inventory updates
    s.on('inventory-update', (data: { slotId?: SlotId; items?: InventoryItem[] } | InventoryItem[]) => {
      const targetSlot = (Array.isArray(data) ? 'bot_1' : data.slotId) || 'bot_1';
      const items = Array.isArray(data) ? data : (data.items || []);
      setSlots((prev) => ({
        ...prev,
        [targetSlot]: {
          ...prev[targetSlot],
          inventoryItems: items,
        },
      }));
    });

    // Auto-Disconnect timer update
    s.on('timer-update', (data: { slotId?: SlotId; remainingSeconds: number | null } | number | null) => {
      const targetSlot = (typeof data === 'object' && data !== null && 'slotId' in data) ? (data.slotId || 'bot_1') : 'bot_1';
      const seconds = (typeof data === 'object' && data !== null && 'remainingSeconds' in data) ? data.remainingSeconds : (data as number | null);
      setSlots((prev) => ({
        ...prev,
        [targetSlot]: {
          ...prev[targetSlot],
          timerRemaining: seconds,
        },
      }));
    });

    // Bot error alerts
    s.on('bot-error', (data: { slotId?: SlotId; error?: string } | string) => {
      const targetSlot = (typeof data === 'object' && data.slotId) ? data.slotId : 'bot_1';
      const errorMsg = typeof data === 'object' ? (data.error || 'Bot error') : data;
      setSlots((prev) => ({
        ...prev,
        [targetSlot]: {
          ...prev[targetSlot],
          isLaunching: false,
          serverAlert: errorMsg,
        },
      }));
    });

    // Server offline notifications
    s.on('server-offline', (data: { slotId?: SlotId; serverIp: string; serverPort: number; attempts: number }) => {
      const targetSlot = data.slotId || 'bot_1';
      setSlots((prev) => ({
        ...prev,
        [targetSlot]: {
          ...prev[targetSlot],
          isLaunching: false,
          serverAlert: `Minecraft server at ${data.serverIp}:${data.serverPort} is offline (failed after ${data.attempts} attempts). Click Spawn when server is online.`,
        },
      }));
    });

    // Owner IGN update
    s.on('owner-updated', (data: { slotId?: SlotId; newOwner: string }) => {
      const targetSlot = data.slotId || 'bot_1';
      setSlots((prev) => ({
        ...prev,
        [targetSlot]: {
          ...prev[targetSlot],
          botState: {
            ...prev[targetSlot].botState,
            ownerIgn: data.newOwner,
          },
        },
      }));
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  // Launch Bot Handler for current slot
  const handleLaunchBot = async (config: BotLaunchConfig) => {
    if (!socket) return;
    sounds.playClick();

    setSlots((prev) => ({
      ...prev,
      [activeSlot]: {
        ...prev[activeSlot],
        isLaunching: true,
        serverAlert: null,
        antiAfk: config.antiAfk,
        autoEat: config.autoEat,
        autoAttack: config.autoAttack,
      },
    }));

    recordBotUsage(config.username, `${config.serverIp}:${config.serverPort}`);

    socket.emit('start-bot', {
      slotId: activeSlot,
      ...config,
      ownerIgn: userProfile.ownerIgn || 'Player',
    });
  };

  // Actions for current active bot
  const handleSendMessage = (text: string) => {
    socket?.emit('send-chat', { slotId: activeSlot, text });
  };

  const handleTossItem = (slot: number, count?: number) => {
    socket?.emit('toss-item', { slotId: activeSlot, slot, count });
  };

  const handleEquipItem = (slot: number, destination: string) => {
    socket?.emit('equip-item', { slotId: activeSlot, slot, destination });
  };

  const handleTossAll = () => {
    if (confirm(`Are you sure you want ${currentSlot.botState.username} to toss out all items?`)) {
      socket?.emit('toss-all', { slotId: activeSlot });
    }
  };

  const handleEatItem = (slot: number) => {
    sounds.playClick();
    socket?.emit('eat-item', { slotId: activeSlot, slot });
  };

  const handleUseItem = (slot: number) => {
    sounds.playClick();
    socket?.emit('use-item', { slotId: activeSlot, slot });
  };

  const handleMoveItem = (sourceSlot: number, destSlot: number) => {
    sounds.playClick();
    socket?.emit('move-item', { slotId: activeSlot, sourceSlot, destSlot });
  };

  const handleShareItem = (slot: number) => {
    sounds.playClick();
    socket?.emit('share-item', { slotId: activeSlot, slot });
  };

  const handleFollowPlayer = (target: string) => {
    sounds.playClick();
    socket?.emit('follow-player', { slotId: activeSlot, target });
  };

  const handleStopFollow = () => {
    sounds.playClick();
    socket?.emit('stop-follow', { slotId: activeSlot });
  };

  const handleToggleAntiAfk = (enabled: boolean) => {
    sounds.playClick();
    setSlots((prev) => ({
      ...prev,
      [activeSlot]: { ...prev[activeSlot], antiAfk: enabled },
    }));
    socket?.emit('toggle-anti-afk', { slotId: activeSlot, enabled });
  };

  const handleToggleAutoEat = (enabled: boolean) => {
    sounds.playClick();
    setSlots((prev) => ({
      ...prev,
      [activeSlot]: { ...prev[activeSlot], autoEat: enabled },
    }));
    socket?.emit('toggle-auto-eat', { slotId: activeSlot, enabled });
  };

  const handleToggleAutoAttack = (enabled: boolean) => {
    sounds.playClick();
    setSlots((prev) => ({
      ...prev,
      [activeSlot]: { ...prev[activeSlot], autoAttack: enabled },
    }));
    socket?.emit('toggle-auto-attack', { slotId: activeSlot, enabled });
  };

  const handleToggleAiChat = (enabled: boolean) => {
    sounds.playClick();
    setSlots((prev) => ({
      ...prev,
      [activeSlot]: { ...prev[activeSlot], aiChat: enabled },
    }));
    socket?.emit('toggle-ai-chat', { slotId: activeSlot, enabled });
  };

  const handleSleepInBed = () => {
    sounds.playClick();
    socket?.emit('bot-sleep', { slotId: activeSlot });
  };

  const handleWakeUp = () => {
    sounds.playClick();
    socket?.emit('bot-wake', { slotId: activeSlot });
  };

  const handleNightSkip = () => {
    sounds.playClick();
    socket?.emit('bot-night-skip', { slotId: activeSlot });
  };

  const handleChangeUsername = (newUsername: string) => {
    sounds.playClick();
    socket?.emit('change-bot-username', { slotId: activeSlot, newUsername });
  };

  const handleSetTimer = (minutes: number) => {
    sounds.playClick();
    socket?.emit('set-timer', { slotId: activeSlot, minutes });
  };

  const handleCancelTimer = () => {
    sounds.playClick();
    socket?.emit('cancel-timer', { slotId: activeSlot });
  };

  const handleDisconnectBot = () => {
    sounds.playClick();
    if (confirm(`Disconnect ${currentSlot.botState.username} from the Minecraft server?`)) {
      socket?.emit('stop-bot', { slotId: activeSlot });
      setSlots((prev) => ({
        ...prev,
        [activeSlot]: {
          ...prev[activeSlot],
          botState: {
            ...prev[activeSlot].botState,
            status: 'offline',
          },
          chatMessages: [],
          inventoryItems: [],
        },
      }));
    }
  };

  const handleRetryConnect = () => {
    sounds.playClick();
    setSlots((prev) => ({
      ...prev,
      [activeSlot]: {
        ...prev[activeSlot],
        serverAlert: null,
      },
    }));
    socket?.emit('retry-connect', { slotId: activeSlot });
  };

  const handleSaveOwnerIgn = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = ownerInput.trim();
    if (clean) {
      onUpdateOwnerIgn?.(clean);
      setIsEditingOwner(false);
      sounds.playClick();
    }
  };

  // Helper for Status Badge in Tab
  const renderTabBadge = (slotId: SlotId) => {
    const s = slots[slotId];
    const status = s.botState.status;

    if (status === 'online') {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/80 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          ONLINE
        </span>
      );
    }
    if (status === 'connecting') {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-950 text-amber-300 border border-amber-500/80">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          CONNECTING
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono text-slate-400 bg-slate-900 border border-slate-700">
        <span className="w-2 h-2 rounded-full bg-slate-500" />
        OFFLINE
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#0e0f13] text-slate-100 flex flex-col font-sans selection:bg-mc-green selection:text-black">
      {/* 1.21 Mace Smash Animation */}
      {showMaceSmash && (
        <MaceSmashAnimation onComplete={() => setShowMaceSmash(false)} />
      )}

      {/* Top Header with Dual-Bot Tabs */}
      <header className="border-b border-mc-border bg-[#14151b] px-3 sm:px-6 py-2.5 sticky top-0 z-30 shadow-md">
        <div className="w-full max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-3">
          
          {/* Logo & Dual Bot Tabs */}
          <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-[#252830] border border-mc-border flex items-center justify-center rounded">
                <span className="text-base">🟩</span>
              </div>
              <div>
                <h1 className="font-pixel text-xs text-slate-100 flex items-center gap-1.5">
                  CraftBot
                  <span className="text-[10px] font-mono text-mc-green bg-mc-green/10 px-1.5 py-0.2 rounded border border-mc-green/30">
                    24/7 Dual
                  </span>
                </h1>
              </div>
            </div>

            {/* TWO LARGE HIGH-VISIBILITY SIMULTANEOUS BOT TABS */}
            <div className="flex items-center bg-[#090a0e] p-1.5 rounded-xl border-2 border-mc-border gap-2 shadow-2xl">
              {/* Tab: Bot 1 */}
              <button
                onClick={() => {
                  sounds.playClick();
                  setActiveSlot('bot_1');
                }}
                className={`relative flex items-center gap-3 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg transition-all cursor-pointer font-sans ${
                  activeSlot === 'bot_1'
                    ? 'bg-gradient-to-r from-cyan-950/90 via-[#192231] to-[#141d2b] text-white border-2 border-cyan-400 shadow-lg shadow-cyan-950/60 ring-2 ring-cyan-400/30'
                    : 'bg-[#12141c]/80 text-slate-400 hover:text-slate-100 hover:bg-[#181a24] border-2 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className={`p-1.5 rounded-md border ${activeSlot === 'bot_1' ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'bg-slate-800/60 border-slate-700 text-slate-500'}`}>
                  <BotIcon className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-pixel uppercase tracking-wider text-slate-400">Slot 1</span>
                    {activeSlot === 'bot_1' && (
                      <span className="text-[9px] font-mono font-bold bg-cyan-400 text-black px-1.5 py-0.2 rounded font-black tracking-wider">
                        ACTIVE TAB
                      </span>
                    )}
                  </div>
                  <div className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
                    <span>{slots.bot_1.botState.username || 'Bot 1'}</span>
                  </div>
                </div>
                <div className="ml-1 sm:ml-2">
                  {renderTabBadge('bot_1')}
                </div>
              </button>

              {/* Tab: Bot 2 */}
              <button
                onClick={() => {
                  sounds.playClick();
                  setActiveSlot('bot_2');
                }}
                className={`relative flex items-center gap-3 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg transition-all cursor-pointer font-sans ${
                  activeSlot === 'bot_2'
                    ? 'bg-gradient-to-r from-cyan-950/90 via-[#192231] to-[#141d2b] text-white border-2 border-cyan-400 shadow-lg shadow-cyan-950/60 ring-2 ring-cyan-400/30'
                    : 'bg-[#12141c]/80 text-slate-400 hover:text-slate-100 hover:bg-[#181a24] border-2 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className={`p-1.5 rounded-md border ${activeSlot === 'bot_2' ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'bg-slate-800/60 border-slate-700 text-slate-500'}`}>
                  <BotIcon className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-pixel uppercase tracking-wider text-slate-400">Slot 2</span>
                    {activeSlot === 'bot_2' && (
                      <span className="text-[9px] font-mono font-bold bg-cyan-400 text-black px-1.5 py-0.2 rounded font-black tracking-wider">
                        ACTIVE TAB
                      </span>
                    )}
                  </div>
                  <div className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
                    <span>{slots.bot_2.botState.username || 'Bot 2'}</span>
                  </div>
                </div>
                <div className="ml-1 sm:ml-2">
                  {renderTabBadge('bot_2')}
                </div>
              </button>
            </div>
          </div>

          {/* Right Header Controls: Audio, Mace Trigger, Authorized Controller */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Audio Toggle */}
            <button
              onClick={toggleSound}
              className={`p-1.5 rounded border transition-colors cursor-pointer ${
                isMuted
                  ? 'bg-slate-800 border-slate-700 text-slate-500'
                  : 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
              }`}
              title={isMuted ? 'Sound FX Muted (Click to enable)' : 'Sound FX Active (Click to mute)'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Interactive Mace Smash Trigger */}
            <button
              onClick={() => {
                sounds.playClick();
                setShowMaceSmash(true);
                onTriggerMace?.();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-pixel bg-[#1c1e26] hover:bg-[#252833] border border-mc-diamond/50 text-mc-diamond rounded shadow-sm transition-all cursor-pointer"
            >
              <Zap className="w-3 h-3 fill-current" />
              <span className="hidden sm:inline">1.21 Mace Hit</span>
            </button>

            {/* Authorized Controller (Owner IGN) */}
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300 bg-[#101115] px-3 py-1.5 border border-mc-border rounded">
              <span className="text-slate-500 hidden md:inline">Controller:</span>
              {isEditingOwner ? (
                <form onSubmit={handleSaveOwnerIgn} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={ownerInput}
                    onChange={(e) => setOwnerInput(e.target.value)}
                    maxLength={16}
                    autoFocus
                    className="w-24 px-1.5 py-0.5 bg-black border border-cyan-500 text-cyan-300 rounded font-mono text-xs outline-none"
                  />
                  <button type="submit" className="text-mc-green hover:underline text-[11px]">Save</button>
                  <button type="button" onClick={() => setIsEditingOwner(false)} className="text-slate-500 hover:text-slate-300 text-[11px]">✕</button>
                </form>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-mc-diamond flex items-center gap-1 font-bold">
                    <Shield className="w-3 h-3 text-mc-diamond" /> {userProfile.ownerIgn || 'Player'}
                  </span>
                  <button
                    onClick={() => {
                      sounds.playClick();
                      setOwnerInput(userProfile.ownerIgn || 'Player');
                      setIsEditingOwner(true);
                    }}
                    title="Change Authorized In-Game Controller IGN"
                    className="text-slate-400 hover:text-slate-200 cursor-pointer p-0.5"
                  >
                    <Settings className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Disconnect active bot if online */}
            {currentSlot.botState.status !== 'offline' && (
              <button
                onClick={handleDisconnectBot}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-pixel bg-amber-950/50 hover:bg-amber-900/80 border border-amber-600/70 text-amber-300 hover:text-amber-200 rounded shadow-sm transition-all cursor-pointer"
                title={`Disconnect ${currentSlot.botState.username} and return to launcher`}
              >
                <RefreshCw className="w-3 h-3 text-amber-400" />
                <span>Switch / Stop</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area for the Selected Bot Slot */}
      <main className="flex-1 w-full max-w-[1920px] mx-auto p-3 sm:p-6 space-y-5">
        {currentSlot.botState.status === 'offline' ? (
          /* Current Slot is Offline -> Render Bot Launcher */
          <div className="max-w-xl mx-auto pt-6">
            <div className="mb-3 flex items-center justify-between text-xs font-mono text-slate-400 px-1">
              <span>Configuring: <strong className="text-cyan-400">{activeSlot === 'bot_1' ? 'Slot 1 (Bot 1)' : 'Slot 2 (Bot 2)'}</strong></span>
              <span>24/7 Keep-Alive via UptimeRobot</span>
            </div>
            <BotLauncher
              recentBotNames={userProfile.recentBotNames || []}
              recentServerIp={userProfile.recentServerIp || ''}
              recentServerIps={userProfile.recentServerIps || []}
              serverAlert={currentSlot.serverAlert}
              onLaunch={handleLaunchBot}
              isLaunching={currentSlot.isLaunching}
            />
          </div>
        ) : (
          /* Current Slot is Online or Connecting -> Full Live Controller Dashboard */
          <>
            {/* Top HUD: Health, Hunger, Coords, Status */}
            <HUD
              botState={currentSlot.botState}
              onRetryConnect={handleRetryConnect}
              onChangeUsername={handleChangeUsername}
            />

            {/* Controls & Automation */}
            <ControlPanel
              ownerIgn={userProfile.ownerIgn || 'Player'}
              botUsername={currentSlot.botState.username}
              antiAfk={currentSlot.antiAfk}
              autoEat={currentSlot.autoEat}
              autoAttack={currentSlot.autoAttack}
              aiChat={currentSlot.aiChat}
              isSleeping={currentSlot.botState.isSleeping}
              activeTimerRemaining={currentSlot.timerRemaining}
              onToggleAntiAfk={handleToggleAntiAfk}
              onToggleAutoEat={handleToggleAutoEat}
              onToggleAutoAttack={handleToggleAutoAttack}
              onToggleAiChat={handleToggleAiChat}
              onSleepInBed={handleSleepInBed}
              onWakeUp={handleWakeUp}
              onNightSkip={handleNightSkip}
              onFollowPlayer={handleFollowPlayer}
              onStopFollow={handleStopFollow}
              onSetTimer={handleSetTimer}
              onCancelTimer={handleCancelTimer}
              onDisconnect={handleDisconnectBot}
            />

            {/* Split View: Live Chat & Inventory */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              {/* Left Column: Live In-Game Chat */}
              <LiveChat
                messages={currentSlot.chatMessages}
                onSendMessage={handleSendMessage}
                botUsername={currentSlot.botState.username}
                ownerIgn={userProfile.ownerIgn || 'Player'}
              />

              {/* Right Column: Interactive Minecraft Inventory with Quick Vitals */}
              <InventoryView
                items={currentSlot.inventoryItems}
                botState={currentSlot.botState}
                onTossItem={handleTossItem}
                onEquipItem={handleEquipItem}
                onTossAll={handleTossAll}
                onEatItem={handleEatItem}
                onUseItem={handleUseItem}
                onMoveItem={handleMoveItem}
                onShareItem={handleShareItem}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
};
