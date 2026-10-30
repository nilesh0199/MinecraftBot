import { BotInstance, BotConfig } from './BotInstance';
import { Server as SocketServer } from 'socket.io';
import { RateLimiter } from '../security/validator';
import { MemoryWatchdog } from '../security/watchdog';
import * as fs from 'fs';
import * as path from 'path';

const MAX_GLOBAL_BOTS = 10;
const rateLimiter = new RateLimiter();
const PERSISTENCE_FILE = path.resolve(process.cwd(), 'active_bots.json');

interface PersistedBotData {
  userId: string;
  config: BotConfig;
  savedAt: number;
}

export class BotManager {
  private bots: Map<string, BotInstance> = new Map();
  private io: SocketServer;
  private watchdog = MemoryWatchdog.getInstance();

  constructor(io: SocketServer) {
    this.io = io;
    this.setupProcessExitHandlers();
    this.setupMemoryWatchdog();
  }

  public getBot(userId: string): BotInstance | undefined {
    return this.bots.get(userId);
  }

  public getActiveBotsCount(): number {
    return this.bots.size;
  }

  /**
   * Internal spawn method without rate limit checks (used by startBot and restoreSavedBots)
   */
  private spawnInternal(userId: string, config: BotConfig): BotInstance {
    const botInstance = new BotInstance(userId, config, this.io);
    botInstance.onOwnerChanged = (newOwner: string) => {
      console.log(`[BotManager] Bot owner updated for user ${userId}: ${newOwner}`);
      this.saveBotToPersistence(userId, botInstance.config);
    };
    botInstance.onUsernameChanged = (newUsername: string) => {
      console.log(`[BotManager] Bot username updated for user ${userId}: ${newUsername}`);
      this.saveBotToPersistence(userId, botInstance.config);
    };
    this.bots.set(userId, botInstance);
    botInstance.start();
    return botInstance;
  }

  public startBot(userId: string, config: BotConfig): { success: boolean; error?: string } {
    // 1. Rate Limiting: 1 spawn request every 8 seconds per user
    const rateLimitKey = `spawn:${userId}`;
    if (!rateLimiter.isAllowed(rateLimitKey, 1, 8000)) {
      return {
        success: false,
        error: 'Please wait a few seconds before spawning or restarting your bot.',
      };
    }

    // 2. Global Bot Limit (protect Oracle Cloud VM RAM from exhaustion)
    if (!this.bots.has(userId) && this.bots.size >= MAX_GLOBAL_BOTS) {
      return {
        success: false,
        error: `Server has reached the maximum capacity of ${MAX_GLOBAL_BOTS} simultaneous bots.`,
      };
    }

    // Stop existing bot for this user if one is currently active
    const existing = this.bots.get(userId);
    if (existing) {
      existing.stop();
      this.bots.delete(userId);
    }

    try {
      this.spawnInternal(userId, config);
      this.saveBotToPersistence(userId, config);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to initialize bot process.' };
    }
  }

  public stopBot(userId: string) {
    const existing = this.bots.get(userId);
    if (existing) {
      existing.stop();
      this.bots.delete(userId);
    }
    this.removeBotFromPersistence(userId);
  }

  public stopAll() {
    console.log(`[BotManager] Gracefully shutting down ${this.bots.size} active bots...`);
    for (const [_, bot] of this.bots.entries()) {
      try {
        bot.stop();
      } catch (e) {}
    }
    this.bots.clear();
  }

  /**
   * Persistence: Save active bot configuration to disk
   */
  private saveBotToPersistence(userId: string, config: BotConfig): void {
    try {
      let store: Record<string, PersistedBotData> = {};
      if (fs.existsSync(PERSISTENCE_FILE)) {
        try {
          store = JSON.parse(fs.readFileSync(PERSISTENCE_FILE, 'utf8'));
        } catch {
          store = {};
        }
      }
      store[userId] = {
        userId,
        config,
        savedAt: Date.now(),
      };
      fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(store, null, 2), 'utf8');
    } catch (err) {
      console.error('[BotManager] Failed to persist bot state:', err);
    }
  }

  /**
   * Persistence: Remove bot configuration from disk when user explicitly stops/disconnects
   */
  private removeBotFromPersistence(userId: string): void {
    try {
      if (!fs.existsSync(PERSISTENCE_FILE)) return;
      const raw = fs.readFileSync(PERSISTENCE_FILE, 'utf8');
      const store: Record<string, PersistedBotData> = JSON.parse(raw);
      if (store[userId]) {
        delete store[userId];
        fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(store, null, 2), 'utf8');
      }
    } catch (err) {
      console.error('[BotManager] Failed to remove bot from persistence:', err);
    }
  }

  /**
   * Persistence: Load valid persisted bot configurations
   */
  private loadPersistedBots(): PersistedBotData[] {
    try {
      if (!fs.existsSync(PERSISTENCE_FILE)) {
        return [];
      }
      const raw = fs.readFileSync(PERSISTENCE_FILE, 'utf8');
      const store: Record<string, PersistedBotData> = JSON.parse(raw);
      const now = Date.now();
      const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

      return Object.values(store).filter((item) => {
        return item && item.userId && item.config && (now - item.savedAt < MAX_AGE_MS);
      });
    } catch (err) {
      console.error('[BotManager] Failed to read active_bots.json:', err);
      return [];
    }
  }

  /**
   * Persistence: Automatically restore running bots after server crash or Render reboot
   */
  public async restoreSavedBots(): Promise<void> {
    const saved = this.loadPersistedBots();
    if (saved.length === 0) {
      return;
    }

    console.log(`[BotManager] Auto-restoring ${saved.length} active bot session(s) from previous run...`);

    saved.forEach((item, index) => {
      // Stagger restarts by 2.5 seconds to avoid network/CPU spikes
      setTimeout(() => {
        if (this.bots.has(item.userId)) return;
        if (this.bots.size >= MAX_GLOBAL_BOTS) {
          console.warn(`[BotManager] Cannot restore bot for ${item.userId}: capacity reached.`);
          return;
        }

        console.log(`[BotManager] Restoring bot ${item.config.username} for user ${item.userId} (${index + 1}/${saved.length})...`);
        try {
          this.spawnInternal(item.userId, item.config);
        } catch (err) {
          console.error(`[BotManager] Error restoring bot for ${item.userId}:`, err);
        }
      }, index * 2500);
    });
  }

  private setupMemoryWatchdog() {
    this.watchdog.start(() => {
      console.warn(`[BotManager] Emergency memory reclamation triggered! Stopping oldest bot to prevent OOM crash.`);
      if (this.bots.size > 0) {
        // Find the oldest bot by uptime and cleanly stop it
        const [oldestUserId, oldestBot] = this.bots.entries().next().value;
        if (oldestBot) {
          oldestBot.stop();
          this.bots.delete(oldestUserId);
          this.io.to(oldestUserId).emit('bot-error', 'Bot stopped automatically by Cloud Watchdog to prevent memory overflow.');
        }
      }
    });
  }

  private setupProcessExitHandlers() {
    const handleExit = () => {
      this.watchdog.stop();
      this.stopAll();
      process.exit(0);
    };

    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);

    // Global unhandled crash guards to protect the Node process
    process.on('uncaughtException', (err) => {
      console.error('[UNCAUGHT EXCEPTION]:', err);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('[UNHANDLED REJECTION]:', reason);
    });
  }
}
