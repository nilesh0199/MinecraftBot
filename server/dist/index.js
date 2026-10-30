"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const net_1 = __importDefault(require("net"));
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
// 1. Disable identifying Express headers
app.disable('x-powered-by');
// 2. Comprehensive Security Headers Middleware
app.use((req, res, next) => {
    // Prevent MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Prevent UI Redressing / Clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // Modern standard: disable buggy legacy browser XSS filters
    res.setHeader('X-XSS-Protection', '0');
    // Send full referrer on same-origin, only origin on cross-origin HTTPS
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Restrict unused browser hardware APIs
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // Enable popup communication for Firebase Google OAuth without COOP restrictions
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    // HSTS in production (enforce HTTPS for 1 year)
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    // Content Security Policy (CSP) tailored for CraftBot, Google OAuth, and Firebase
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://apis.google.com https://*.firebaseio.com https://*.googleapis.com",
        "connect-src 'self' wss: https: http://localhost:* ws://localhost:*",
        "img-src 'self' data: https: blob:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
    ].join('; '));
    next();
});
// 3. Intelligent & Configurable CORS Policy
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim().toLowerCase())
    : [];
const isOriginAllowed = (origin) => {
    if (!origin)
        return true; // Allow non-browser agents (curl, server-to-server)
    const lower = origin.toLowerCase();
    if (allowedOrigins.length > 0 && allowedOrigins.includes(lower)) {
        return true;
    }
    // Allow localhost & 127.0.0.1 for development
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(lower)) {
        return true;
    }
    // Allow Render hosting domains (*.onrender.com)
    if (/^https:\/\/[a-z0-9\-]+\.onrender\.com$/.test(lower)) {
        return true;
    }
    return process.env.NODE_ENV !== 'production';
};
const corsOptions = {
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error(`CORS blocked: Origin ${origin} not permitted.`));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
};
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json({ limit: '100kb' })); // Mitigate payload flooding
// Helper to reliably extract client IP behind reverse proxies
const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
};
// 4. Global API Rate Limiter (Max 60 requests/min per IP)
app.use('/api', (req, res, next) => {
    const ip = getClientIp(req);
    if (!rateLimiter.isAllowed(`api_general:${ip}`, 60, 60000)) {
        return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    next();
});
// API: Session Token Generator for Authenticated Clients (Rate limited: Max 15 / min per IP)
app.post('/api/auth/token', (req, res) => {
    const ip = getClientIp(req);
    if (!rateLimiter.isAllowed(`api_auth:${ip}`, 15, 60000)) {
        return res.status(429).json({ error: 'Too many authentication attempts. Please wait a minute.' });
    }
    const { uid, ownerIgn } = req.body;
    const uidVal = validator_1.SecurityValidator.validateUid(uid);
    if (!uidVal.valid || !uidVal.sanitized) {
        return res.status(400).json({ error: uidVal.error || 'Valid UID is required.' });
    }
    let sanitizedOwner = '';
    if (ownerIgn && typeof ownerIgn === 'string') {
        const ownerVal = validator_1.SecurityValidator.validateUsername(ownerIgn);
        sanitizedOwner = ownerVal.valid && ownerVal.sanitized
            ? ownerVal.sanitized
            : ownerIgn.substring(0, 16).replace(/[^a-zA-Z0-9_]/g, '');
    }
    const token = auth_1.SessionAuth.createSessionToken(uidVal.sanitized, sanitizedOwner);
    res.json({ token, uid: uidVal.sanitized, ownerIgn: sanitizedOwner });
});
// API health endpoint (Lightweight, non-disclosing)
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        service: 'craftbot-daemon',
        uptime: Math.floor(process.uptime()),
        timestamp: Date.now(),
    });
});
// API: Provide Firebase client credentials dynamically to frontend from server environment variables
app.get('/api/firebase-config', (req, res) => {
    const ip = getClientIp(req);
    if (!rateLimiter.isAllowed(`api_cfg:${ip}`, 30, 60000)) {
        return res.status(429).json({ error: 'Rate limit exceeded.' });
    }
    res.json({
        apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || '',
    });
});
// Diagnostic endpoint to test direct TCP connectivity from cloud host
app.get('/api/test-connect', (req, res) => {
    const host = req.query.host || 'ChoduCID-7CAj.aternos.me';
    const port = parseInt(req.query.port || '16808', 10);
    const hostVal = validator_1.SecurityValidator.validateServerHost(host);
    if (!hostVal.valid || !hostVal.sanitized) {
        return res.status(400).json({ error: hostVal.error });
    }
    const portVal = validator_1.SecurityValidator.validatePort(port);
    if (!portVal.valid || !portVal.sanitized) {
        return res.status(400).json({ error: portVal.error });
    }
    const startTime = Date.now();
    let finished = false;
    const sock = net_1.default.connect(portVal.sanitized, hostVal.sanitized, () => {
        if (finished)
            return;
        finished = true;
        const elapsed = Date.now() - startTime;
        sock.destroy();
        return res.json({ success: true, host: hostVal.sanitized, port: portVal.sanitized, elapsedMs: elapsed });
    });
    sock.setTimeout(6000);
    sock.on('timeout', () => {
        if (finished)
            return;
        finished = true;
        sock.destroy();
        return res.json({ success: false, host: hostVal.sanitized, port: portVal.sanitized, error: 'TCP connection timed out after 6 seconds' });
    });
    sock.on('error', (err) => {
        if (finished)
            return;
        finished = true;
        return res.json({ success: false, host: hostVal.sanitized, port: portVal.sanitized, error: err.message, code: err.code });
    });
});
// 5. Serve static frontend with hidden files & dotfiles ignored
const clientDistPath = path_1.default.resolve(__dirname, '../../client/dist');
app.use(express_1.default.static(clientDistPath, {
    dotfiles: 'ignore',
    index: 'index.html',
}));
// 6. Setup Socket.io with Hardened CORS
const io = new socket_io_1.Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (isOriginAllowed(origin)) {
                callback(null, true);
            }
            else {
                callback(new Error(`CORS blocked: Origin ${origin} not permitted.`));
            }
        },
        methods: ['GET', 'POST'],
        credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 15000,
});
const botManager = new BotManager_1.BotManager(io);
// 7. Socket Authentication Middleware
io.use((socket, next) => {
    const token = (socket.handshake.auth?.token || socket.handshake.query?.token);
    const rawUid = socket.handshake.query?.uid;
    const rawOwnerIgn = socket.handshake.query?.ownerIgn;
    if (token) {
        const session = auth_1.SessionAuth.verifySessionToken(token);
        if (session) {
            socket.data.userId = session.uid;
            socket.data.ownerIgn = session.ownerIgn;
            return next();
        }
    }
    // Gracefully accept authenticated client with validated UID
    if (rawUid && typeof rawUid === 'string') {
        const uidVal = validator_1.SecurityValidator.validateUid(rawUid);
        if (uidVal.valid && uidVal.sanitized) {
            socket.data.userId = uidVal.sanitized;
            socket.data.ownerIgn = typeof rawOwnerIgn === 'string' ? rawOwnerIgn.substring(0, 32).replace(/[^a-zA-Z0-9_]/g, '') : '';
            return next();
        }
        return next(new Error('Invalid UID format.'));
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
                sender: 'System',
                message: 'Chat rate limit reached. Slow down!',
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
    // Event: Toggle Auto-Attack
    socket.on('toggle-auto-attack', (enabled) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.setAutoAttack(Boolean(enabled));
        }
    });
    // Event: Toggle AI Chat
    socket.on('toggle-ai-chat', (enabled) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.isAiChatActive = Boolean(enabled);
            bot.broadcastState();
        }
    });
    // Event: Bed Sleep Navigation
    socket.on('bot-sleep', () => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.goToSleep();
        }
    });
    // Event: Wake up from Bed
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
    // Event: Follow Player
    socket.on('follow-player', (targetPlayer) => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.followPlayer(targetPlayer);
        }
    });
    // Event: Stop Following
    socket.on('stop-follow', () => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.stopFollow();
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
        if (!result.success) {
            socket.emit('bot-error', result.error || 'Failed to rename bot.');
        }
    });
    // Event: Toss Item with Slot Boundary Check
    socket.on('toss-item', (data) => {
        const bot = botManager.getBot(userId);
        if (bot && typeof data?.slot === 'number') {
            const slotValidation = validator_1.SecurityValidator.validateInventorySlot(data.slot);
            if (slotValidation.valid && slotValidation.sanitized !== undefined) {
                bot.tossItem(slotValidation.sanitized, data.count);
            }
        }
    });
    // Event: Equip Item with Destination Validation
    socket.on('equip-item', (data) => {
        const bot = botManager.getBot(userId);
        if (bot && typeof data?.slot === 'number') {
            const slotValidation = validator_1.SecurityValidator.validateInventorySlot(data.slot);
            if (slotValidation.valid && slotValidation.sanitized !== undefined) {
                bot.equipItem(slotValidation.sanitized, data.destination);
            }
        }
    });
    // Event: Toss All
    socket.on('toss-all', () => {
        const bot = botManager.getBot(userId);
        if (bot) {
            bot.tossAll();
        }
    });
    // Event: Eat Item
    socket.on('eat-item', (slot) => {
        const bot = botManager.getBot(userId);
        if (bot && typeof slot === 'number') {
            const slotValidation = validator_1.SecurityValidator.validateInventorySlot(slot);
            if (slotValidation.valid && slotValidation.sanitized !== undefined) {
                bot.eatItem(slotValidation.sanitized);
            }
        }
    });
    // Event: Use Item
    socket.on('use-item', (slot) => {
        const bot = botManager.getBot(userId);
        if (bot && typeof slot === 'number') {
            const slotValidation = validator_1.SecurityValidator.validateInventorySlot(slot);
            if (slotValidation.valid && slotValidation.sanitized !== undefined) {
                bot.useItem(slotValidation.sanitized);
            }
        }
    });
    // Event: Move Item
    socket.on('move-item', (data) => {
        const bot = botManager.getBot(userId);
        if (bot && typeof data?.sourceSlot === 'number' && typeof data?.destSlot === 'number') {
            const srcValidation = validator_1.SecurityValidator.validateInventorySlot(data.sourceSlot);
            const dstValidation = validator_1.SecurityValidator.validateInventorySlot(data.destSlot);
            if (srcValidation.valid && dstValidation.valid && srcValidation.sanitized !== undefined && dstValidation.sanitized !== undefined) {
                bot.moveItem(srcValidation.sanitized, dstValidation.sanitized);
            }
        }
    });
    // Event: Share Item
    socket.on('share-item', (slot) => {
        const bot = botManager.getBot(userId);
        if (bot && typeof slot === 'number') {
            const slotValidation = validator_1.SecurityValidator.validateInventorySlot(slot);
            if (slotValidation.valid && slotValidation.sanitized !== undefined) {
                bot.shareItem(slotValidation.sanitized);
            }
        }
    });
    // Event: Set Auto-Disconnect Timer
    socket.on('set-timer', (minutes) => {
        const bot = botManager.getBot(userId);
        if (!bot)
            return;
        const timerValidation = validator_1.SecurityValidator.validateTimerMinutes(minutes);
        if (timerValidation.valid && timerValidation.sanitized !== undefined) {
            bot.setDisconnectTimer(timerValidation.sanitized);
        }
        else {
            socket.emit('bot-error', timerValidation.error || 'Invalid timer duration.');
        }
    });
    // Event: Cancel Auto-Disconnect Timer
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
// Centralized Express Error Handler (Hides debug traces and internals)
app.use((err, req, res, next) => {
    console.error('[CraftBot Express Error]:', err?.message || err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    res.status(status).json({
        error: status === 500 ? 'Internal Server Error' : (err?.message || 'Request processing failed.'),
    });
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
    console.log(` Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`===============================================`);
});
