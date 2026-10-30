import { BotInstance, BotConfig } from './BotInstance';
import { Server as SocketServer } from 'socket.io';
import { RateLimiter } from '../security/validator';
import { MemoryWatchdog } from '../security/watchdog';

const MAX_GLOBAL_BOTS = 10;
const rateLimiter = new RateLimiter();

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

  public reassignBotUser(bot: BotInstance, newUserId: string): void {
    const oldUserId = bot.userId;
    if (oldUserId === newUserId) return;
    console.log(`[BotManager] Reassigning bot ${bot.config.username} from user ${oldUserId} to ${newUserId}`);
    this.bots.delete(oldUserId);
    bot.userId = newUserId;
    this.bots.set(newUserId, bot);
  }

  public getActiveBotsCount(): number {
    return this.bots.size;
  }

  /**
   * Internal spawn method without rate limit checks
   */
  private spawnInternal(userId: string, config: BotConfig): BotInstance {
    const botInstance = new BotInstance(userId, config, this.io);
    botInstance.onOwnerChanged = (newOwner: string) => {
      console.log(`[BotManager] Bot owner updated for user ${userId}: ${newOwner}`);
    };
    botInstance.onUsernameChanged = (newUsername: string) => {
      console.log(`[BotManager] Bot username updated for user ${userId}: ${newUsername}`);
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

    // 2. Global Bot Limit (protect cloud container RAM from exhaustion)
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
