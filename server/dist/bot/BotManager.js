"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotManager = void 0;
const BotInstance_1 = require("./BotInstance");
const validator_1 = require("../security/validator");
const watchdog_1 = require("../security/watchdog");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MAX_GLOBAL_BOTS = 10;
const rateLimiter = new validator_1.RateLimiter();
const PERSISTENCE_FILE = path.resolve(process.cwd(), 'active_bots.json');
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
        this.removeBotFromPersistence(oldUserId);
        bot.userId = newUserId;
        this.bots.set(newUserId, bot);
        this.saveBotToPersistence(newUserId, bot.config);
    }
    getActiveBotsCount() {
        return this.bots.size;
    }
    /**
     * Internal spawn method without rate limit checks (used by startBot and restoreSavedBots)
     */
    spawnInternal(userId, config) {
        const botInstance = new BotInstance_1.BotInstance(userId, config, this.io);
        botInstance.onOwnerChanged = (newOwner) => {
            console.log(`[BotManager] Bot owner updated for user ${userId}: ${newOwner}`);
            this.saveBotToPersistence(userId, botInstance.config);
        };
        botInstance.onUsernameChanged = (newUsername) => {
            console.log(`[BotManager] Bot username updated for user ${userId}: ${newUsername}`);
            this.saveBotToPersistence(userId, botInstance.config);
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
        this.removeBotFromPersistence(userId);
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
    /**
     * Persistence: Save active bot configuration to disk
     */
    saveBotToPersistence(userId, config) {
        try {
            let store = {};
            if (fs.existsSync(PERSISTENCE_FILE)) {
                try {
                    store = JSON.parse(fs.readFileSync(PERSISTENCE_FILE, 'utf8'));
                }
                catch {
                    store = {};
                }
            }
            store[userId] = {
                userId,
                config,
                savedAt: Date.now(),
            };
            fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(store, null, 2), 'utf8');
        }
        catch (err) {
            console.error('[BotManager] Failed to persist bot state:', err);
        }
    }
    /**
     * Persistence: Remove bot configuration from disk when user explicitly stops/disconnects
     */
    removeBotFromPersistence(userId) {
        try {
            if (!fs.existsSync(PERSISTENCE_FILE))
                return;
            const raw = fs.readFileSync(PERSISTENCE_FILE, 'utf8');
            const store = JSON.parse(raw);
            if (store[userId]) {
                delete store[userId];
                fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(store, null, 2), 'utf8');
            }
        }
        catch (err) {
            console.error('[BotManager] Failed to remove bot from persistence:', err);
        }
    }
    /**
     * Persistence: Load valid persisted bot configurations
     */
    loadPersistedBots() {
        try {
            if (!fs.existsSync(PERSISTENCE_FILE)) {
                return [];
            }
            const raw = fs.readFileSync(PERSISTENCE_FILE, 'utf8');
            const store = JSON.parse(raw);
            const now = Date.now();
            const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours
            return Object.values(store).filter((item) => {
                return item && item.userId && item.config && (now - item.savedAt < MAX_AGE_MS);
            });
        }
        catch (err) {
            console.error('[BotManager] Failed to read active_bots.json:', err);
            return [];
        }
    }
    /**
     * Persistence: Automatically restore running bots after server crash or Render reboot
     */
    async restoreSavedBots() {
        const saved = this.loadPersistedBots();
        if (saved.length === 0) {
            // Check if environment variables specify a 24/7 cloud server to maintain
            const envHost = process.env.MC_SERVER_IP || process.env.DEFAULT_SERVER_IP;
            if (envHost) {
                const envPort = parseInt(process.env.MC_SERVER_PORT || process.env.DEFAULT_SERVER_PORT || '25565', 10);
                const envUsername = process.env.MC_BOT_USERNAME || process.env.DEFAULT_BOT_USERNAME || 'Bot';
                const envOwner = process.env.MC_OWNER_IGN || process.env.DEFAULT_OWNER_IGN || 'Naya_hu';
                console.log(`[BotManager] Auto-restoring 24/7 cloud environment bot: ${envUsername} -> ${envHost}:${envPort}`);
                const defaultUserId = 'cloud-default-session';
                const defaultConfig = {
                    username: envUsername,
                    serverIp: envHost,
                    serverPort: envPort,
                    ownerIgn: envOwner,
                    autoEat: true,
                    antiAfk: true,
                    autoAttack: false,
                    isAiChatActive: true,
                };
                this.saveBotToPersistence(defaultUserId, defaultConfig);
                this.spawnInternal(defaultUserId, defaultConfig);
            }
            return;
        }
        console.log(`[BotManager] Auto-restoring ${saved.length} active bot session(s) from previous run...`);
        saved.forEach((item, index) => {
            // Stagger restarts by 2.5 seconds to avoid network/CPU spikes
            setTimeout(() => {
                if (this.bots.has(item.userId))
                    return;
                if (this.bots.size >= MAX_GLOBAL_BOTS) {
                    console.warn(`[BotManager] Cannot restore bot for ${item.userId}: capacity reached.`);
                    return;
                }
                console.log(`[BotManager] Restoring bot ${item.config.username} for user ${item.userId} (${index + 1}/${saved.length})...`);
                try {
                    this.spawnInternal(item.userId, item.config);
                }
                catch (err) {
                    console.error(`[BotManager] Error restoring bot for ${item.userId}:`, err);
                }
            }, index * 2500);
        });
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
