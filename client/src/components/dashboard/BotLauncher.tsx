import React, { useState } from 'react';
import { Play, History, Server, Key, Sparkles, AlertCircle } from 'lucide-react';

export interface BotLaunchConfig {
  username: string;
  serverIp: string;
  serverPort: number;
  authPassword?: string;
  version?: string;
  autoEat: boolean;
  antiAfk: boolean;
  autoAttack: boolean;
}

interface BotLauncherProps {
  recentBotNames: string[];
  recentServerIp: string;
  recentServerIps?: string[];
  serverAlert?: string | null;
  onLaunch: (config: BotLaunchConfig) => Promise<void>;
  isLaunching: boolean;
  onClose?: () => void;
}

export const BotLauncher: React.FC<BotLauncherProps> = ({
  recentBotNames = [],
  recentServerIp = '',
  recentServerIps = [],
  serverAlert,
  onLaunch,
  isLaunching,
  onClose,
}) => {
  const [username, setUsername] = useState(recentBotNames[0] || '');
  const [serverAddress, setServerAddress] = useState(recentServerIp || 'localhost:25565');
  const [authPassword, setAuthPassword] = useState('');
  const [version, setVersion] = useState('auto');
  const [autoEat, setAutoEat] = useState(true);
  const [antiAfk, setAntiAfk] = useState(true);
  const [autoAttack, setAutoAttack] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compile list of recent server IPs
  const serverList = recentServerIps.length > 0
    ? recentServerIps
    : (recentServerIp ? [recentServerIp] : ['localhost:25565']);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please provide a Minecraft username for the bot.');
      return;
    }
    if (!serverAddress.trim()) {
      setError('Please provide a Minecraft server IP address.');
      return;
    }

    // Parse host and port
    let host = serverAddress.trim();
    let port = 25565;

    if (host.includes(':')) {
      const parts = host.split(':');
      host = parts[0];
      const parsedPort = parseInt(parts[1], 10);
      if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
        port = parsedPort;
      }
    }

    try {
      setError(null);
      await onLaunch({
        username: username.trim(),
        serverIp: host,
        serverPort: port,
        authPassword: authPassword.trim() || undefined,
        version: version === 'auto' ? undefined : version,
        autoEat,
        antiAfk,
        autoAttack,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to spawn bot. Check server IP or logs.');
    }
  };

  return (
    <div className="mc-panel p-6 border-2 border-mc-border shadow-2xl relative">
      <div className="flex items-center justify-between border-b border-mc-border pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-mc-green/20 border border-mc-green/40 flex items-center justify-center rounded">
            <Sparkles className="w-5 h-5 text-mc-green" />
          </div>
          <div>
            <h3 className="font-pixel text-sm text-slate-100">Spawn Minecraft Bot</h3>
            <p className="text-xs text-slate-400 font-mono">Cracked / Offline Server Session</p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 font-pixel text-xs px-2 py-1"
          >
            ✕
          </button>
        )}
      </div>

      {(error || serverAlert) && (
        <div className="mb-4 p-3 bg-red-950/70 border border-red-600/80 rounded flex items-start gap-2.5 text-xs text-red-200 font-mono">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block text-red-300 font-pixel text-[11px] mb-0.5">
              SERVER OFFLINE / CONNECTION ALERT:
            </span>
            <span>{error || serverAlert}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Bot Username with Last 3 Used Pills */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-mono uppercase text-slate-300">
              Bot Username
            </label>
            {recentBotNames.length > 0 && (
              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                <History className="w-3 h-3 text-slate-400" /> Recent Names:
              </span>
            )}
          </div>

          {/* Quick Select Pills for Last 3 Usernames */}
          {recentBotNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {recentBotNames.map((name) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => setUsername(name)}
                  className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
                    username === name
                      ? 'bg-mc-green/20 border-mc-green text-mc-green font-bold'
                      : 'bg-[#14151b] border-mc-border text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. Nilesh_AFK"
            className="w-full bg-[#121318] border border-mc-border px-3 py-2 text-sm text-slate-100 rounded focus:border-mc-green focus:outline-none font-mono"
          />
        </div>

        {/* Server IP Address with Recent Servers Quick-Select */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-mono uppercase text-slate-300">
              Server IP & Port
            </label>
            {serverList.length > 0 && (
              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                <History className="w-3 h-3 text-slate-400" /> Recent Servers:
              </span>
            )}
          </div>

          {/* Quick Select Pills for Recent Server Addresses */}
          {serverList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {serverList.map((addr) => (
                <button
                  type="button"
                  key={addr}
                  onClick={() => setServerAddress(addr)}
                  className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors cursor-pointer ${
                    serverAddress === addr
                      ? 'bg-mc-diamond/20 border-mc-diamond text-mc-diamond font-bold'
                      : 'bg-[#14151b] border-mc-border text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {addr}
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <input
              type="text"
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
              placeholder="e.g. play.myserver.net:25565"
              className="w-full bg-[#121318] border border-mc-border px-3 py-2 text-sm text-mc-diamond rounded focus:border-mc-diamond focus:outline-none font-mono"
            />
            <Server className="w-4 h-4 text-slate-500 absolute right-3 top-2.5 pointer-events-none" />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Select a recent server or enter an address. Defaults to port 25565.
          </p>
        </div>

        {/* Optional AuthMe Password */}
        <div>
          <label className="block text-xs font-mono uppercase text-slate-300 mb-1">
            Auto-Login Password <span className="text-slate-500 font-normal lowercase">(optional for AuthMe)</span>
          </label>
          <div className="relative">
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Sent as /login <password> automatically"
              className="w-full bg-[#121318] border border-mc-border px-3 py-2 text-sm text-slate-100 rounded focus:border-mc-green focus:outline-none font-mono"
            />
            <Key className="w-4 h-4 text-slate-500 absolute right-3 top-2.5 pointer-events-none" />
          </div>
        </div>

        {/* Version Selection */}
        <div>
          <label className="block text-xs font-mono uppercase text-slate-300 mb-1">
            Minecraft Version
          </label>
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="w-full bg-[#121318] border border-mc-border px-3 py-2 text-xs text-slate-200 rounded focus:border-mc-green focus:outline-none font-mono cursor-pointer"
          >
            <option value="auto">Auto-Negotiate (Latest Supported 1.21.x / 1.20.x)</option>
            <option value="1.21.1">1.21.1</option>
            <option value="1.21">1.21</option>
            <option value="1.20.4">1.20.4</option>
            <option value="1.20.2">1.20.2</option>
            <option value="1.20.1">1.20.1</option>
            <option value="1.19.4">1.19.4</option>
            <option value="1.18.2">1.18.2</option>
            <option value="1.16.5">1.16.5</option>
          </select>
        </div>

        {/* Initial AFK Modes Checkboxes */}
        <div className="p-3 bg-[#121318] border border-mc-border rounded space-y-2">
          <div className="text-[11px] font-mono uppercase text-slate-400 mb-2">
            Startup Automation Modes
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoEat}
              onChange={(e) => setAutoEat(e.target.checked)}
              className="rounded bg-[#1a1b20] border-mc-border text-mc-green focus:ring-0"
            />
            <span>Auto-Eat (Feeds itself when hunger drops)</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={antiAfk}
              onChange={(e) => setAntiAfk(e.target.checked)}
              className="rounded bg-[#1a1b20] border-mc-border text-mc-green focus:ring-0"
            />
            <span>Anti-AFK (Micro head rotation and random sneak)</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoAttack}
              onChange={(e) => setAutoAttack(e.target.checked)}
              className="rounded bg-[#1a1b20] border-mc-border text-mc-green focus:ring-0"
            />
            <span>Auto-Attack (Mob Farm Clicker with weapon cooldown)</span>
          </label>
        </div>

        {error && (
          <div className="p-2.5 bg-red-950/60 border border-red-800 rounded text-xs text-red-300 font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={isLaunching}
            className="w-full mc-btn-green py-3.5 flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-transform"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{isLaunching ? 'Connecting Bot to Server...' : 'Spawn Bot Now'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
