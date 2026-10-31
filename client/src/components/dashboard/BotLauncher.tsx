import React, { useState, useEffect } from 'react';
import { Play, History, Server, Key, Sparkles, AlertCircle, X } from 'lucide-react';
import { removeRecentServer, clearAllRecentServers } from '../../utils/storage';

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
  onRemoveServer?: (serverIp: string) => void;
  onClearServers?: () => void;
}

export const BotLauncher: React.FC<BotLauncherProps> = ({
  recentBotNames = [],
  recentServerIp = '',
  recentServerIps = [],
  serverAlert,
  onLaunch,
  isLaunching,
  onClose,
  onRemoveServer,
  onClearServers,
}) => {
  const [username, setUsername] = useState(recentBotNames[0] || 'Bot');

  // Only pre-fill address if user actually saved one (no legacy localhost or hardcoded dummy defaults)
  const initialAddress = (recentServerIp && !recentServerIp.toLowerCase().startsWith('localhost'))
    ? recentServerIp
    : '';
  const [serverAddress, setServerAddress] = useState(initialAddress);
  const [authPassword, setAuthPassword] = useState('');
  const [version, setVersion] = useState('1.21.11');
  const [autoEat, setAutoEat] = useState(true);
  const [antiAfk, setAntiAfk] = useState(true);
  const [autoAttack, setAutoAttack] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compile list of recent server IPs (only real servers saved from now on)
  const [serverList, setServerList] = useState<string[]>(() => {
    const list = recentServerIps.length > 0
      ? recentServerIps
      : (recentServerIp ? [recentServerIp] : []);
    return list.filter(ip => ip && !ip.toLowerCase().startsWith('localhost'));
  });

  useEffect(() => {
    const list = recentServerIps.length > 0
      ? recentServerIps
      : (recentServerIp ? [recentServerIp] : []);
    setServerList(list.filter(ip => ip && !ip.toLowerCase().startsWith('localhost')));
  }, [recentServerIps, recentServerIp]);

  const handleRemoveServer = (ipToRemove: string) => {
    const updated = serverList.filter(ip => ip.toLowerCase() !== ipToRemove.toLowerCase());
    setServerList(updated);
    if (serverAddress.toLowerCase() === ipToRemove.toLowerCase()) {
      setServerAddress(updated[0] || '');
    }
    if (onRemoveServer) {
      onRemoveServer(ipToRemove);
    } else {
      removeRecentServer(ipToRemove);
    }
  };

  const handleClearAllServers = () => {
    setServerList([]);
    setServerAddress('');
    if (onClearServers) {
      onClearServers();
    } else {
      clearAllRecentServers();
    }
  };

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

    // Clean and parse host and port
    let raw = serverAddress.trim().replace(/^[a-zA-Z]+:\/\//, '').replace(/\/.*$/, '').trim();
    let host = raw;
    let port = 25565;

    if (raw.includes(':')) {
      const lastColon = raw.lastIndexOf(':');
      const candidateHost = raw.substring(0, lastColon).replace(/^\[|\]$/g, '').trim();
      const candidatePort = parseInt(raw.substring(lastColon + 1).trim(), 10);
      if (!isNaN(candidatePort) && candidatePort > 0 && candidatePort <= 65535) {
        host = candidateHost;
        port = candidatePort;
      }
    }

    try {
      setError(null);
      await onLaunch({
        username: username.trim(),
        serverIp: host,
        serverPort: port,
        authPassword: authPassword.trim() || undefined,
        version: (version && version !== 'auto') ? version : undefined,
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
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                  <History className="w-3 h-3 text-slate-400" /> Recent:
                </span>
                <button
                  type="button"
                  onClick={handleClearAllServers}
                  className="text-[10px] font-mono text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                  title="Clear all saved server addresses"
                >
                  [Clear]
                </button>
              </div>
            )}
          </div>

          {/* Quick Select Pills for Recent Server Addresses with Delete Button */}
          {serverList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {serverList.map((addr) => (
                <div
                  key={addr}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
                    serverAddress === addr
                      ? 'bg-mc-diamond/20 border-mc-diamond text-mc-diamond font-bold'
                      : 'bg-[#14151b] border-mc-border text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setServerAddress(addr)}
                    className="cursor-pointer"
                  >
                    {addr}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveServer(addr);
                    }}
                    className="text-slate-500 hover:text-red-400 p-0.5 rounded hover:bg-red-950/50 transition-colors ml-0.5 cursor-pointer"
                    title={`Delete ${addr}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative">
            <input
              type="text"
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
              placeholder="e.g. play.example.com or mc.myserver.net:25565"
              className="w-full bg-[#121318] border border-mc-border px-3 py-2 text-sm text-mc-diamond rounded focus:border-mc-diamond focus:outline-none font-mono"
            />
            <Server className="w-4 h-4 text-slate-500 absolute right-3 top-2.5 pointer-events-none" />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Enter your server address. Defaults to port 25565 if omitted.
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
            <option value="1.21.11">1.21.11 (Default)</option>
            <option value="auto">⚡ Auto-Negotiate (Auto-Detect Server Version)</option>
            <option value="1.21.4">1.21.4 (Latest Vanilla / Paper)</option>
            <option value="1.21.3">1.21.3</option>
            <option value="1.21.1">1.21.1 (Standard 1.21)</option>
            <option value="1.21">1.21 (Tricky Trials)</option>
            <option value="1.20.6">1.20.6</option>
            <option value="1.20.4">1.20.4</option>
            <option value="1.20.2">1.20.2</option>
            <option value="1.20.1">1.20.1</option>
            <option value="1.20">1.20</option>
            <option value="1.19.4">1.19.4</option>
            <option value="1.19.3">1.19.3</option>
            <option value="1.19.2">1.19.2</option>
            <option value="1.19">1.19</option>
            <option value="1.18.2">1.18.2</option>
            <option value="1.17.1">1.17.1</option>
            <option value="1.16.5">1.16.5</option>
            <option value="1.15.2">1.15.2</option>
            <option value="1.14.4">1.14.4</option>
            <option value="1.13.2">1.13.2</option>
            <option value="1.12.2">1.12.2</option>
            <option value="1.11.2">1.11.2</option>
            <option value="1.10.2">1.10.2</option>
            <option value="1.9.4">1.9.4</option>
            <option value="1.8.8">1.8.8 / 1.8.9 (Classic Combat)</option>
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
