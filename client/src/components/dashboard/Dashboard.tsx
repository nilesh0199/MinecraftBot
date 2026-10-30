import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { HUD, type BotState } from './HUD';
import { LiveChat, type ChatMessage } from './LiveChat';
import { InventoryView, type InventoryItem } from './InventoryView';
import { ControlPanel } from './ControlPanel';
import { BotLauncher, type BotLaunchConfig } from './BotLauncher';
import { type UserProfile, logout, recordBotUsage } from '../../firebase';
import { MaceSmashAnimation } from '../animations/MaceSmashAnimation';
import { sounds } from '../../utils/audio';
import { LogOut, Settings, Shield, Zap, Volume2, VolumeX } from 'lucide-react';

interface DashboardProps {
  userProfile: UserProfile;
  sessionToken?: string | null;
  onEditProfile: () => void;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;

export const Dashboard: React.FC<DashboardProps> = ({ userProfile, sessionToken, onEditProfile }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [showMaceSmash, setShowMaceSmash] = useState(false);
  const [isMuted, setIsMuted] = useState(sounds.isMuted());

  // Bot State
  const [botState, setBotState] = useState<BotState>({
    status: 'offline',
    username: userProfile.recentBotNames?.[0] || 'MyBot',
    serverIp: userProfile.recentServerIp || 'localhost',
    serverPort: 25565,
    health: 20,
    food: 20,
    xpLevel: 0,
    xpProgress: 0,
    dimension: 'minecraft:overworld',
    position: { x: 0, y: 64, z: 0 },
    ping: 0,
    uptimeSeconds: 0,
    ownerIgn: userProfile.ownerIgn,
  });

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [antiAfk, setAntiAfk] = useState(true);
  const [autoEat, setAutoEat] = useState(true);
  const [autoAttack, setAutoAttack] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);

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

  // Initialize Socket.io connection with secure authentication
  useEffect(() => {
    const s = io(BACKEND_URL, {
      auth: {
        token: sessionToken || undefined,
      },
      query: {
        uid: userProfile.uid,
        ownerIgn: userProfile.ownerIgn,
      },
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => {
      console.log('Connected to Authenticated Bot Gateway Socket');
    });

    s.on('bot-state', (state: Partial<BotState>) => {
      setBotState((prev) => ({ ...prev, ...state }));
      if (state.status === 'online') {
        setIsLaunching(false);
      }
    });

    s.on('chat-message', (msg: ChatMessage) => {
      setChatMessages((prev) => {
        // Prevent duplicate messages with identical text received in the same second
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          if (last.text === msg.text && Math.abs(msg.timestamp - last.timestamp) < 1000) {
            return prev;
          }
        }
        return [...prev.slice(-150), msg];
      });
    });

    s.on('inventory-update', (items: InventoryItem[]) => {
      setInventoryItems(items);
    });

    s.on('timer-update', (remainingSeconds: number | null) => {
      setTimerRemaining(remainingSeconds);
    });

    s.on('bot-error', (errorMsg: string) => {
      setIsLaunching(false);
      alert(`Bot Error: ${errorMsg}`);
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [userProfile, sessionToken]);

  // Launch Bot Handler
  const handleLaunchBot = async (config: BotLaunchConfig) => {
    if (!socket) return;
    setIsLaunching(true);
    sounds.playClick();

    // Save recent bot username and server IP to Firebase
    try {
      await recordBotUsage(userProfile.uid, config.username, `${config.serverIp}:${config.serverPort}`);
    } catch (e) {
      console.error('Failed to record bot usage', e);
    }

    setAntiAfk(config.antiAfk);
    setAutoEat(config.autoEat);
    setAutoAttack(config.autoAttack);

    socket.emit('start-bot', {
      ...config,
      ownerIgn: userProfile.ownerIgn,
    });
  };

  // Actions
  const handleSendMessage = (text: string) => {
    socket?.emit('send-chat', text);
  };

  const handleTossItem = (slot: number, count?: number) => {
    socket?.emit('toss-item', { slot, count });
  };

  const handleEquipItem = (slot: number, destination: string) => {
    socket?.emit('equip-item', { slot, destination });
  };

  const handleTossAll = () => {
    if (confirm('Are you sure you want the bot to toss out all items?')) {
      socket?.emit('toss-all');
    }
  };

  const handleFollowPlayer = (target: string) => {
    sounds.playClick();
    socket?.emit('follow-player', target);
  };

  const handleStopFollow = () => {
    sounds.playClick();
    socket?.emit('stop-follow');
  };

  const handleToggleAntiAfk = (enabled: boolean) => {
    sounds.playClick();
    setAntiAfk(enabled);
    socket?.emit('toggle-anti-afk', enabled);
  };

  const handleToggleAutoEat = (enabled: boolean) => {
    sounds.playClick();
    setAutoEat(enabled);
    socket?.emit('toggle-auto-eat', enabled);
  };

  const handleToggleAutoAttack = (enabled: boolean) => {
    sounds.playClick();
    setAutoAttack(enabled);
    socket?.emit('toggle-auto-attack', enabled);
  };

  const handleSetTimer = (minutes: number) => {
    sounds.playClick();
    socket?.emit('set-timer', minutes);
  };

  const handleCancelTimer = () => {
    sounds.playClick();
    socket?.emit('cancel-timer');
  };

  const handleDisconnectBot = () => {
    sounds.playClick();
    if (confirm('Disconnect bot from the Minecraft server and return to launcher?')) {
      socket?.emit('stop-bot');
      setBotState((prev) => ({
        ...prev,
        status: 'offline',
      }));
      setChatMessages([]);
      setInventoryItems([]);
    }
  };

  const handleDisconnectAndSwitch = () => {
    sounds.playClick();
    if (confirm(`Disconnect ${botState.username} from ${botState.serverIp} and switch bot/server?`)) {
      socket?.emit('stop-bot');
      setBotState((prev) => ({
        ...prev,
        status: 'offline',
      }));
      setChatMessages([]);
      setInventoryItems([]);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0f13] text-slate-100 flex flex-col font-sans selection:bg-mc-green selection:text-black">
      {/* 1.21 Mace Smash Modal if triggered */}
      {showMaceSmash && (
        <MaceSmashAnimation onComplete={() => setShowMaceSmash(false)} />
      )}

      {/* Top Bar */}
      <header className="border-b border-mc-border bg-[#14151b] px-4 sm:px-6 py-3">
        <div className="w-full max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#252830] border border-mc-border flex items-center justify-center rounded">
              <span className="text-base">🟩</span>
            </div>
            <div>
              <h2 className="font-pixel text-xs text-slate-100 flex items-center gap-2">
                CraftBot Manager
                <span className="text-[10px] font-mono text-mc-green bg-mc-green/10 px-1.5 py-0.2 rounded border border-mc-green/30">
                  Cloud 24/7
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Audio FX Mute / Unmute Toggle */}
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
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-pixel bg-[#1c1e26] hover:bg-[#252833] border border-mc-diamond/50 text-mc-diamond rounded shadow-sm transition-all cursor-pointer"
            >
              <Zap className="w-3 h-3 fill-current" />
              <span className="hidden sm:inline">1.21 Mace Hit</span>
            </button>

            {/* User Profile Info */}
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300 bg-[#101115] px-3 py-1.5 border border-mc-border rounded">
              <span>Account: <strong>{userProfile.displayName}</strong></span>
              <span className="text-slate-600">|</span>
              <span className="text-mc-diamond flex items-center gap-1 font-bold">
                <Shield className="w-3 h-3 text-mc-diamond" /> {userProfile.ownerIgn}
              </span>
              <button
                onClick={() => {
                  sounds.playClick();
                  onEditProfile();
                }}
                title="Edit Owner IGN"
                className="text-slate-400 hover:text-slate-200 ml-1 cursor-pointer"
              >
                <Settings className="w-3 h-3" />
              </button>
            </div>

            {/* Disconnect & Switch Bot / Server Button */}
            {botState.status !== 'offline' && (
              <button
                onClick={handleDisconnectAndSwitch}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-pixel bg-amber-950/50 hover:bg-amber-900/80 border border-amber-600/70 text-amber-300 hover:text-amber-200 rounded shadow-sm transition-all cursor-pointer"
                title="Disconnect bot and return to launcher while staying logged in"
              >
                <LogOut className="w-3.5 h-3.5 text-amber-400 rotate-180" />
                <span>Disconnect & Switch</span>
              </button>
            )}

            {/* Logout Button */}
            <button
              onClick={() => {
                sounds.playClick();
                logout();
              }}
              className="text-slate-400 hover:text-red-400 px-2 py-1 text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-[1920px] mx-auto p-3 sm:p-6 space-y-5">
        {botState.status === 'offline' ? (
          /* Bot is offline: Show Launcher prominently */
          <div className="max-w-xl mx-auto pt-6">
            <BotLauncher
              recentBotNames={userProfile.recentBotNames || []}
              recentServerIp={userProfile.recentServerIp || 'localhost:25565'}
              recentServerIps={userProfile.recentServerIps || (userProfile.recentServerIp ? [userProfile.recentServerIp] : [])}
              onLaunch={handleLaunchBot}
              isLaunching={isLaunching}
            />
          </div>
        ) : (
          /* Bot is online or connecting: Full Live Dashboard */
          <>
            {/* Top HUD: Health, Hunger, Coords, Status */}
            <HUD botState={botState} />

            {/* Controls & Automation */}
            <ControlPanel
              ownerIgn={userProfile.ownerIgn}
              botUsername={botState.username}
              antiAfk={antiAfk}
              autoEat={autoEat}
              autoAttack={autoAttack}
              activeTimerRemaining={timerRemaining}
              onToggleAntiAfk={handleToggleAntiAfk}
              onToggleAutoEat={handleToggleAutoEat}
              onToggleAutoAttack={handleToggleAutoAttack}
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
                messages={chatMessages}
                onSendMessage={handleSendMessage}
                botUsername={botState.username}
                ownerIgn={userProfile.ownerIgn}
              />

              {/* Right Column: Interactive Minecraft Inventory with Quick Vitals */}
              <InventoryView
                items={inventoryItems}
                botState={botState}
                onTossItem={handleTossItem}
                onEquipItem={handleEquipItem}
                onTossAll={handleTossAll}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
};
