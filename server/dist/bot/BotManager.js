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
    getActiveBotsCount() {
        return this.bots.size;
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
            const botInstance = new BotInstance_1.BotInstance(userId, config, this.io);
            this.bots.set(userId, botInstance);
            botInstance.start();
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
            console.error('[UNCAUGHT EXCEPTION]:', err);
        });
        process.on('unhandledRejection', (reason) => {
            console.error('[UNHANDLED REJECTION]:', reason);
        });
    }
}
exports.BotManager = BotManager;
