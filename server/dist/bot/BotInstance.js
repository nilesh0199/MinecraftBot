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
const GroqChatService_1 = require("../ai/GroqChatService");
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
    autoEatWatcherInterval = null;
    isEatingFallback = false;
    disconnectTimer = null;
    disconnectTimerEnd = null;
    stateBroadcastInterval = null;
    lastInGameCommandTime = 0;
    hasAnnouncedSpawn = false;
    spawnTime = 0;
    lastPlayerGreetingTime = 0;
    lastEmittedChatMessage = { text: '', time: 0 };
    trackedDoors = new Map();
    doorCooldowns = new Map();
    // Smart Reconnect & Offline Handling
    isExplicitlyStopped = false;
    retryCount = 0;
    maxRetries = 5;
    retryTimer = null;
    nextRetryAt = 0;
    // Automation flags
    isAntiAfkActive = true;
    isAutoEatActive = true;
    isAutoAttackActive = false;
    isAiChatActive = true;
    isFollowing = false;
    targetPlayerToFollow = null;
    onOwnerChanged;
    onUsernameChanged;
    tempLeaveTimer = null;
    groqService = GroqChatService_1.GroqChatService.getInstance();
    constructor(userId, config, io) {
        this.userId = userId;
        this.config = config;
        this.io = io;
        this.isAntiAfkActive = config.antiAfk ?? true;
        this.isAutoEatActive = config.autoEat ?? true;
        this.isAutoAttackActive = config.autoAttack ?? false;
        this.isAiChatActive = config.isAiChatActive ?? true;
        // Start continuous 1-second state broadcasting for this slot
        this.startStateBroadcasting();
    }
    /**
     * Cleanly destroy previous bot instance and close underlying TCP socket
     */
    destroyBot() {
        if (this.bot) {
            try {
                this.bot.removeAllListeners();
                const client = this.bot._client;
                if (client) {
                    if (typeof client.removeAllListeners === 'function') {
                        client.removeAllListeners();
                    }
                    if (client.socket && typeof client.socket.destroy === 'function') {
                        try {
                            client.socket.destroy();
                        }
                        catch (e) { }
                    }
                }
                this.bot.quit();
            }
            catch (e) { }
            this.bot = null;
        }
    }
    start() {
        this.destroyBot();
        // Universal host and port normalization (handles host:port, prefixes, trailing slashes)
        const { host: cleanedHost, port: cleanedPort } = validator_1.SecurityValidator.cleanServerAddressAndPort(this.config.serverIp, this.config.serverPort);
        this.config.serverIp = cleanedHost;
        this.config.serverPort = cleanedPort;
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
        this.isExplicitlyStopped = false;
        this.cancelRetryTimer();
        this.broadcastState();
        console.log(`[Bot ${this.config.username}] Connecting to ${hostValidation.sanitized}:${portValidation.sanitized}...`);
        this.emitChatMessage(`Connecting to ${this.config.serverIp}:${this.config.serverPort}...`, undefined, true);
        try {
            const botOpts = {
                host: hostValidation.sanitized,
                port: portValidation.sanitized,
                username: userValidation.sanitized,
                auth: 'offline', // Cracked server authentication
                checkTimeoutInterval: 45000, // 45s ping timeout
                hideErrors: false,
            };
            // Version: Use explicitly selected version if provided and not 'auto'
            if (this.config.version && this.config.version !== 'auto') {
                botOpts.version = this.config.version;
            }
            this.bot = mineflayer_1.default.createBot(botOpts);
            // Attach core listeners immediately so errors/kicks during connection are always handled
            this.setupListeners();
            // Defensive: Catch low-level client socket errors (e.g. ECONNRESET, broken pipes, ETIMEDOUT)
            const attachClientListeners = (client) => {
                if (!client || !client.on)
                    return;
                client.on('error', (err) => {
                    console.error(`[Bot ${this.config.username} Socket Error Caught]:`, err?.message);
                    const isTimeout = err?.code === 'ETIMEDOUT' || err?.message?.includes('ETIMEDOUT');
                    const isReset = err?.code === 'ECONNRESET' || err?.message?.includes('ECONNRESET');
                    const reason = isTimeout
                        ? 'Connection timed out (Server offline or firewall unreachable)'
                        : isReset
                            ? 'Connection reset (Server offline or restarting)'
                            : (err?.message || 'Socket error');
                    this.handleAutoReconnect(reason);
                });
                client.on('end', () => {
                    this.handleAutoReconnect('Minecraft client stream ended');
                });
                client.on('connect_allowed', () => {
                    if (client.socket && client.socket.on) {
                        client.socket.on('error', (err) => {
                            console.error(`[Bot ${this.config.username} TCP Error Caught]:`, err?.message);
                        });
                        client.socket.on('close', () => {
                            this.handleAutoReconnect('TCP socket closed');
                        });
                    }
                });
            };
            if (this.bot?._client) {
                attachClientListeners(this.bot._client);
            }
            this.bot.on('inject_allowed', () => {
                attachClientListeners(this.bot?._client);
            });
            // Load plugins
            this.bot.loadPlugin(mineflayer_pathfinder_1.pathfinder);
            this.bot.loadPlugin(mineflayer_auto_eat_1.plugin);
        }
        catch (err) {
            this.failFast(err?.message || 'Failed to initialize Minecraft client.');
        }
    }
    failFast(error) {
        this.status = 'error';
        this.errorMessage = error;
        this.broadcastState();
        this.io.to(this.userId).emit('bot-error', { slotId: this.userId, error });
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
        // 2b. Bed Sleep & Wake Events
        this.bot.on('sleep', () => {
            console.log(`[Bot ${this.config.username}] Bot entered bed to sleep.`);
            this.broadcastState();
        });
        this.bot.on('wake', () => {
            console.log(`[Bot ${this.config.username}] Bot woke up from bed.`);
            try {
                this.bot?.chat('☀️ Good morning! Woke up from bed.');
            }
            catch (e) { }
            this.broadcastState();
        });
        // 2c. Successful Login Handshake with Server
        this.bot.on('login', () => {
            console.log(`[Bot ${this.config.username}] Successfully logged into ${this.config.serverIp}:${this.config.serverPort}! Waiting for world chunks...`);
            this.emitChatMessage(`✅ Logged into server successfully! Loading world chunks...`, undefined, true);
            this.status = 'connecting';
            this.errorMessage = 'Logged in! Loading world chunks...';
            this.broadcastState();
        });
        // 3. Successful Spawn in World
        this.bot.once('spawn', () => {
            try {
                console.log(`[Bot ${this.config.username}] Successfully spawned in ${this.config.serverIp}!`);
                this.emitChatMessage(`🌍 Spawned into world! Bot is online and active.`, undefined, true);
                this.status = 'online';
                this.uptimeStart = Date.now();
                this.spawnTime = Date.now();
                this.errorMessage = null;
                this.retryCount = 0;
                this.cancelRetryTimer();
                // Setup pathfinder movements with anti-cheat safe defaults & door navigation
                if (this.bot) {
                    const defaultMove = new mineflayer_pathfinder_1.Movements(this.bot);
                    defaultMove.canDig = false; // Prevents triggering server anti-cheat for impossible mining
                    defaultMove.allow1by1towers = false;
                    defaultMove.allowFreeMotion = false;
                    defaultMove.canOpenDoors = true; // Enables opening doors & fence gates smoothly during pathfinding
                    // Register all non-iron doors, trapdoors, and fence gates as openable
                    if (this.bot.registry?.blocksArray) {
                        this.bot.registry.blocksArray.forEach((b) => {
                            if (b && b.name) {
                                const name = b.name.toLowerCase();
                                const isPassableDoor = (name.endsWith('_door') || name.endsWith('_gate') || name.endsWith('_fence_gate')) && !name.includes('iron');
                                if (isPassableDoor) {
                                    defaultMove.openable.add(b.id);
                                }
                            }
                        });
                    }
                    // Patch getBlock on defaultMove so pathfinder A* considers wooden doors openable, safe, and traversable
                    const originalGetBlock = defaultMove.getBlock.bind(defaultMove);
                    defaultMove.getBlock = (node, dx, dy, dz) => {
                        const b = originalGetBlock(node, dx, dy, dz);
                        if (b && b.name) {
                            const name = b.name.toLowerCase();
                            const isPassableDoor = (name.endsWith('_door') || name.endsWith('_gate') || name.endsWith('_fence_gate')) && !name.includes('iron');
                            if (isPassableDoor) {
                                b.openable = true;
                                b.safe = true;
                                b.physical = false; // Pathfinder calculates path straight through the doorway without treating it as solid rock!
                            }
                        }
                        return b;
                    };
                    // Patch safeOrBreak on defaultMove so doors have minimal traversal cost and never require breaking
                    const originalSafeOrBreak = defaultMove.safeOrBreak.bind(defaultMove);
                    defaultMove.safeOrBreak = (block, ...args) => {
                        if (block && block.name) {
                            const name = block.name.toLowerCase();
                            const isPassableDoor = (name.endsWith('_door') || name.endsWith('_gate') || name.endsWith('_fence_gate')) && !name.includes('iron');
                            if (isPassableDoor) {
                                return 1; // Minimal step cost, no mining
                            }
                        }
                        return originalSafeOrBreak(block, ...args);
                    };
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
                // Configure auto-eat plugin with optimal options & listeners
                if (this.bot?.autoEat) {
                    this.bot.autoEat.options = {
                        priority: 'foodPoints',
                        startAt: 16,
                        eatingTimeout: 3000,
                        bannedFood: ['rotten_flesh', 'spider_eye', 'poisonous_potato', 'pufferfish', 'chorus_fruit', 'suspicious_stew'],
                        ignoreInventoryCheck: true,
                        checkOnItemPickup: true,
                        offhand: true,
                        equipOldItem: true,
                    };
                    if (this.isAutoEatActive) {
                        this.bot.autoEat.enable();
                    }
                    else {
                        this.bot.autoEat.disable();
                    }
                    this.bot.on('autoeat_started', (item, offhand) => {
                        console.log(`[Bot ${this.config.username}] Auto-eating ${item?.name || 'food'} (${offhand ? 'offhand' : 'main hand'})...`);
                        this.emitChatMessage(`🍖 Auto-eating ${item?.name || 'food'}...`, undefined, true);
                    });
                    this.bot.on('autoeat_finished', (item) => {
                        console.log(`[Bot ${this.config.username}] Finished eating ${item?.name || 'food'}. Food: ${this.bot?.food}/20`);
                        this.emitChatMessage(`✅ Finished eating ${item?.name || 'food'}. Hunger: ${this.bot?.food}/20`, undefined, true);
                        this.broadcastState();
                    });
                    this.bot.on('autoeat_error', (err) => {
                        // If plugin failed, try our direct fallback eater
                        if (this.isAutoEatActive && this.bot && this.bot.food <= 16) {
                            this.manualEatFood();
                        }
                    });
                }
                // Start automation and state broadcasting loops
                this.startAntiAfk();
                this.startAutoAttack();
                this.startAutoEatWatcher();
                this.startStateBroadcasting();
                // Broadcast initial states & hook inventory updates
                if (this.bot && this.bot.inventory?.on) {
                    this.bot.inventory.on('updateSlot', () => {
                        this.broadcastInventory();
                    });
                }
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
        // Welcome Greeting for New Players Joining (with 10-minute anti-spam cooldown)
        this.bot.on('playerJoined', (player) => {
            try {
                if (!player || !player.username)
                    return;
                // Never greet self or bot username
                const ign = String(player.username).trim();
                if (!ign || ign.toLowerCase() === this.config.username.toLowerCase())
                    return;
                if (this.bot?.username && ign.toLowerCase() === this.bot.username.toLowerCase())
                    return;
                // Skip during initial 8 seconds of spawn to prevent greeting all players already on the server
                if (Date.now() - this.spawnTime < 8000)
                    return;
                // Anti-spam cooldown: at most 1 greeting every 10 minutes if players join quickly
                const now = Date.now();
                const tenMinutesMs = 10 * 60 * 1000;
                if (now - this.lastPlayerGreetingTime < tenMinutesMs) {
                    return;
                }
                this.lastPlayerGreetingTime = now;
                const welcomeMsg = `Hello ${ign}! Type !help for commands`;
                console.log(`[Bot ${this.config.username}] Welcomed joining player ${ign}: "${welcomeMsg}"`);
                if (this.status === 'online' && this.bot) {
                    this.bot.chat(welcomeMsg);
                }
                this.emitChatMessage(`👋 ${welcomeMsg}`, this.config.username, false);
            }
            catch (err) {
                console.warn(`[Bot ${this.config.username}] Error in playerJoined greeting:`, err);
            }
        });
        // Smart Door Handler: Automatically open closed doors and close them after passing through
        let doorTickCounter = 0;
        this.bot.on('physicTick', () => {
            doorTickCounter++;
            if (doorTickCounter % 3 === 0) {
                this.handleSmartDoors();
            }
        });
        this.bot.on('move', () => {
            this.handleSmartDoors();
        });
        // Health & Hunger updates
        this.bot.on('health', () => {
            this.broadcastState();
        });
        // Inventory Updates
        this.bot.on('playerCollect', () => {
            this.broadcastInventory();
        });
        // Inventory Updates (safely hook when inventory is ready or when windows open)
        if (this.bot?.inventory?.on) {
            this.bot.inventory.on('updateSlot', () => {
                this.broadcastInventory();
            });
        }
        this.bot.on('windowOpen', (window) => {
            try {
                if (window?.on) {
                    window.on('updateSlot', () => {
                        this.broadcastInventory();
                    });
                }
            }
            catch (e) { }
        });
        // Error & Disconnection Handling
        this.bot.on('kicked', (reason) => {
            let reasonStr = '';
            if (typeof reason === 'string') {
                reasonStr = reason;
            }
            else if (reason && typeof reason === 'object') {
                if (reason.extra && Array.isArray(reason.extra)) {
                    reasonStr = reason.extra.map((e) => (typeof e === 'object' ? (e.text || '') : String(e))).join('').trim();
                }
                if (!reasonStr && reason.text) {
                    reasonStr = reason.text;
                }
                if (!reasonStr && reason.translate) {
                    reasonStr = reason.translate;
                }
                if (!reasonStr) {
                    reasonStr = JSON.stringify(reason);
                }
            }
            if (!reasonStr || reasonStr === '{"text":""}' || reasonStr === '{}') {
                reasonStr = 'Disconnected by server (Connection rejected or session ended)';
            }
            console.log(`[Bot ${this.config.username}] Kicked from server: ${reasonStr}`);
            // Auto-detect version mismatch from kick message to self-heal on next reconnect
            const versionMatch = reasonStr.match(/(?:use|on|version)\s*(1\.\d+(?:\.\d+)?)/i);
            if (versionMatch && versionMatch[1]) {
                console.log(`[Bot ${this.config.username}] Detected server version from kick: ${versionMatch[1]}. Auto-adapting version.`);
                this.emitChatMessage(`ℹ️ Detected server version ${versionMatch[1]}. Auto-adapting for reconnect...`, undefined, true);
                this.config.version = versionMatch[1];
            }
            else if (this.config.version &&
                this.config.version !== 'auto' &&
                (reasonStr.toLowerCase().includes('outdated') ||
                    reasonStr.toLowerCase().includes('protocol') ||
                    reasonStr.includes('Connection rejected'))) {
                console.log(`[Bot ${this.config.username}] Handshake rejected with version ${this.config.version}. Switching to auto-negotiate for retry.`);
                this.emitChatMessage(`⚠️ Server rejected version ${this.config.version}. Auto-detecting exact server version on retry...`, undefined, true);
                this.config.version = 'auto';
            }
            // Check if kick is permanent ban or whitelist rejection
            const isPermanent = validator_1.SecurityValidator.isBanOrPermanentKick(reasonStr);
            if (isPermanent) {
                console.warn(`[Bot ${this.config.username}] Server issued ban/whitelist kick. Auto-reconnect permanently disabled.`);
                this.status = 'error';
                this.uptimeStart = 0;
                this.errorMessage = `Banned or not whitelisted: ${reasonStr}`;
                this.isExplicitlyStopped = true;
                this.cancelRetryTimer();
                this.broadcastState();
                this.io.to(this.userId).emit('bot-error', { slotId: this.userId, error: `Kicked: ${reasonStr}` });
                this.destroyBot();
                this.cleanup();
                return;
            }
            this.uptimeStart = 0;
            this.handleAutoReconnect(`Kicked: ${reasonStr}`);
        });
        this.bot.on('end', (reason) => {
            console.log(`[Bot ${this.config.username}] Connection ended:`, reason);
            this.uptimeStart = 0;
            this.handleAutoReconnect(`Disconnected from server (${reason || 'server closed'})`);
        });
        this.bot.on('error', (err) => {
            console.error(`[Bot ${this.config.username}] Error:`, err);
            this.uptimeStart = 0;
            const isTimeout = err?.code === 'ETIMEDOUT' || err?.message?.includes('ETIMEDOUT');
            const isConnReset = err?.code === 'ECONNRESET' || err?.message?.includes('ECONNRESET');
            const humanError = isTimeout
                ? 'Minecraft server is offline or unreachable (Connection timed out).'
                : isConnReset
                    ? 'Minecraft server connection was reset (Server offline or restarting).'
                    : (err?.message || 'Connection error');
            this.handleAutoReconnect(humanError);
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
            slotId: this.userId,
            id: Math.random().toString(36).substring(2, 9),
            sender,
            text,
            raw,
            timestamp: now,
            isSystem,
        });
    }
    /**
     * Smart Door Navigator:
     * 1. Detects and opens closed wooden doors/gates in front of the bot during pathfinding and following
     * 2. Safely closes the door behind the bot once it has passed through
     */
    handleSmartDoors() {
        if (!this.bot || this.status !== 'online' || !this.bot.entity)
            return;
        if (this.bot.isSleeping)
            return;
        const pos = this.bot.entity.position;
        const now = Date.now();
        const isPassableDoor = (name) => {
            if (!name)
                return false;
            const lower = name.toLowerCase();
            if (lower.includes('iron'))
                return false; // Iron doors/gates require redstone
            return lower.endsWith('_door') || lower.endsWith('_fence_gate') || lower.endsWith('_gate') || lower.endsWith('_trapdoor');
        };
        // 1. SCAN FOR NEARBY DOORS (Radius 2.5 blocks)
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -1; dy <= 2; dy++) {
                for (let dz = -2; dz <= 2; dz++) {
                    try {
                        const blockPos = pos.offset(dx, dy, dz);
                        const block = this.bot.blockAt(blockPos);
                        if (!block || !isPassableDoor(block.name))
                            continue;
                        const props = block.getProperties ? block.getProperties() : null;
                        const isOpen = props?.open === true || props?.open === 'true';
                        // Canonicalize to lower block for 2-block tall doors
                        const isUpper = props?.half === 'upper';
                        const canonicalBlock = isUpper ? (this.bot.blockAt(block.position.offset(0, -1, 0)) || block) : block;
                        const cPos = canonicalBlock.position;
                        const key = `${cPos.x},${cPos.y},${cPos.z}`;
                        const dist = pos.distanceTo(cPos);
                        const cooldown = this.doorCooldowns.get(key) || 0;
                        // Scenario A: CLOSED DOOR NEARBY -> Open it so bot can pass
                        if (!isOpen) {
                            // Open when bot is within interaction range (<= 2.6 blocks) and not on recent cooldown
                            if (dist <= 2.6 && now - cooldown > 900) {
                                this.doorCooldowns.set(key, now);
                                this.bot.activateBlock(canonicalBlock).then(() => {
                                    console.log(`[SmartDoor] Opened door at (${cPos.x}, ${cPos.y}, ${cPos.z})`);
                                }).catch(() => { });
                                // Track this door so we close it after walking through
                                this.trackedDoors.set(key, {
                                    x: cPos.x,
                                    y: cPos.y,
                                    z: cPos.z,
                                    openedAt: now,
                                    initialDist: dist,
                                    minDist: dist,
                                });
                            }
                        }
                        // Scenario B: OPEN DOOR NEARBY -> Register to track and close after passing
                        else if (isOpen && !this.trackedDoors.has(key) && dist <= 2.2) {
                            this.trackedDoors.set(key, {
                                x: cPos.x,
                                y: cPos.y,
                                z: cPos.z,
                                openedAt: now,
                                initialDist: dist,
                                minDist: dist,
                            });
                        }
                    }
                    catch (e) { }
                }
            }
        }
        // 2. CHECK TRACKED DOORS TO CLOSE BEHIND THE BOT
        for (const [key, tracked] of this.trackedDoors.entries()) {
            try {
                const doorPos = pos.offset(0, 0, 0);
                doorPos.x = tracked.x;
                doorPos.y = tracked.y;
                doorPos.z = tracked.z;
                const doorBlock = this.bot.blockAt(doorPos);
                if (!doorBlock || !isPassableDoor(doorBlock.name)) {
                    this.trackedDoors.delete(key);
                    continue;
                }
                const currentDist = pos.distanceTo(doorPos);
                tracked.minDist = Math.min(tracked.minDist, currentDist);
                // Conditions to close door:
                // 1. Bot has passed through (minDist was close <= 1.4, now currentDist >= 1.8)
                // 2. Bot is safely outside the door swing/collision box (1.8 <= currentDist <= 3.2)
                // 3. Not on recent action cooldown
                const cooldown = this.doorCooldowns.get(key) || 0;
                const hasPassed = (tracked.minDist <= 1.4 && currentDist >= 1.8 && currentDist <= 3.2) ||
                    (currentDist > tracked.initialDist + 0.8 && currentDist >= 1.8 && currentDist <= 3.2);
                if (hasPassed && now - cooldown > 900) {
                    const props = doorBlock.getProperties ? doorBlock.getProperties() : null;
                    const isOpen = props?.open === true || props?.open === 'true';
                    if (isOpen) {
                        this.doorCooldowns.set(key, now);
                        this.bot.activateBlock(doorBlock).then(() => {
                            console.log(`[SmartDoor] Closed door behind bot at (${tracked.x}, ${tracked.y}, ${tracked.z})`);
                        }).catch(() => { });
                    }
                    this.trackedDoors.delete(key);
                }
                else if (currentDist > 3.6 || now - tracked.openedAt > 10000) {
                    // Beyond reach or timed out, stop tracking
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
            this.bot.chat(`[Commands] Public: !help, !joke, !chat <msg>, !sleep, !wake, !nightskip, !follow, !stop, !status | Owner (${this.config.ownerIgn}): !rename <Name>, !shutdown bot, !transfer <IGN>, !ai on/off, !dropall, !eat, !attack`);
            return;
        }
        // 1b. JOKE / HUMOR (Available for everyone)
        if (lower === '!joke' || lower === '!funny' || lower === '!telljoke') {
            this.lastInGameCommandTime = now;
            this.tellJoke();
            return;
        }
        // 2. SLEEP IN BED (Available for everyone)
        if (lower === '!sleep' || lower === '!bed' || lower === '!gotosleep') {
            this.lastInGameCommandTime = now;
            this.goToSleep();
            return;
        }
        // 3. WAKE UP FROM BED (Available for everyone)
        if (lower === '!wake' || lower === '!wakeup') {
            this.lastInGameCommandTime = now;
            this.wakeUp();
            return;
        }
        // 4. NIGHT SKIP (Leave for 1 minute so players can sleep, then auto-rejoin)
        if (lower === '!nightskip' || lower === '!sleepleave' || lower === '!nap') {
            this.lastInGameCommandTime = now;
            this.temporarySleepLeave(60);
            return;
        }
        // 5. MISUNDERSTOOD LEAVE / QUIT (Safety prompt to prevent accidental bot termination)
        if (lower === '!leave' || lower === '!quit' || lower === '!disconnect') {
            this.lastInGameCommandTime = now;
            this.bot.chat(`[Notice] To let players sleep, use "!nightskip" (leaves for 1 min & auto-rejoins). To permanently shut me down, owner <${this.config.ownerIgn}> can type "!shutdown bot".`);
            return;
        }
        // 6. AI COMPANION TOGGLE (Owner only)
        if (lower === '!ai on' || lower === '!ai enable') {
            this.lastInGameCommandTime = now;
            if (!isOwner) {
                this.bot.chat(`Sorry ${sender}, only owner <${this.config.ownerIgn}> can toggle AI mode!`);
                return;
            }
            this.isAiChatActive = true;
            this.broadcastState();
            this.bot.chat(`[AI] Groq AI Chat Companion enabled! Talk to me with @${this.config.username} or "!chat <message>".`);
            return;
        }
        if (lower === '!ai off' || lower === '!ai disable') {
            this.lastInGameCommandTime = now;
            if (!isOwner) {
                this.bot.chat(`Sorry ${sender}, only owner <${this.config.ownerIgn}> can toggle AI mode!`);
                return;
            }
            this.isAiChatActive = false;
            this.broadcastState();
            this.bot.chat(`[AI] Groq AI Chat Companion disabled.`);
            return;
        }
        // 7. AI CHAT QUESTIONS (!chat <message>, with !ask and !ai kept as aliases)
        if (lower === '!chat' || lower === '!ask') {
            this.lastInGameCommandTime = now;
            this.bot.chat(`Usage: !chat <your message or question>`);
            return;
        }
        if (lower.startsWith('!chat ') || lower.startsWith('!ask ') || lower.startsWith('!ai ')) {
            this.lastInGameCommandTime = now;
            if (!this.isAiChatActive) {
                this.bot.chat(`[AI] AI companion is currently disabled. Ask owner to enable with "!ai on".`);
                return;
            }
            const question = trimmed.replace(/^!(chat|ask|ai)\s+/i, '');
            this.replyWithAi(sender, question);
            return;
        }
        // 8. GREETINGS & MENTIONS (Triggers AI companion if enabled)
        if (lower === '!hi' || lower === '!hello' || (isMention && !trimmed.startsWith('!'))) {
            this.lastInGameCommandTime = now;
            if (this.isAiChatActive) {
                const cleaned = trimmed.replace(new RegExp(`@?${this.config.username}`, 'gi'), '').trim();
                this.replyWithAi(sender, cleaned || 'hello');
                return;
            }
            else {
                this.bot.chat(`Hello ${sender}! I am CraftBot. Use "!help" to see available commands.`);
                return;
            }
        }
        // 9. FOLLOW / COME (Available for everyone)
        if (lower.startsWith('!follow') || lower.startsWith('!come')) {
            this.lastInGameCommandTime = now;
            const parts = trimmed.split(/\s+/);
            const targetName = (isOwner && parts[1]) ? parts[1] : sender;
            this.followPlayer(targetName);
            return;
        }
        // 10. STOP / HALT (Available for everyone)
        if (lower.startsWith('!stop') || lower.startsWith('!halt')) {
            this.lastInGameCommandTime = now;
            this.stopFollow();
            this.bot.chat(`Stopped following.`);
            return;
        }
        // 11. STATUS / INFO (Available for everyone)
        if (lower.startsWith('!status') || lower.startsWith('!info')) {
            this.lastInGameCommandTime = now;
            const pos = this.bot.entity?.position;
            const x = pos ? Math.round(pos.x) : 0;
            const y = pos ? Math.round(pos.y) : 0;
            const z = pos ? Math.round(pos.z) : 0;
            const sleepingStr = this.bot.isSleeping ? ' | Sleeping in bed 🛏️' : '';
            this.bot.chat(`HP: ${Math.round(this.bot.health || 20)}/20 | Food: ${Math.round(this.bot.food || 20)}/20 | Pos: ${x}, ${y}, ${z} (${this.bot.game.dimension})${sleepingStr}`);
            return;
        }
        // 12. OWNER-ONLY COMMANDS:
        // Transfer Ownership: !transfer <NewOwner> or !setowner <NewOwner>
        if (lower.startsWith('!transfer') || lower.startsWith('!setowner')) {
            this.lastInGameCommandTime = now;
            if (!isOwner) {
                this.bot.chat(`Sorry ${sender}, only current owner <${this.config.ownerIgn}> can transfer ownership!`);
                return;
            }
            const parts = trimmed.split(/\s+/);
            const targetOwner = parts[1]?.trim();
            if (!targetOwner) {
                this.bot.chat(`Usage: !transfer <PlayerIGN>`);
                return;
            }
            const validation = validator_1.SecurityValidator.validateUsername(targetOwner);
            if (!validation.valid || !validation.sanitized) {
                this.bot.chat(`Invalid player IGN "${targetOwner}". Ownership transfer canceled.`);
                return;
            }
            const oldOwner = this.config.ownerIgn;
            this.config.ownerIgn = validation.sanitized;
            this.onOwnerChanged?.(validation.sanitized);
            this.broadcastState();
            this.io.to(this.userId).emit('owner-updated', { slotId: this.userId, newOwner: validation.sanitized });
            this.bot.chat(`👑 [Ownership Transferred] ${oldOwner} transferred bot ownership to <${validation.sanitized}>!`);
            return;
        }
        // Change Bot Username & Rejoin in 10s: !name <NewUsername> or !rename <NewUsername>
        if (lower.startsWith('!name ') || lower.startsWith('!rename ')) {
            this.lastInGameCommandTime = now;
            if (!isOwner) {
                this.bot.chat(`Sorry ${sender}, only current owner <${this.config.ownerIgn}> can change bot username!`);
                return;
            }
            const parts = trimmed.split(/\s+/);
            const targetName = parts[1]?.trim();
            if (!targetName) {
                this.bot.chat(`Usage: !rename <NewUsername>`);
                return;
            }
            const res = this.changeUsernameAndRejoin(targetName, 10);
            if (!res.success && res.error) {
                this.bot.chat(`Error: ${res.error}`);
            }
            return;
        }
        // Permanent Shutdown Command (Owner only): !shutdown bot, !poweroff bot, !terminate bot
        if (lower === '!shutdown bot' || lower === '!poweroff bot' || lower === '!terminate bot') {
            this.lastInGameCommandTime = now;
            if (!isOwner) {
                this.bot.chat(`Sorry ${sender}, only owner <${this.config.ownerIgn}> can shut down this bot!`);
                return;
            }
            this.bot.chat(`🛑 [Shutdown] Permanent shutdown initiated by owner <${this.config.ownerIgn}>. Disconnecting...`);
            setTimeout(() => this.stop(), 500);
            return;
        }
        if (lower.startsWith('!drop') || lower.startsWith('!dropall') || lower.startsWith('!toss') ||
            lower.startsWith('!eat') || lower.startsWith('!feed') ||
            lower.startsWith('!attack') || lower.startsWith('!grind') ||
            lower.startsWith('!antiafk') || lower.startsWith('!say')) {
            this.lastInGameCommandTime = now;
            if (!isOwner) {
                this.bot.chat(`Sorry ${sender}, only owner <${this.config.ownerIgn}> can use that command!`);
                return;
            }
            if (lower.startsWith('!drop') || lower.startsWith('!dropall') || lower.startsWith('!toss')) {
                this.tossAll();
                this.bot.chat(`Dropped all inventory items.`);
                return;
            }
            if (lower.startsWith('!eat') || lower.startsWith('!feed')) {
                this.triggerEatFood();
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
     * Tells a witty Minecraft joke in in-game chat and broadcasts it to the dashboard
     */
    async tellJoke() {
        const fallbackJokes = [
            "Why can't the Ender Dragon read a book? Because she always starts at the End!",
            "Why did the creeper cross the road? To get to the other ssssside!",
            "Why are skeletons so calm? Because nothing gets under their skin!",
            "How does Steve get his exercise? Running around the block!",
            "What is a Ghast's favorite country? The Nether-lands!",
            "Why did the zombie go to school? To improve his dead-ucation!",
            "Why don't blazes ever win at poker? They always burn through their deck!",
            "What did Steve say to the iron golem? Thanks a ton!",
            "Why was the pickaxe late for work? It had too many breaks!",
            "How do Minecraft players party? They build the roof and raise it!",
            "Why are piglins bad at sports? They always hog the ball!",
            "What do you call a witch in the sand? A sandwich!",
        ];
        let joke = null;
        if (this.groqService.hasApiKey(this.config.groqApiKey)) {
            try {
                joke = await this.groqService.generateReply({
                    sender: this.config.ownerIgn,
                    message: "Tell a short, funny 1-line Minecraft joke or pun under 100 characters.",
                    botUsername: this.config.username,
                    ownerIgn: this.config.ownerIgn,
                    customApiKey: this.config.groqApiKey,
                });
            }
            catch (e) { }
        }
        if (!joke || joke.startsWith('[AI') || joke.toLowerCase().includes('error') || joke.toLowerCase().includes('unavailable')) {
            joke = fallbackJokes[Math.floor(Math.random() * fallbackJokes.length)];
        }
        // Clean up formatting
        joke = joke.replace(/[\r\n\t]/g, ' ').trim();
        // 1. Send in Minecraft server chat if bot is online
        if (this.bot && this.status === 'online') {
            try {
                this.bot.chat(joke);
            }
            catch (err) {
                console.error(`[Bot ${this.config.username}] Failed to chat joke:`, err);
            }
        }
        // 2. Broadcast to dashboard live chat feed
        this.emitChatMessage(joke, this.config.username);
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
     * Find nearest bed within 24 blocks, walk to it, and sleep
     */
    async goToSleep() {
        if (!this.bot || this.status !== 'online')
            return;
        if (this.bot.isSleeping) {
            this.bot.chat('I am already sleeping in bed! zzz...');
            return;
        }
        // Search for bed blocks (e.g. red_bed, white_bed, etc.)
        const bedBlock = this.bot.findBlock({
            matching: (block) => {
                return Boolean(block && block.name && block.name.endsWith('_bed'));
            },
            maxDistance: 24,
        });
        if (!bedBlock) {
            this.bot.chat('🛏️ No bed found within 24 blocks! If you need to sleep to pass the night, type "!nightskip" and I will leave for 1 minute and auto-rejoin!');
            return;
        }
        this.bot.chat(`Found a bed at (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z}). Walking to bed...`);
        try {
            this.stopFollow();
            const goal = new mineflayer_pathfinder_1.goals.GoalNear(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z, 2);
            await this.bot.pathfinder.goto(goal);
            // Settle position
            await new Promise((r) => setTimeout(r, 250));
            await this.bot.sleep(bedBlock);
            this.bot.chat('🛏️ In bed! Goodnight everyone.');
            this.broadcastState();
        }
        catch (err) {
            const msg = (err?.message || '').toLowerCase();
            if (msg.includes('day') || msg.includes('not at night')) {
                this.bot.chat('Can only sleep at night or during thunderstorms!');
            }
            else if (msg.includes('monster')) {
                this.bot.chat('Cannot sleep now, there are monsters nearby!');
            }
            else if (msg.includes('occupied')) {
                this.bot.chat('That bed is already occupied by someone else!');
            }
            else if (msg.includes('too far')) {
                this.bot.chat('Bed is too far away to reach.');
            }
            else {
                this.bot.chat(`Could not sleep (${msg || 'error'}). Type "!nightskip" to make me leave for 1 min.`);
            }
        }
    }
    /**
     * Wake up from bed
     */
    async wakeUp() {
        if (!this.bot || this.status !== 'online')
            return;
        if (!this.bot.isSleeping) {
            this.bot.chat('I am not currently sleeping in a bed.');
            return;
        }
        try {
            await this.bot.wake();
            this.bot.chat('Woke up from bed.');
            this.broadcastState();
        }
        catch (err) {
            this.bot.chat(`Could not wake up: ${err?.message || 'error'}`);
        }
    }
    /**
     * Temporary Sleep Leave: Disconnect for 60 seconds so players can pass the night, then auto-rejoin
     */
    temporarySleepLeave(durationSeconds = 60) {
        if (this.tempLeaveTimer) {
            clearTimeout(this.tempLeaveTimer);
            this.tempLeaveTimer = null;
        }
        if (this.bot && this.status === 'online') {
            try {
                this.bot.chat(`🌙 Leaving for ${durationSeconds} seconds so players can sleep and pass the night! Rejoining automatically in 1 minute...`);
            }
            catch (e) { }
        }
        const delayMs = durationSeconds * 1000;
        this.nextRetryAt = Date.now() + delayMs;
        this.status = 'connecting';
        this.uptimeStart = 0;
        this.errorMessage = `Night Skip: Disconnected for ${durationSeconds}s so players can sleep. Rejoining in ${durationSeconds}s...`;
        this.emitChatMessage(`🌙 Night Skip activated! Leaving for ${durationSeconds}s so players can sleep. Auto-rejoining in 1 minute...`, undefined, true);
        this.tempLeaveTimer = setTimeout(() => {
            this.tempLeaveTimer = null;
            this.nextRetryAt = 0;
            if (this.isExplicitlyStopped)
                return;
            console.log(`[Bot ${this.config.username}] ${durationSeconds}s night-skip completed. Rejoining Minecraft server...`);
            this.emitChatMessage(`🌅 Night skip completed! Rejoining server now...`, undefined, true);
            this.retryNow();
        }, delayMs);
        setTimeout(() => {
            this.destroyBot();
            this.cleanup();
            this.broadcastState();
        }, 400);
        this.broadcastState();
    }
    /**
     * Change Bot Username and Rejoin in X seconds (default 10s)
     */
    changeUsernameAndRejoin(newUsername, delaySeconds = 10) {
        const validation = validator_1.SecurityValidator.validateUsername(newUsername);
        if (!validation.valid || !validation.sanitized) {
            const err = validation.error || 'Invalid Minecraft username. Must be 3-16 characters (letters, numbers, underscores).';
            this.io.to(this.userId).emit('bot-error', { slotId: this.userId, error: err });
            return { success: false, error: err };
        }
        const sanitizedName = validation.sanitized;
        if (sanitizedName.toLowerCase() === this.config.username.toLowerCase()) {
            const err = 'Bot is already using that username.';
            this.io.to(this.userId).emit('bot-error', { slotId: this.userId, error: err });
            return { success: false, error: err };
        }
        const oldName = this.config.username;
        this.config.username = sanitizedName;
        this.onUsernameChanged?.(sanitizedName);
        // Wipe Groq short-term conversation context for old username
        this.groqService.clearHistory(oldName);
        // Announce if bot is currently online in server
        if (this.bot && this.status === 'online') {
            try {
                this.bot.chat(`Changing username from ${oldName} to ${sanitizedName}. Rejoining in ${delaySeconds} seconds...`);
            }
            catch (e) { }
        }
        // Cancel existing retry timers
        this.cancelRetryTimer();
        if (this.tempLeaveTimer) {
            clearTimeout(this.tempLeaveTimer);
            this.tempLeaveTimer = null;
        }
        const delayMs = delaySeconds * 1000;
        this.nextRetryAt = Date.now() + delayMs;
        this.status = 'connecting';
        this.errorMessage = `Changing username to ${sanitizedName}. Rejoining in ${delaySeconds}s...`;
        this.isExplicitlyStopped = false;
        this.retryCount = 0;
        // Gracefully disconnect current Mineflayer bot
        if (this.bot) {
            try {
                this.bot.removeAllListeners();
                if (this.bot._client) {
                    this.bot._client.removeAllListeners();
                }
                this.bot.quit();
                this.bot = null;
            }
            catch (e) { }
        }
        this.cleanup();
        this.broadcastState();
        this.emitChatMessage(`Changing username to ${sanitizedName}. Rejoining in ${delaySeconds} seconds...`, undefined, true);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            if (this.isExplicitlyStopped)
                return;
            console.log(`[Bot] Rejoining server as "${sanitizedName}" after ${delaySeconds}s name change...`);
            this.start();
        }, delayMs);
        return { success: true };
    }
    /**
     * Anti-AFK Routine
     * Performs realistic, diverse micro-actions to bypass Spigot/Paper/Essentials AFK detection:
     * - Natural looking rotations with force=true
     * - Micro-jumps (resets Spigot player-idle-timeout reliably)
     * - Arm swings & sneaking toggles
     * - Micro-nudges forward & back (resets block-change AFK detectors without falling or drifting)
     */
    startAntiAfk() {
        if (this.antiAfkInterval)
            clearInterval(this.antiAfkInterval);
        if (!this.isAntiAfkActive)
            return;
        this.antiAfkInterval = setInterval(() => {
            if (!this.bot || this.status !== 'online' || this.isFollowing || this.bot.isSleeping)
                return;
            try {
                // 1. Natural Looking Rotation (with force=true to ensure look packet is sent)
                const currentYaw = this.bot.entity?.yaw ?? 0;
                const currentPitch = this.bot.entity?.pitch ?? 0;
                const targetYaw = currentYaw + (Math.random() * 0.8 - 0.4);
                const targetPitch = Math.max(-0.7, Math.min(0.7, currentPitch + (Math.random() * 0.4 - 0.2)));
                this.bot.look(targetYaw, targetPitch, true);
                // 2. Select diverse, realistic physical actions
                const rand = Math.random();
                if (rand < 0.35) {
                    // Action A: Micro-jump when grounded (instantly resets Spigot/Paper idle timer)
                    if (this.bot.entity?.onGround) {
                        this.bot.setControlState('jump', true);
                        setTimeout(() => {
                            if (this.bot)
                                this.bot.setControlState('jump', false);
                        }, 250);
                    }
                }
                else if (rand < 0.65) {
                    // Action B: Arm swing + Sneak toggle
                    this.bot.swingArm('right');
                    this.bot.setControlState('sneak', true);
                    setTimeout(() => {
                        if (this.bot)
                            this.bot.setControlState('sneak', false);
                    }, 600);
                }
                else if (rand < 0.85) {
                    // Action C: Micro-nudge (step forward 120ms then step back 120ms to stay on exact spot)
                    if (this.bot.entity?.onGround) {
                        this.bot.setControlState('forward', true);
                        setTimeout(() => {
                            if (this.bot) {
                                this.bot.setControlState('forward', false);
                                this.bot.setControlState('back', true);
                                setTimeout(() => {
                                    if (this.bot)
                                        this.bot.setControlState('back', false);
                                }, 120);
                            }
                        }, 120);
                    }
                }
                else {
                    // Action D: Arm swing + Sneak combo
                    this.bot.swingArm('right');
                    this.bot.setControlState('sneak', true);
                    setTimeout(() => {
                        if (this.bot) {
                            this.bot.swingArm('right');
                            this.bot.setControlState('sneak', false);
                        }
                    }, 700);
                }
            }
            catch (e) { }
        }, 9000);
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
     * Scans inventory and offhand for any edible food item
     */
    findFoodInInventory() {
        if (!this.bot)
            return null;
        const banned = new Set([
            'pufferfish', 'spider_eye', 'poisonous_potato', 'rotten_flesh',
            'chorus_fruit', 'suspicious_stew'
        ]);
        const foodsRegistry = this.bot.registry?.foodsByName;
        const items = this.bot.inventory?.items() || [];
        const offhand = this.bot.inventory?.slots?.[45];
        if (offhand && !items.includes(offhand)) {
            items.push(offhand);
        }
        const commonFoods = new Set([
            'cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken',
            'cooked_salmon', 'cooked_cod', 'steak', 'porkchop', 'mutton', 'beef',
            'chicken', 'salmon', 'cod', 'bread', 'golden_carrot', 'golden_apple',
            'apple', 'baked_potato', 'carrot', 'melon_slice', 'sweet_berries',
            'glow_berries', 'cookie', 'pumpkin_pie', 'honey_bottle', 'mushroom_stew',
            'rabbit_stew', 'beetroot_soup', 'cooked_rabbit', 'rabbit'
        ]);
        for (const item of items) {
            if (item && item.name && !banned.has(item.name)) {
                if ((foodsRegistry && foodsRegistry[item.name]) || commonFoods.has(item.name)) {
                    return item;
                }
            }
        }
        return null;
    }
    /**
     * Autonomous Auto-Eat Watchdog
     * Checks food levels every 4 seconds. If food drops to 16 or lower (or health < 20),
     * autonomously finds food in inventory and eats.
     */
    startAutoEatWatcher() {
        if (this.autoEatWatcherInterval)
            clearInterval(this.autoEatWatcherInterval);
        if (!this.isAutoEatActive)
            return;
        this.autoEatWatcherInterval = setInterval(() => {
            if (!this.bot || this.status !== 'online' || !this.isAutoEatActive || this.isEatingFallback)
                return;
            const needsFood = this.bot.food <= 16 || (this.bot.health < 20 && this.bot.food < 20);
            if (!needsFood)
                return;
            const autoEat = this.bot.autoEat;
            if (autoEat?.isEating)
                return;
            const foodItem = this.findFoodInInventory();
            if (!foodItem)
                return;
            if (autoEat && typeof autoEat.eat === 'function') {
                autoEat.eat().catch(() => {
                    this.manualEatFood();
                });
            }
            else {
                this.manualEatFood();
            }
        }, 4000);
    }
    /**
     * Direct Eating Fallback (used if mineflayer-auto-eat plugin encounters inventory desync)
     */
    async manualEatFood() {
        if (!this.bot || this.status !== 'online' || this.isEatingFallback)
            return false;
        const food = this.findFoodInInventory();
        if (!food)
            return false;
        this.isEatingFallback = true;
        try {
            console.log(`[Bot ${this.config.username}] Auto-eating ${food.name} (Food: ${this.bot.food}/20)...`);
            this.emitChatMessage(`🍖 Auto-eating ${food.name} (Food: ${this.bot.food}/20)...`, undefined, true);
            const prevItem = this.bot.heldItem;
            await this.bot.equip(food, 'hand');
            this.bot.activateItem();
            // Minecraft eating takes 32 ticks (1.6s)
            await new Promise((resolve) => setTimeout(resolve, 1650));
            this.bot.deactivateItem();
            if (prevItem && prevItem.name !== food.name) {
                try {
                    await this.bot.equip(prevItem, 'hand');
                }
                catch (e) { }
            }
            console.log(`[Bot ${this.config.username}] Finished eating ${food.name}. Food: ${this.bot.food}/20.`);
            this.emitChatMessage(`✅ Finished eating ${food.name}. Hunger: ${this.bot.food}/20`, undefined, true);
            this.broadcastState();
            return true;
        }
        catch (err) {
            console.warn(`[Bot ${this.config.username}] Eat error:`, err?.message);
            return false;
        }
        finally {
            this.isEatingFallback = false;
        }
    }
    /**
     * Trigger eating via in-game command or dashboard
     */
    async triggerEatFood() {
        if (!this.bot || this.status !== 'online')
            return;
        const food = this.findFoodInInventory();
        if (!food) {
            this.bot.chat('No edible food found in my inventory!');
            this.emitChatMessage('⚠️ No edible food found in inventory.', undefined, true);
            return;
        }
        if (this.bot.food >= 20) {
            this.bot.chat(`I am already completely full! (${this.bot.food}/20 food)`);
            return;
        }
        const autoEat = this.bot.autoEat;
        if (autoEat && typeof autoEat.eat === 'function') {
            autoEat.eat()
                .then(() => {
                this.bot?.chat(`Ate ${food.name} from inventory.`);
            })
                .catch(() => {
                this.manualEatFood().then((ok) => {
                    if (ok)
                        this.bot?.chat(`Ate ${food.name} from inventory.`);
                });
            });
        }
        else {
            this.manualEatFood().then((ok) => {
                if (ok)
                    this.bot?.chat(`Ate ${food.name} from inventory.`);
            });
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
            if (!this.bot || this.status !== 'online' || this.bot.isSleeping)
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
            if (enabled) {
                this.bot.autoEat.enable();
            }
            else {
                this.bot.autoEat.disable();
            }
        }
        if (enabled) {
            this.startAutoEatWatcher();
        }
        else if (this.autoEatWatcherInterval) {
            clearInterval(this.autoEatWatcherInterval);
            this.autoEatWatcherInterval = null;
        }
        console.log(`[Bot ${this.config.username}] Auto-Eat is now ${enabled ? 'ENABLED' : 'DISABLED'}`);
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
            this.io.to(this.userId).emit('timer-update', { slotId: this.userId, remainingSeconds: null });
            return;
        }
        const remainingSeconds = Math.max(0, Math.round((this.disconnectTimerEnd - Date.now()) / 1000));
        this.io.to(this.userId).emit('timer-update', { slotId: this.userId, remainingSeconds });
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
    /**
     * Eat food item from specified inventory slot
     */
    async eatItem(slot) {
        if (!this.bot || this.status !== 'online')
            return false;
        const validSlot = validator_1.SecurityValidator.validateInventorySlot(slot);
        if (!validSlot.valid)
            return false;
        const item = this.bot.inventory?.slots?.[validSlot.sanitized];
        if (!item)
            return false;
        try {
            await this.bot.equip(item, 'hand');
            await this.bot.consume();
            this.broadcastState();
            this.broadcastInventory();
            return true;
        }
        catch (err) {
            console.warn(`[Bot ${this.config.username}] Eat error:`, err?.message);
            return false;
        }
    }
    /**
     * Use / Activate item from specified slot (e.g. potion, pearl, bucket)
     */
    async useItem(slot) {
        if (!this.bot || this.status !== 'online')
            return false;
        const validSlot = validator_1.SecurityValidator.validateInventorySlot(slot);
        if (!validSlot.valid)
            return false;
        const item = this.bot.inventory?.slots?.[validSlot.sanitized];
        if (!item)
            return false;
        try {
            await this.bot.equip(item, 'hand');
            this.bot.activateItem();
            this.broadcastInventory();
            return true;
        }
        catch (err) {
            return false;
        }
    }
    /**
     * Move / Swap item between inventory slots (e.g. to hotbar)
     */
    async moveItem(sourceSlot, destSlot) {
        if (!this.bot || this.status !== 'online')
            return false;
        const validSrc = validator_1.SecurityValidator.validateInventorySlot(sourceSlot);
        const validDest = validator_1.SecurityValidator.validateInventorySlot(destSlot);
        if (!validSrc.valid || !validDest.valid)
            return false;
        try {
            await this.bot.moveSlotItem(validSrc.sanitized, validDest.sanitized);
            this.broadcastInventory();
            return true;
        }
        catch (err) {
            console.warn(`[Bot ${this.config.username}] Move item error:`, err?.message);
            return false;
        }
    }
    /**
     * Share item details in in-game Minecraft chat
     */
    shareItem(slot) {
        if (!this.bot || this.status !== 'online')
            return;
        const validSlot = validator_1.SecurityValidator.validateInventorySlot(slot);
        if (!validSlot.valid)
            return;
        const item = this.bot.inventory?.slots?.[validSlot.sanitized];
        if (!item)
            return;
        try {
            this.bot.chat(`[Inventory] Slot ${validSlot.sanitized}: ${item.count}x ${item.displayName || item.name}`);
        }
        catch (e) { }
    }
    getInventory() {
        if (!this.bot || !this.bot.inventory)
            return [];
        try {
            return this.bot.inventory.slots
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
        }
        catch (err) {
            return [];
        }
    }
    broadcastInventory() {
        const items = this.getInventory();
        this.io.to(this.userId).emit('inventory-update', { slotId: this.userId, items });
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
    /**
     * Query Groq AI for an in-game reply and send to Minecraft chat
     */
    async replyWithAi(sender, question) {
        if (!this.bot || this.status !== 'online')
            return;
        try {
            let reply = await this.groqService.generateReply({
                sender,
                message: question,
                botUsername: this.config.username,
                ownerIgn: this.config.ownerIgn,
                customApiKey: this.config.groqApiKey,
            });
            // If AI failed or returned error, gracefully fall back to friendly player dialogue instead of printing error codes
            if (!reply || reply.startsWith('[AI Error]') || reply.includes('unavailable')) {
                const fallbackGreetings = [
                    `Hey ${sender}! Ready when you are.`,
                    `Hello ${sender}! Type !help to see what I can do.`,
                    `What's up ${sender}! Let's go mining.`,
                    `Hey! Protecting the base 24/7.`,
                ];
                reply = fallbackGreetings[Math.floor(Math.random() * fallbackGreetings.length)];
            }
            if (reply && this.bot && this.status === 'online') {
                this.bot.chat(reply);
            }
        }
        catch (e) {
            console.error(`[Bot ${this.config.username}] Failed to reply with AI:`, e);
        }
    }
    getState() {
        const isOnline = this.status === 'online';
        const uptimeSeconds = (isOnline && this.uptimeStart > 0)
            ? Math.floor((Date.now() - this.uptimeStart) / 1000)
            : 0;
        return {
            slotId: this.userId,
            status: this.status,
            username: this.config.username,
            serverIp: this.config.serverIp,
            serverPort: this.config.serverPort,
            health: isOnline ? (this.bot?.health ?? 20) : 20,
            food: isOnline ? (this.bot?.food ?? 20) : 20,
            xpLevel: isOnline ? (this.bot?.experience?.level ?? 0) : 0,
            xpProgress: isOnline ? (this.bot?.experience?.progress ?? 0) : 0,
            dimension: isOnline ? (this.bot?.game?.dimension ?? 'minecraft:overworld') : 'minecraft:overworld',
            position: (isOnline && this.bot?.entity?.position)
                ? {
                    x: Math.round(this.bot.entity.position.x * 10) / 10,
                    y: Math.round(this.bot.entity.position.y * 10) / 10,
                    z: Math.round(this.bot.entity.position.z * 10) / 10,
                }
                : { x: 0, y: 64, z: 0 },
            ping: isOnline ? (this.bot?.player?.ping ?? 0) : 0,
            uptimeSeconds,
            error: this.errorMessage,
            ownerIgn: this.config.ownerIgn,
            isAiChatActive: this.isAiChatActive,
            isSleeping: isOnline ? Boolean(this.bot?.isSleeping) : false,
            retryInfo: (this.status === 'connecting' && (this.retryTimer || this.tempLeaveTimer) && this.nextRetryAt > 0) ? {
                attempt: this.tempLeaveTimer ? 1 : this.retryCount,
                maxAttempts: this.tempLeaveTimer ? 1 : this.maxRetries,
                nextRetryAt: this.nextRetryAt,
                isNightSkip: Boolean(this.tempLeaveTimer),
            } : null,
        };
    }
    broadcastState() {
        const payload = this.getState();
        this.io.to(this.userId).emit('bot-state', payload);
    }
    /**
     * Handle Disconnection & Offline Server Reconnection with Exponential Backoff
     */
    handleAutoReconnect(reason) {
        this.uptimeStart = 0;
        this.destroyBot();
        this.cleanup();
        if (this.isExplicitlyStopped) {
            this.status = 'offline';
            this.broadcastState();
            return;
        }
        // Avoid duplicate re-entry if a retry timer is already pending
        if (this.retryTimer) {
            this.status = 'connecting';
            this.broadcastState();
            return;
        }
        // Exponential Backoff Intervals: 5s, 15s, 30s, 60s, 120s
        const retryDelays = [5000, 15000, 30000, 60000, 120000];
        if (this.retryCount < this.maxRetries) {
            const delayMs = retryDelays[this.retryCount] || 120000;
            const seconds = Math.round(delayMs / 1000);
            this.retryCount++;
            this.nextRetryAt = Date.now() + delayMs;
            this.status = 'connecting';
            this.errorMessage = reason;
            console.log(`[Bot ${this.config.username}] ${reason}. Reconnecting in ${seconds}s (Attempt ${this.retryCount}/${this.maxRetries})...`);
            this.emitChatMessage(`⚠️ ${reason} - Reconnecting in ${seconds}s (Attempt ${this.retryCount}/${this.maxRetries})...`, undefined, true);
            this.broadcastState();
            this.retryTimer = setTimeout(() => {
                this.retryTimer = null;
                this.nextRetryAt = 0;
                if (this.isExplicitlyStopped)
                    return;
                console.log(`[Bot ${this.config.username}] Auto-reconnect attempt ${this.retryCount}/${this.maxRetries} to ${this.config.serverIp}:${this.config.serverPort}...`);
                this.emitChatMessage(`🔄 Attempting reconnect to ${this.config.serverIp}:${this.config.serverPort} (Attempt ${this.retryCount}/${this.maxRetries})...`, undefined, true);
                this.start();
            }, delayMs);
        }
        else {
            // Retries exhausted (server is definitely offline)
            this.status = 'offline';
            this.nextRetryAt = 0;
            this.errorMessage = `Minecraft server is offline (unreachable after ${this.maxRetries} attempts). Click "Retry Now" when server is back up.`;
            console.warn(`[Bot ${this.config.username}] Max retries reached. Server is offline.`);
            this.cancelRetryTimer();
            this.broadcastState();
            this.io.to(this.userId).emit('server-offline', {
                slotId: this.userId,
                serverIp: this.config.serverIp,
                serverPort: this.config.serverPort,
                attempts: this.maxRetries,
            });
        }
    }
    cancelRetryTimer() {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        if (this.tempLeaveTimer) {
            clearTimeout(this.tempLeaveTimer);
            this.tempLeaveTimer = null;
        }
        this.nextRetryAt = 0;
    }
    /**
     * User manually triggers immediate reconnection (e.g. from web UI "Retry Now" button)
     */
    retryNow() {
        this.isExplicitlyStopped = false;
        this.cancelRetryTimer();
        this.retryCount = 0;
        this.errorMessage = null;
        this.nextRetryAt = 0;
        this.cleanup();
        this.start();
    }
    /**
     * Clean up and stop bot with complete resource detachment
     */
    stop() {
        this.isExplicitlyStopped = true;
        this.cancelRetryTimer();
        this.retryCount = 0;
        this.nextRetryAt = 0;
        this.status = 'offline';
        this.uptimeStart = 0;
        this.destroyBot();
        this.cleanup();
        this.broadcastState();
        if (this.stateBroadcastInterval) {
            clearInterval(this.stateBroadcastInterval);
            this.stateBroadcastInterval = null;
        }
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
        if (this.autoEatWatcherInterval) {
            clearInterval(this.autoEatWatcherInterval);
            this.autoEatWatcherInterval = null;
        }
        this.isEatingFallback = false;
        this.cancelDisconnectTimer();
        this.trackedDoors.clear();
        this.doorCooldowns.clear();
        // Wipe short-term AI conversation context on disconnect
        this.groqService.clearHistory(this.config.username);
    }
}
exports.BotInstance = BotInstance;
