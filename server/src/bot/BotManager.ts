import { BotInstance, BotConfig } from './BotInstance';
import { Server as SocketServer } from 'socket.io';
import { RateLimiter } from '../security/validator';
import { MemoryWatchdog } from '../security/watchdog';
import { SlotStorage, SlotId } from '../storage/slotStorage';

const MAX_GLOBAL_BOTS = 10;
const rateLimiter = new RateLimiter();

export class BotManager {
  private bots: Map<string, BotInstance> = new Map();
  private io: SocketServer;
  private watchdog = MemoryWatchdog.getInstance();
  private slotStorage = SlotStorage.getInstance();

  constructor(io: SocketServer) {
    this.io = io;
    this.setupProcessExitHandlers();
    this.setupMemoryWatchdog();
    this.autoResumeActiveSlots();
  }

  public getBot(slotOrUserId: string): BotInstance | undefined {
    return this.bots.get(slotOrUserId);
  }

  public findBotByOwner(ownerIgn: string): BotInstance | undefined {
    if (!ownerIgn) return undefined;
    const lower = ownerIgn.toLowerCase();
    for (const bot of this.bots.values()) {
      if (bot.config.ownerIgn && bot.config.ownerIgn.toLowerCase() === lower) {
        return bot;
      }
    }
    return undefined;
  }

  public getActiveBotsCount(): number {
    return this.bots.size;
  }

  /**
   * Automatically resume any configured active bot slots on server boot / cold wake
   */
  private autoResumeActiveSlots() {
    try {
      const allSlots = this.slotStorage.getAllSlots();
      const slots: SlotId[] = ['bot_1', 'bot_2'];

      for (const slotId of slots) {
        const slotData = allSlots[slotId];
        if (slotData && slotData.isActive && slotData.config) {
          console.log(`[BotManager] Auto-resuming active slot ${slotId} (${slotData.config.username} -> ${slotData.config.serverIp}:${slotData.config.serverPort})...`);
          try {
            this.spawnInternal(slotId, slotData.config);
          } catch (e) {
            console.error(`[BotManager] Failed to auto-resume ${slotId}:`, e);
          }
        }
      }
    } catch (err) {
      console.error('[BotManager] Error in autoResumeActiveSlots:', err);
    }
  }

  /**
   * Keep-Alive Check triggered by UptimeRobot pings to revive dropped bots autonomously
   */
  public checkAndReviveSlots(): { slots: Record<SlotId, any> } {
    const slots: SlotId[] = ['bot_1', 'bot_2'];
    const allSlots = this.slotStorage.getAllSlots();

    for (const slotId of slots) {
      const slotData = allSlots[slotId];
      if (slotData && slotData.isActive && slotData.config) {
        const existing = this.bots.get(slotId);
        if (!existing) {
          console.log(`[BotManager Keep-Alive] Slot ${slotId} is marked active but missing instance. Reviving now...`);
          try {
            this.spawnInternal(slotId, slotData.config);
          } catch (e) {
            console.error(`[BotManager Keep-Alive] Failed to revive ${slotId}:`, e);
          }
        } else if (existing.status === 'offline' || existing.status === 'error') {
          console.log(`[BotManager Keep-Alive] Slot ${slotId} is ${existing.status}. Reviving connection to ${slotData.config.serverIp}:${slotData.config.serverPort}...`);
          existing.isExplicitlyStopped = false;
          existing.cancelRetryTimer();
          existing.start();
        }
      }
    }

    return {
      slots: {
        bot_1: this.getSlotSummary('bot_1'),
        bot_2: this.getSlotSummary('bot_2'),
      },
    };
  }

  /**
   * Get brief status summary of a slot
   */
  public getSlotSummary(slotId: SlotId): any {
    const bot = this.bots.get(slotId);
    if (bot) {
      return bot.getState();
    }
    const stored = this.slotStorage.getSlot(slotId);
    return {
      slotId,
      status: 'offline',
      username: stored.config?.username || (slotId === 'bot_1' ? 'Bot 1' : 'Bot 2'),
      serverIp: stored.config?.serverIp || '',
      serverPort: stored.config?.serverPort || 25565,
      isActive: stored.isActive,
    };
  }

  /**
   * Get states for all slots (used for initial connection handshake)
   */
  public getAllSlotsState(): { bot_1: any; bot_2: any } {
    return {
      bot_1: this.getSlotSummary('bot_1'),
      bot_2: this.getSlotSummary('bot_2'),
    };
  }

  /**
   * Internal spawn method
   */
  private spawnInternal(slotOrUserId: string, config: BotConfig): BotInstance {
    const botInstance = new BotInstance(slotOrUserId, config, this.io);
    botInstance.onOwnerChanged = (newOwner: string) => {
      console.log(`[BotManager] Bot owner updated for ${slotOrUserId}: ${newOwner}`);
    };
    botInstance.onUsernameChanged = (newUsername: string) => {
      console.log(`[BotManager] Bot username updated for ${slotOrUserId}: ${newUsername}`);
    };
    this.bots.set(slotOrUserId, botInstance);
    botInstance.start();
    return botInstance;
  }

  public startBot(slotOrUserId: string, config: BotConfig): { success: boolean; error?: string } {
    // 1. Rate Limiting: 1 spawn request every 4 seconds per slot
    const rateLimitKey = `spawn:${slotOrUserId}`;
    if (!rateLimiter.isAllowed(rateLimitKey, 1, 4000)) {
      return {
        success: false,
        error: 'Please wait a moment before restarting this bot.',
      };
    }

    // 2. Global Bot Limit
    if (!this.bots.has(slotOrUserId) && this.bots.size >= MAX_GLOBAL_BOTS) {
      return {
        success: false,
        error: `Server has reached the maximum capacity of ${MAX_GLOBAL_BOTS} simultaneous bots.`,
      };
    }

    // Stop existing bot for this slot if currently running
    const existing = this.bots.get(slotOrUserId);
    if (existing) {
      existing.stop();
      this.bots.delete(slotOrUserId);
    }

    // Persist active configuration to disk
    if (slotOrUserId === 'bot_1' || slotOrUserId === 'bot_2') {
      this.slotStorage.setSlotConfig(slotOrUserId as SlotId, config, true);
    }

    try {
      this.spawnInternal(slotOrUserId, config);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to initialize bot process.' };
    }
  }

  public stopBot(slotOrUserId: string) {
    // Persist stopped state
    if (slotOrUserId === 'bot_1' || slotOrUserId === 'bot_2') {
      this.slotStorage.setSlotActive(slotOrUserId as SlotId, false);
    }

    const existing = this.bots.get(slotOrUserId);
    if (existing) {
      existing.isExplicitlyStopped = true;
      existing.stop();
      this.bots.delete(slotOrUserId);
    }
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

  private setupMemoryWatchdog() {
    this.watchdog.start(() => {
      console.warn(`[BotManager] Emergency memory reclamation triggered! Stopping oldest bot to prevent OOM crash.`);
      if (this.bots.size > 0) {
        const [oldestUserId, oldestBot] = this.bots.entries().next().value;
        if (oldestBot) {
          oldestBot.stop();
          this.bots.delete(oldestUserId);
          this.io.to(oldestUserId).emit('bot-error', {
            slotId: oldestUserId,
            error: 'Bot stopped automatically by Cloud Watchdog to prevent memory overflow.',
          });
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
    process.on('uncaughtException', (err: any) => {
      console.error('[UNCAUGHT EXCEPTION]:', err?.message || err);
      const isNetError = err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET' ||
        err?.message?.includes('ETIMEDOUT') || err?.message?.includes('ECONNRESET');
      if (isNetError) {
        console.warn('[BotManager] Network connection timeout/reset caught and absorbed safely.');
        return;
      }
    });

    process.on('unhandledRejection', (reason: any) => {
      const msg = reason?.message || String(reason);
      const isNetError = msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET') || msg.includes('ECONNREFUSED');
      if (isNetError) {
        console.warn(`[Network] Connection attempt timed out or refused (${msg}). Auto-reconnect active.`);
        return;
      }
      console.error('[UNHANDLED REJECTION]:', msg);
    });
  }
}
