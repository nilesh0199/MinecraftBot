"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotInstance = void 0;
const mineflayer_1 = __importDefault(require("mineflayer"));
const mineflayer_pathfinder_1 = require("mineflayer-pathfinder");
const mineflayer_auto_eat_1 = require("mineflayer-auto-eat");
const validator_1 = require("../security/validator");
class BotInstance {
    bot = null;
    config;
    userId;
    io;
    status = 'offline';
    uptimeStart = 0;
    errorMessage = null;
    // Timers & intervals
    antiAfkInterval = null;
    autoAttackInterval = null;
    disconnectTimer = null;
    disconnectTimerEnd = null;
    stateBroadcastInterval = null;
    connectionHealthInterval = null;
    lastPacketTime = 0;
    lastInGameCommandTime = 0;
    hasAnnouncedSpawn = false;
    lastEmittedChatMessage = { text: '', time: 0 };
    trackedDoors = new Map();
    // Automation flags
    isAntiAfkActive = true;
    isAutoEatActive = true;
    isAutoAttackActive = false;
    isFollowing = false;
    targetPlayerToFollow = null;
    constructor(userId, config, io) {
        this.userId = userId;
        this.config = config;
        this.io = io;
        this.isAntiAfkActive = config.antiAfk ?? true;
        this.isAutoEatActive = config.autoEat ?? true;
        this.isAutoAttackActive = config.autoAttack ?? false;
    }
    start() {
        if (this.bot) {
            this.stop();
        }
        // Security Validation 1: Hostname / IP (SSRF Protection)
        const allowLocal = process.env.ALLOW_LOCAL_SERVERS === 'true';
        const hostValidation = validator_1.SecurityValidator.validateServerHost(this.config.serverIp, allowLocal);
        if (!hostValidation.valid) {
            this.failFast(hostValidation.error || 'Invalid server host.');
            return;
        }
        // Security Validation 2: Port
        const portValidation = validator_1.SecurityValidator.validatePort(this.config.serverPort, allowLocal);
        if (!portValidation.valid) {
            this.failFast(portValidation.error || 'Invalid server port.');
            return;
        }
        // Security Validation 3: Username
        const userValidation = validator_1.SecurityValidator.validateUsername(this.config.username);
        if (!userValidation.valid) {
            this.failFast(userValidation.error || 'Invalid bot username.');
            return;
        }
        // Security Validation 4: Owner IGN
        const ownerValidation = validator_1.SecurityValidator.validateUsername(this.config.ownerIgn);
        if (!ownerValidation.valid) {
            this.failFast(ownerValidation.error || 'Invalid Owner Minecraft IGN.');
            return;
        }
        this.status = 'connecting';
        this.lastPacketTime = Date.now();
        this.broadcastState();
        try {
            this.bot = mineflayer_1.default.createBot({
                host: hostValidation.sanitized,
                port: portValidation.sanitized,
                username: userValidation.sanitized,
                version: this.config.version || undefined,
                auth: 'offline', // Cracked server authentication
                checkTimeoutInterval: 45000, // 45s ping timeout
                hideErrors: true, // Prevent raw stack traces leaking to stdout
            });
            // Defensive: Catch low-level client socket errors (e.g. ECONNRESET, broken pipes)
            if (this.bot._client) {
                this.bot._client.on('error', (err) => {
                    console.error(`[Bot ${this.config.username} Socket Error Caught]:`, err?.message);
                });
                // Packet heartbeat tracker (detects zombie half-open TCP connections)
                this.bot._client.on('packet', () => {
                    this.lastPacketTime = Date.now();
                });
            }
            // Load plugins
            this.bot.loadPlugin(mineflayer_pathfinder_1.pathfinder);
            this.bot.loadPlugin(mineflayer_auto_eat_1.plugin);
            this.setupListeners();
        }
        catch (err) {
            this.failFast(err?.message || 'Failed to initialize Minecraft client.');
        }
    }
    failFast(error) {
        this.status = 'error';
        this.errorMessage = error;
        this.broadcastState();
        this.io.to(this.userId).emit('bot-error', error);
    }
    setupListeners() {
        if (!this.bot)
            return;
        // 1. Modern Server Resource Pack Handler (Prevents login limbo kicks)
        this.bot.on('resourcePack', (_url, _hash) => {
            try {
                console.log(`[Bot ${this.config.username}] Server requested resource pack. Accepting...`);
                if (this.bot?.acceptResourcePack) {
                    this.bot.acceptResourcePack();
                }
            }
            catch (e) { }
        });
        // 2. Respawn / Dimension Change Handler (Prevents entity & pathfinding desyncs)
        this.bot.on('respawn', () => {
            try {
                console.log(`[Bot ${this.config.username}] Bot respawned / dimension transitioned.`);
                this.stopFollow();
                this.broadcastState();
            }
            catch (e) { }
        });
        // 3. Successful Spawn in World
        this.bot.once('spawn', () => {
            try {
                console.log(`[Bot ${this.config.username}] Successfully spawned in ${this.config.serverIp}!`);
                this.status = 'online';
                this.uptimeStart = Date.now();
                this.errorMessage = null;
                // Setup pathfinder movements with anti-cheat safe defaults & door navigation
                if (this.bot) {
                    const defaultMove = new mineflayer_pathfinder_1.Movements(this.bot);
                    defaultMove.canDig = false; // Prevents triggering server anti-cheat for impossible mining
                    defaultMove.allow1by1towers = false;
                    defaultMove.allowFreeMotion = false;
                    defaultMove.canOpenDoors = true; // Enables opening doors & fence gates smoothly during pathfinding
                    this.bot.pathfinder.setMovements(defaultMove);
                    this.bot.pathfinder.thinkTimeout = 8000;
                }
                // Spawn announcement & greeting
                if (!this.hasAnnouncedSpawn) {
                    this.hasAnnouncedSpawn = true;
                    setTimeout(() => {
                        try {
                            if (this.bot && this.status === 'online') {
                                this.bot.chat('CraftBot 24/7 online! Type "!help" or mention me for commands.');
                            }
                        }
                        catch (e) { }
                    }, 2500);
                }
                // Handle optional AuthMe auto-login
                if (this.config.authPassword && this.bot) {
                    setTimeout(() => {
                        try {
                            if (this.bot && this.status === 'online') {
                                console.log(`[Bot ${this.config.username}] Sending auto-login command...`);
                                this.bot.chat(`/login ${this.config.authPassword}`);
                            }
                        }
                        catch (e) {
                            console.error('Auto-login error:', e);
                        }
                    }, 1200);
                }
                // Configure auto-eat
                if (this.isAutoEatActive && this.bot?.autoEat) {
                    this.bot.autoEat.options = {
                        priority: 'foodPoints',
                        startAt: 14,
                        bannedFood: ['rotten_flesh', 'spider_eye', 'poisonous_potato', 'pufferfish'],
                    };
                }
                // Start automation and health loops
                this.startAntiAfk();
                this.startAutoAttack();
                this.startStateBroadcasting();
                this.startConnectionHealthWatchdog();
                // Broadcast initial states
                this.broadcastState();
                this.broadcastInventory();
            }
            catch (err) {
                console.error(`[Bot ${this.config.username} Spawn Setup Error]:`, err);
            }
        });
        // In-Game Chat Command Listener (commands processed without emitting duplicate UI chat)
        this.bot.on('chat', (username, message) => {
            try {
                const sanitizedText = validator_1.SecurityValidator.sanitizeChatMessage(message);
                const textToDisplay = sanitizedText.sanitized || message;
                // Process in-game commands (public and owner-only)
                this.handleInGameCommand(username, textToDisplay);
            }
            catch (err) {
                console.error('Chat handling error:', err);
            }
        });
        // Unified In-Game Chat & System Messages Listener with Deduplication
        this.bot.on('message', (jsonMsg) => {
            try {
                const plainText = jsonMsg.toString();
                if (!plainText.trim())
                    return;
                const sanitized = validator_1.SecurityValidator.sanitizeChatMessage(plainText);
                const textToDisplay = sanitized.sanitized || plainText;
                // Emit single unified message to web dashboard
                this.emitChatMessage(textToDisplay, undefined, true, jsonMsg);
                // Check for authentic whisper commands
                this.handleWhisperFromText(textToDisplay);
            }
            catch (err) {
                console.error('System message handling error:', err);
            }
        });
        // Smart Door Handler: Automatically close doors behind the bot as it walks through
        this.bot.on('move', () => {
            this.handleDoorClosing();
        });
        // Health & Hunger updates
        this.bot.on('health', () => {
            this.broadcastState();
        });
        // Inventory Updates
        this.bot.on('playerCollect', () => {
            this.broadcastInventory();
        });
        this.bot.inventory.on('updateSlot', () => {
            this.broadcastInventory();
        });
        // Error & Disconnection Handling
        this.bot.on('kicked', (reason) => {
            const reasonStr = typeof reason === 'string' ? reason : JSON.stringify(reason);
            console.log(`[Bot ${this.config.username}] Kicked from server:`, reasonStr);
            this.status = 'offline';
            this.errorMessage = reasonStr;
            // Check if kick is permanent ban or whitelist rejection
            const isPermanent = validator_1.SecurityValidator.isBanOrPermanentKick(reasonStr);
            if (isPermanent) {
                console.warn(`[Bot ${this.config.username}] Server issued ban/whitelist kick. Auto-reconnect permanently disabled.`);
            }
            this.broadcastState();
            this.io.to(this.userId).emit('bot-error', `Kicked: ${reasonStr}`);
            this.cleanup();
        });
        this.bot.on('end', (reason) => {
            console.log(`[Bot ${this.config.username}] Connection ended:`, reason);
            this.status = 'offline';
            this.broadcastState();
            this.cleanup();
        });
        this.bot.on('error', (err) => {
            console.error(`[Bot ${this.config.username}] Error:`, err);
            this.status = 'error';
            this.errorMessage = err.message;
            this.broadcastState();
            this.io.to(this.userId).emit('bot-error', err.message);
        });
    }
    /**
     * Broadcast message to dashboard with deduplication protection
     */
    emitChatMessage(text, sender, isSystem = false, raw) {
        const now = Date.now();
        // Discard identical consecutive message if within 800ms
        if (this.lastEmittedChatMessage.text === text && now - this.lastEmittedChatMessage.time < 800) {
            return;
        }
        this.lastEmittedChatMessage = { text, time: now };
        this.io.to(this.userId).emit('chat-message', {
            id: Math.random().toString(36).substring(2, 9),
            sender,
            text,
            raw,
            timestamp: now,
            isSystem,
        });
    }
    /**
     * Automatically detect when bot has walked through an open door, and close it behind the bot
     */
    handleDoorClosing() {
        if (!this.bot || !this.bot.entity)
            return;
        const pos = this.bot.entity.position;
        // Scan nearby blocks (2 block radius) for open doors/gates
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -1; dy <= 2; dy++) {
                for (let dz = -2; dz <= 2; dz++) {
                    try {
                        const block = this.bot.blockAt(pos.offset(dx, dy, dz));
                        if (block && (block.name.endsWith('_door') || block.name.endsWith('_gate') || block.name.endsWith('_fence_gate'))) {
                            const props = block.getProperties();
                            const isOpen = props?.open === true || props?.open === 'true';
                            const key = `${block.position.x},${block.position.y},${block.position.z}`;
                            if (isOpen && !this.trackedDoors.has(key)) {
                                const dist = pos.distanceTo(block.position);
                                this.trackedDoors.set(key, {
                                    x: block.position.x,
                                    y: block.position.y,
                                    z: block.position.z,
                                    openedAt: Date.now(),
                                    initialDist: dist,
                                });
                            }
                        }
                    }
                    catch (e) { }
                }
            }
        }
        // Check tracked doors and close them if the bot has stepped past them
        const now = Date.now();
        for (const [key, tracked] of this.trackedDoors.entries()) {
            try {
                const doorBlock = this.bot.blockAt(new this.bot.vec3(tracked.x, tracked.y, tracked.z) || pos.offset(0, 0, 0));
                if (!doorBlock) {
                    this.trackedDoors.delete(key);
                    continue;
                }
                const currentDist = pos.distanceTo(doorBlock.position);
                // If bot is between 1.6 and 3.2 blocks away and further away than when it entered
                if (currentDist > 1.6 && currentDist < 3.2 && currentDist > tracked.initialDist + 0.5) {
                    const props = doorBlock.getProperties();
                    if (props?.open === true || props?.open === 'true') {
                        this.bot.activateBlock(doorBlock).catch(() => { });
                    }
                    this.trackedDoors.delete(key);
                }
                else if (currentDist >= 3.5 || now - tracked.openedAt > 8000) {
                    this.trackedDoors.delete(key);
                }
            }
            catch (e) {
                this.trackedDoors.delete(key);
            }
        }
    }
    /**
     * Process in-game commands sent in public chat
     * Tiered System: Common commands for everyone, Owner-only commands strictly for ownerIgn
     */
    handleInGameCommand(sender, message) {
        if (!this.bot || this.status !== 'online')
            return;
        // Do not respond to self
        if (sender.trim().toLowerCase() === this.config.username.trim().toLowerCase())
            return;
        const trimmed = message.trim();
        const lower = trimmed.toLowerCase();
        const isOwner = sender.trim().toLowerCase() === this.config.ownerIgn.trim().toLowerCase();
        const botNameLower = this.config.username.trim().toLowerCase();
        const isMention = lower.includes(botNameLower) || lower.includes('@' + botNameLower);
        // Throttle commands to prevent chat spam (min 1 second between replies)
        const now = Date.now();
        if (now - this.lastInGameCommandTime < 1000)
            return;
        // 1. HELP / COMMANDS (Available for everyone)
        if (lower === '!help' || lower === '!commands' || lower === '!cmds') {
            this.lastInGameCommandTime = now;
            this.bot.chat(`[Commands] Public: !help, !follow, !stop, !status, !hi | Owner (${this.config.ownerIgn}): !leave, !dropall, !eat, !attack, !say`);
            return;
        }
        // 2. GREETINGS & MENTIONS (Available for everyone)
        if (lower === '!hi' || lower === '!hello' || (isMention && !trimmed.startsWith('!'))) {
            this.lastInGameCommandTime = now;
            this.bot.chat(`Hello ${sender}! I am CraftBot. Use "!help" to see available commands.`);
            return;
        }
        // 3. FOLLOW / COME (Available for everyone)
        if (lower.startsWith('!follow') || lower.startsWith('!come')) {
            this.lastInGameCommandTime = now;
            const parts = trimmed.split(/\s+/);
            const targetName = (isOwner && parts[1]) ? parts[1] : sender;
            this.followPlayer(targetName);
            return;
        }
        // 4. STOP / HALT (Available for everyone)
        if (lower.startsWith('!stop') || lower.startsWith('!halt')) {
            this.lastInGameCommandTime = now;
            this.stopFollow();
            this.bot.chat(`Stopped following.`);
            return;
        }
        // 5. STATUS / INFO (Available for everyone)
        if (lower.startsWith('!status') || lower.startsWith('!info')) {
            this.lastInGameCommandTime = now;
            const pos = this.bot.entity?.position;
            const x = pos ? Math.round(pos.x) : 0;
            const y = pos ? Math.round(pos.y) : 0;
            const z = pos ? Math.round(pos.z) : 0;
            this.bot.chat(`HP: ${Math.round(this.bot.health || 20)}/20 | Food: ${Math.round(this.bot.food || 20)}/20 | Pos: ${x}, ${y}, ${z} (${this.bot.game.dimension})`);
            return;
        }
        // 6. OWNER-ONLY COMMANDS:
        if (lower.startsWith('!leave') || lower.startsWith('!quit') || lower.startsWith('!disconnect') ||
            lower.startsWith('!drop') || lower.startsWith('!dropall') || lower.startsWith('!toss') ||
            lower.startsWith('!eat') || lower.startsWith('!feed') ||
            lower.startsWith('!attack') || lower.startsWith('!grind') ||
            lower.startsWith('!antiafk') || lower.startsWith('!say')) {
            this.lastInGameCommandTime = now;
            if (!isOwner) {
                this.bot.chat(`Sorry ${sender}, only owner <${this.config.ownerIgn}> can use that command!`);
                return;
            }
            if (lower.startsWith('!leave') || lower.startsWith('!quit') || lower.startsWith('!disconnect')) {
                this.bot.chat(`Goodbye ${sender}! Disconnecting as requested.`);
                setTimeout(() => this.stop(), 500);
                return;
            }
            if (lower.startsWith('!drop') || lower.startsWith('!dropall') || lower.startsWith('!toss')) {
                this.tossAll();
                this.bot.chat(`Dropped all inventory items.`);
                return;
            }
            if (lower.startsWith('!eat') || lower.startsWith('!feed')) {
                if (this.bot?.autoEat) {
                    this.bot.autoEat.eat().then(() => {
                        this.bot?.chat(`Eating food from inventory.`);
                    }).catch(() => {
                        this.bot?.chat(`No edible food found in inventory.`);
                    });
                }
                return;
            }
            if (lower.startsWith('!attack') || lower.startsWith('!grind')) {
                this.isAutoAttackActive = !this.isAutoAttackActive;
                this.bot.chat(`Auto-attack grinder: ${this.isAutoAttackActive ? 'ENABLED' : 'DISABLED'}`);
                return;
            }
            if (lower.startsWith('!antiafk')) {
                this.isAntiAfkActive = !this.isAntiAfkActive;
                this.bot.chat(`Anti-AFK: ${this.isAntiAfkActive ? 'ENABLED' : 'DISABLED'}`);
                return;
            }
            if (lower.startsWith('!say ')) {
                const toSay = trimmed.substring(5).trim();
                if (toSay) {
                    this.bot.chat(toSay);
                }
                return;
            }
        }
    }
    /**
     * Parses whispers securely
     */
    handleWhisperFromText(text) {
        const owner = this.config.ownerIgn.trim();
        if (!owner)
            return;
        const escapedOwner = owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^(?:${escapedOwner}\\s+whispers to you|${escapedOwner}\\s+whispers|\\[${escapedOwner}\\s*->\\s*me\\])\\s*[:>]\\s*(.+)`, 'i');
        const match = text.match(regex);
        if (match && match[1]) {
            this.handleInGameCommand(owner, match[1].trim());
        }
    }
    /**
     * Send a chat message or slash command with input sanitization
     */
    sendChat(message) {
        if (!this.bot || this.status !== 'online')
            return;
        const sanitized = validator_1.SecurityValidator.sanitizeChatMessage(message);
        if (!sanitized.valid || !sanitized.sanitized)
            return;
        try {
            this.bot.chat(sanitized.sanitized);
        }
        catch (err) {
            console.error(`[Bot ${this.config.username}] Failed to send chat:`, err);
        }
    }
    /**
     * Follow a player with pathfinder (with error boundary)
     */
    followPlayer(playerName) {
        if (!this.bot || this.status !== 'online')
            return;
        const validatedTarget = validator_1.SecurityValidator.validateUsername(playerName);
        if (!validatedTarget.valid)
            return;
        const target = this.bot.players[validatedTarget.sanitized]?.entity;
        if (!target) {
            this.bot.chat(`Cannot find player ${validatedTarget.sanitized} nearby.`);
            return;
        }
        try {
            this.isFollowing = true;
            this.targetPlayerToFollow = validatedTarget.sanitized;
            this.bot.pathfinder.setGoal(new mineflayer_pathfinder_1.goals.GoalFollow(target, 2), true);
            this.bot.chat(`Following ${validatedTarget.sanitized}...`);
        }
        catch (err) {
            console.error('Follow pathfinding error:', err);
            this.stopFollow();
        }
    }
    stopFollow() {
        if (!this.bot)
            return;
        try {
            this.isFollowing = false;
            this.targetPlayerToFollow = null;
            this.bot.pathfinder.setGoal(null);
        }
        catch (err) { }
    }
    /**
     * Anti-AFK Routine
     */
    startAntiAfk() {
        if (this.antiAfkInterval)
            clearInterval(this.antiAfkInterval);
        if (!this.isAntiAfkActive)
            return;
        this.antiAfkInterval = setInterval(() => {
            if (!this.bot || this.status !== 'online' || this.isFollowing)
                return;
            try {
                const randomYaw = this.bot.entity.yaw + (Math.random() * 0.4 - 0.2);
                const randomPitch = (Math.random() * 0.3 - 0.15);
                this.bot.look(randomYaw, randomPitch, false);
                const action = Math.random();
                if (action > 0.7) {
                    this.bot.setControlState('sneak', true);
                    setTimeout(() => this.bot?.setControlState('sneak', false), 800);
                }
                else if (action > 0.5) {
                    this.bot.swingArm('right');
                }
            }
            catch (e) { }
        }, 15000);
    }
    setAntiAfk(enabled) {
        this.isAntiAfkActive = enabled;
        if (enabled) {
            this.startAntiAfk();
        }
        else if (this.antiAfkInterval) {
            clearInterval(this.antiAfkInterval);
            this.antiAfkInterval = null;
        }
    }
    /**
     * Auto-Attack for Mob Grinders
     */
    startAutoAttack() {
        if (this.autoAttackInterval)
            clearInterval(this.autoAttackInterval);
        if (!this.isAutoAttackActive)
            return;
        this.autoAttackInterval = setInterval(() => {
            if (!this.bot || this.status !== 'online')
                return;
            try {
                const mobFilter = (entity) => entity.type === 'mob' &&
                    entity.name !== 'armor_stand' &&
                    this.bot.entity.position.distanceTo(entity.position) <= 3.5;
                const target = this.bot.nearestEntity(mobFilter);
                if (target) {
                    this.bot.lookAt(target.position.offset(0, target.height * 0.6, 0))
                        .then(() => {
                        if (this.bot && target.isValid) {
                            this.bot.attack(target);
                        }
                    })
                        .catch(() => { });
                }
            }
            catch (err) { }
        }, 650);
    }
    setAutoAttack(enabled) {
        this.isAutoAttackActive = enabled;
        if (enabled) {
            this.startAutoAttack();
        }
        else if (this.autoAttackInterval) {
            clearInterval(this.autoAttackInterval);
            this.autoAttackInterval = null;
        }
    }
    setAutoEat(enabled) {
        this.isAutoEatActive = enabled;
        if (this.bot?.autoEat) {
            this.bot.autoEat.options.bannedFood = enabled
                ? ['rotten_flesh', 'spider_eye', 'poisonous_potato', 'pufferfish']
                : [];
        }
    }
    /**
     * Disconnect Timer
     */
    setDisconnectTimer(minutes) {
        const validMinutes = validator_1.SecurityValidator.validateTimerMinutes(minutes);
        if (!validMinutes.valid)
            return;
        this.cancelDisconnectTimer();
        const ms = validMinutes.sanitized * 60 * 1000;
        this.disconnectTimerEnd = Date.now() + ms;
        this.disconnectTimer = setTimeout(() => {
            console.log(`[Bot ${this.config.username}] Auto-disconnect timer expired (${minutes}m). Leaving...`);
            if (this.bot) {
                try {
                    this.bot.chat(`Disconnect timer expired. Leaving game...`);
                }
                catch (e) { }
            }
            setTimeout(() => this.stop(), 500);
        }, ms);
        this.broadcastTimer();
    }
    cancelDisconnectTimer() {
        if (this.disconnectTimer) {
            clearTimeout(this.disconnectTimer);
            this.disconnectTimer = null;
            this.disconnectTimerEnd = null;
            this.broadcastTimer();
        }
    }
    broadcastTimer() {
        if (!this.disconnectTimerEnd) {
            this.io.to(this.userId).emit('timer-update', null);
            return;
        }
        const remainingSeconds = Math.max(0, Math.round((this.disconnectTimerEnd - Date.now()) / 1000));
        this.io.to(this.userId).emit('timer-update', remainingSeconds);
    }
    /**
     * Half-Open TCP Socket Watchdog
     * Detects silent connection drops / zombie TCP sockets
     */
    startConnectionHealthWatchdog() {
        if (this.connectionHealthInterval)
            clearInterval(this.connectionHealthInterval);
        this.connectionHealthInterval = setInterval(() => {
            if (this.status !== 'online' || !this.bot)
                return;
            const timeSinceLastPacket = Date.now() - this.lastPacketTime;
            // If 90 seconds have passed without a single packet from the server, connection is dead
            if (timeSinceLastPacket > 90000) {
                console.warn(`[Bot ${this.config.username}] Half-open connection detected (no packets for 90s). Cleanly disconnecting...`);
                this.stop();
            }
        }, 30000);
    }
    /**
     * Inventory Interactions with Slot Boundary Protection
     */
    tossItem(slot, count) {
        if (!this.bot || this.status !== 'online')
            return;
        const validSlot = validator_1.SecurityValidator.validateInventorySlot(slot);
        if (!validSlot.valid)
            return;
        const item = this.bot.inventory?.slots?.[validSlot.sanitized];
        if (!item)
            return;
        const amountToToss = (count && count > 0 && count <= item.count) ? count : item.count;
        this.bot.toss(item.type, null, amountToToss)
            .then(() => this.broadcastInventory())
            .catch((err) => console.error('Toss error:', err));
    }
    tossAll() {
        if (!this.bot || this.status !== 'online')
            return;
        try {
            const items = this.bot.inventory.items();
            items.forEach((item, index) => {
                setTimeout(() => {
                    if (this.bot && this.status === 'online') {
                        this.bot.tossStack(item).catch(() => { });
                    }
                }, index * 100);
            });
        }
        catch (err) { }
    }
    equipItem(slot, destination) {
        if (!this.bot || this.status !== 'online')
            return;
        const validSlot = validator_1.SecurityValidator.validateInventorySlot(slot);
        if (!validSlot.valid)
            return;
        const item = this.bot.inventory?.slots?.[validSlot.sanitized];
        if (!item)
            return;
        this.bot.equip(item, destination)
            .then(() => this.broadcastInventory())
            .catch((err) => console.error('Equip error:', err));
    }
    broadcastInventory() {
        if (!this.bot || !this.bot.inventory)
            return;
        try {
            const items = this.bot.inventory.slots
                .map((item, slot) => {
                if (!item)
                    return null;
                return {
                    slot,
                    name: item.name,
                    displayName: item.displayName,
                    count: item.count,
                    type: item.type,
                    maxDurability: item.maxDurability,
                    durabilityUsed: item.durabilityUsed,
                };
            })
                .filter(Boolean);
            this.io.to(this.userId).emit('inventory-update', items);
        }
        catch (err) {
            console.error('Broadcast inventory error:', err);
        }
    }
    /**
     * Periodic State Broadcasting
     */
    startStateBroadcasting() {
        if (this.stateBroadcastInterval)
            clearInterval(this.stateBroadcastInterval);
        this.stateBroadcastInterval = setInterval(() => {
            this.broadcastState();
            if (this.disconnectTimerEnd) {
                this.broadcastTimer();
            }
        }, 1000);
    }
    broadcastState() {
        const uptimeSeconds = this.uptimeStart > 0
            ? Math.floor((Date.now() - this.uptimeStart) / 1000)
            : 0;
        const payload = {
            status: this.status,
            username: this.config.username,
            serverIp: this.config.serverIp,
            serverPort: this.config.serverPort,
            health: this.bot?.health ?? 20,
            food: this.bot?.food ?? 20,
            xpLevel: this.bot?.experience?.level ?? 0,
            xpProgress: this.bot?.experience?.progress ?? 0,
            dimension: this.bot?.game?.dimension ?? 'minecraft:overworld',
            position: this.bot?.entity?.position
                ? {
                    x: this.bot.entity.position.x,
                    y: this.bot.entity.position.y,
                    z: this.bot.entity.position.z,
                }
                : { x: 0, y: 64, z: 0 },
            ping: this.bot?.player?.ping ?? 0,
            uptimeSeconds,
            error: this.errorMessage,
            ownerIgn: this.config.ownerIgn,
        };
        this.io.to(this.userId).emit('bot-state', payload);
    }
    /**
     * Clean up and stop bot with complete resource detachment
     */
    stop() {
        this.status = 'offline';
        this.cleanup();
        if (this.bot) {
            try {
                this.bot.removeAllListeners();
                if (this.bot._client) {
                    this.bot._client.removeAllListeners();
                }
                this.bot.quit();
            }
            catch (e) { }
            this.bot = null;
        }
        this.broadcastState();
    }
    cleanup() {
        if (this.antiAfkInterval) {
            clearInterval(this.antiAfkInterval);
            this.antiAfkInterval = null;
        }
        if (this.autoAttackInterval) {
            clearInterval(this.autoAttackInterval);
            this.autoAttackInterval = null;
        }
        if (this.stateBroadcastInterval) {
            clearInterval(this.stateBroadcastInterval);
            this.stateBroadcastInterval = null;
        }
        if (this.connectionHealthInterval) {
            clearInterval(this.connectionHealthInterval);
            this.connectionHealthInterval = null;
        }
        this.cancelDisconnectTimer();
    }
}
exports.BotInstance = BotInstance;
