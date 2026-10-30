"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const BotManager_1 = require("./bot/BotManager");
const auth_1 = require("./security/auth");
const validator_1 = require("./security/validator");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (process.platform === 'win32' ? 3001 : 80);
const rateLimiter = new validator_1.RateLimiter();
app.use((0, cors_1.default)({ origin: '*' }));
app.use(express_1.default.json());
// Enable popup communication for Firebase Google OAuth without COOP restriction
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
});
// API: Session Token Generator for Authenticated Clients
app.post('/api/auth/token', (req, res) => {
    const { uid, ownerIgn } = req.body;
    if (!uid || typeof uid !== 'string') {
        return res.status(400).json({ error: 'Valid UID is required.' });
    }
    const token = auth_1.SessionAuth.createSessionToken(uid, ownerIgn || '');
    res.json({ token, uid, ownerIgn });
});
// API health endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        service: 'craftbot-daemon',
        uptime: process.uptime(),
        timestamp: Date.now(),
    });
});
// API: Provide Firebase configuration dynamically to frontend from server environment variables
app.get('/api/firebase-config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || '',
    });
});
// Serve static frontend in production
const clientDistPath = path_1.default.resolve(__dirname, '../../client/dist');
app.use(express_1.default.static(clientDistPath));
// Setup Socket.io
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
    pingTimeout: 30000,
    pingInterval: 15000,
});
const botManager = new BotManager_1.BotManager(io);
// Socket Authentication Middleware
io.use((socket, next) => {
    const token = (socket.handshake.auth?.token || socket.handshake.query?.token);
    const rawUid = socket.handshake.query?.uid;
    const rawOwnerIgn = socket.handshake.query?.ownerIgn;
    if (token) {
        const session = auth_1.SessionAuth.verifySessionToken(token);
        if (!session) {
            return next(new Error('Invalid or expired authentication token.'));
        }
        socket.data.userId = session.uid;
        socket.data.ownerIgn = session.ownerIgn;
        return next();
    }
    // Fallback for local development if token is not provided
    if (rawUid && typeof rawUid === 'string') {
        socket.data.userId = rawUid.substring(0, 64);
        socket.data.ownerIgn = typeof rawOwnerIgn === 'string' ? rawOwnerIgn.substring(0, 32) : '';
        return next();
    }
    return next(new Error('Authentication credentials required.'));
});
io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const ownerIgn = socket.data.ownerIgn;
    // Join private room isolated to this user
    socket.join(userId);
    console.log(`[Socket] Authenticated connection: User ${userId} (Owner IGN: ${ownerIgn || 'N/A'})`);
    // If user already has a bot running in background, sync state immediately
    const existingBot = botManager.getBot(userId) || (ownerIgn ? botManager.findBotByOwner(ownerIgn) : undefined);
    if (existingBot) {
        if (existingBot.userId !== userId) {
            botManager.reassignBotUser(existingBot, userId);
        }
        existingBot.broadcastState();
        existingBot.broadcastInventory();
    }
    // Event: Spawn / Start Bot with validation
    socket.on('start-bot', (config) => {
        const result = botManager.startBot(userId, {
            ...config,
            ownerIgn: ownerIgn || config.ownerIgn,
        });
        if (!result.success) {
            socket.emit('bot-error', result.error);
        }
    });
    // Event: Stop Bot
    socket.on('stop-bot', () => {
        botManager.stopBot(userId);
    });
    // Event: Retry connection manually
    socket.on('retry-connect', () => {
        const existing = botManager.getBot(userId);
        if (existing) {
            existing.retryNow();
        }
    });
    // Event: Send In-Game Chat / Command with Rate Limiting (max 3 per sec)
    socket.on('send-chat', (text) => {
        const chatRateKey = `chat:${userId}`;
        if (!rateLimiter.isAllowed(chatRateKey, 3, 1000)) {
            socket.emit('chat-message', {
                id: Math.random().toString(36).substring(2, 9),
                text: '⚠️ Slow down! You are sending chat messages too quickly.',
                timestamp: Date.now(),
                isSystem: true,
            });
            return;
        }
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.sendChat(text);
        }
    });
    // Event: Toss Item
    socket.on('toss-item', ({ slot, count }) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.tossItem(slot, count);
        }
    });
    // Event: Toss All
    socket.on('toss-all', () => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.tossAll();
        }
    });
    // Event: Equip Item
    socket.on('equip-item', ({ slot, destination }) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.equipItem(slot, destination);
        }
    });
    // Event: Eat Item
    socket.on('eat-item', (slot) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.eatItem(slot);
        }
    });
    // Event: Use / Activate Item
    socket.on('use-item', (slot) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.useItem(slot);
        }
    });
    // Event: Move / Swap Slot Item
    socket.on('move-item', ({ sourceSlot, destSlot }) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.moveItem(sourceSlot, destSlot);
        }
    });
    // Event: Share Item in Chat
    socket.on('share-item', (slot) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.shareItem(slot);
        }
    });
    // Event: Follow Player
    socket.on('follow-player', (targetPlayer) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.followPlayer(targetPlayer);
        }
    });
    // Event: Stop Follow
    socket.on('stop-follow', () => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.stopFollow();
        }
    });
    // Event: Toggle Anti-AFK
    socket.on('toggle-anti-afk', (enabled) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.setAntiAfk(Boolean(enabled));
        }
    });
    // Event: Toggle Auto-Eat
    socket.on('toggle-auto-eat', (enabled) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.setAutoEat(Boolean(enabled));
        }
    });
    // Event: Toggle Auto-Attack (Mob Farm)
    socket.on('toggle-auto-attack', (enabled) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.setAutoAttack(Boolean(enabled));
        }
    });
    // Event: Toggle Groq AI Chat Companion
    socket.on('toggle-ai-chat', (enabled) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.isAiChatActive = Boolean(enabled);
            bot.broadcastState();
        }
    });
    // Event: Find Nearest Bed & Sleep
    socket.on('bot-sleep', () => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.goToSleep();
        }
    });
    // Event: Wake Up From Bed
    socket.on('bot-wake', () => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.wakeUp();
        }
    });
    // Event: Night Skip (Disconnect for 60s to let players pass the night, then auto-rejoin)
    socket.on('bot-night-skip', () => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.temporarySleepLeave(60);
        }
    });
    // Event: Transfer Ownership from Web UI
    socket.on('transfer-ownership', (newOwner) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            const validation = validator_1.SecurityValidator.validateUsername(newOwner);
            if (validation.valid && validation.sanitized) {
                bot.config.ownerIgn = validation.sanitized;
                bot.onOwnerChanged?.(validation.sanitized);
                bot.broadcastState();
                socket.emit('owner-updated', { newOwner: validation.sanitized });
            }
        }
    });
    // Event: Change Bot Username & Rejoin in 10s from Web UI
    socket.on('change-bot-username', (newUsername) => {
        const bot = botManager.getBot(userId);
        if (!bot) {
            socket.emit('bot-error', 'No active bot found to rename.');
            return;
        }
        const result = bot.changeUsernameAndRejoin(newUsername, 10);
        if (!result.success && result.error) {
            socket.emit('bot-error', result.error);
        }
    });
    // Event: Set Disconnect Timer
    socket.on('set-timer', (minutes) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.setDisconnectTimer(minutes);
        }
    });
    // Event: Cancel Disconnect Timer
    socket.on('cancel-timer', () => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.cancelDisconnectTimer();
        }
    });
    socket.on('disconnect', () => {
        console.log(`[Socket] User ${userId} disconnected. Bot remains active in background.`);
    });
});
// Fallback to client index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path_1.default.join(clientDistPath, 'index.html'));
});
server.on('error', (err) => {
    if (err.code === 'EACCES' && PORT === 80) {
        console.warn(`[CraftBot] Port 80 permission denied, falling back to 3001...`);
        server.listen(3001);
    }
    else {
        console.error(`[CraftBot] Server error:`, err);
    }
});
server.listen(PORT, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(` CraftBot 24/7 Cloud Manager Running!`);
    console.log(` Server & WebSocket Gateway: http://0.0.0.0:${PORT}`);
    console.log(`===============================================`);
});
