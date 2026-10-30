"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotManager = void 0;
const BotInstance_1 = require("./BotInstance");
const validator_1 = require("../security/validator");
const watchdog_1 = require("../security/watchdog");
const MAX_GLOBAL_BOTS = 10;
const rateLimiter = new validator_1.RateLimiter();
class BotManager {
    bots = new Map();
    io;
    watchdog = watchdog_1.MemoryWatchdog.getInstance();
    constructor(io) {
        this.io = io;
        this.setupProcessExitHandlers();
        this.setupMemoryWatchdog();
    }
    getBot(userId) {
        return this.bots.get(userId);
    }
    findBotByOwner(ownerIgn) {
        if (!ownerIgn)
            return undefined;
        const lower = ownerIgn.toLowerCase();
        for (const bot of this.bots.values()) {
            if (bot.config.ownerIgn && bot.config.ownerIgn.toLowerCase() === lower) {
                return bot;
            }
        }
        return undefined;
    }
    reassignBotUser(bot, newUserId) {
        const oldUserId = bot.userId;
        if (oldUserId === newUserId)
            return;
        console.log(`[BotManager] Reassigning bot ${bot.config.username} from user ${oldUserId} to ${newUserId}`);
        this.bots.delete(oldUserId);
        bot.userId = newUserId;
        this.bots.set(newUserId, bot);
    }
    getActiveBotsCount() {
        return this.bots.size;
    }
    /**
     * Internal spawn method without rate limit checks
     */
    spawnInternal(userId, config) {
        const botInstance = new BotInstance_1.BotInstance(userId, config, this.io);
        botInstance.onOwnerChanged = (newOwner) => {
            console.log(`[BotManager] Bot owner updated for user ${userId}: ${newOwner}`);
        };
        botInstance.onUsernameChanged = (newUsername) => {
            console.log(`[BotManager] Bot username updated for user ${userId}: ${newUsername}`);
        };
        this.bots.set(userId, botInstance);
        botInstance.start();
        return botInstance;
    }
    startBot(userId, config) {
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
        }
        catch (err) {
            return { success: false, error: err?.message || 'Failed to initialize bot process.' };
        }
    }
    stopBot(userId) {
        const existing = this.bots.get(userId);
        if (existing) {
            existing.stop();
            this.bots.delete(userId);
        }
    }
    stopAll() {
        console.log(`[BotManager] Gracefully shutting down ${this.bots.size} active bots...`);
        for (const [_, bot] of this.bots.entries()) {
            try {
                bot.stop();
            }
            catch (e) { }
        }
        this.bots.clear();
    }
    setupMemoryWatchdog() {
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
    setupProcessExitHandlers() {
        const handleExit = () => {
            this.watchdog.stop();
            this.stopAll();
            process.exit(0);
        };
        process.on('SIGINT', handleExit);
        process.on('SIGTERM', handleExit);
        // Global unhandled crash guards to protect the Node process
        process.on('uncaughtException', (err) => {
            console.error('[UNCAUGHT EXCEPTION]:', err?.message || err);
            // Absorb network socket timeout/reset errors from background bot pings without crashing
            const isNetError = err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET' ||
                err?.message?.includes('ETIMEDOUT') || err?.message?.includes('ECONNRESET');
            if (isNetError) {
                console.warn('[BotManager] Network connection timeout/reset caught and absorbed safely.');
                return;
            }
        });
        process.on('unhandledRejection', (reason) => {
            console.error('[UNHANDLED REJECTION]:', reason?.message || reason);
        });
    }
}
exports.BotManager = BotManager;
