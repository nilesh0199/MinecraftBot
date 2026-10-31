import express from 'express';
import http from 'http';
import net from 'net';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { BotManager } from './bot/BotManager';
import { RateLimiter, SecurityValidator } from './security/validator';
import { SlotId } from './storage/slotStorage';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (process.platform === 'win32' ? 3001 : 80);
const rateLimiter = new RateLimiter();

// 1. Disable identifying Express headers
app.disable('x-powered-by');

// 2. Comprehensive Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' wss: https: http://localhost:* ws://localhost:*",
      "img-src 'self' data: https: blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "frame-src 'self'",
    ].join('; ')
  );

  next();
});

// 3. Intelligent CORS Policy
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim().toLowerCase())
  : [];

const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true;
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

  return true; // Zero-auth public access enabled
};

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: Origin ${origin} not permitted.`));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));

// Helper to extract client IP
const getClientIp = (req: express.Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
};

// Global API Rate Limiter
app.use('/api', (req, res, next) => {
  const ip = getClientIp(req);
  if (!rateLimiter.isAllowed(`api_general:${ip}`, 120, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  next();
});

// Setup Socket.io
const io = new SocketServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: Origin ${origin} not permitted.`));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 15000,
});

const botManager = new BotManager(io);

// Keep-Alive Health Endpoint for UptimeRobot (also revives any active bots if offline!)
app.get('/health', (req, res) => {
  const check = botManager.checkAndReviveSlots();
  res.json({
    status: 'online',
    service: 'craftbot-daemon',
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now(),
    slots: check.slots,
  });
});

// Diagnostic endpoint to test direct TCP connectivity from cloud host
app.get('/api/test-connect', (req, res) => {
  const host = (req.query.host as string) || 'ChoduCID-7CAj.aternos.me';
  const port = parseInt((req.query.port as string) || '16808', 10);

  const hostVal = SecurityValidator.validateServerHost(host);
  if (!hostVal.valid || !hostVal.sanitized) {
    return res.status(400).json({ error: hostVal.error });
  }
  const portVal = SecurityValidator.validatePort(port);
  if (!portVal.valid || !portVal.sanitized) {
    return res.status(400).json({ error: portVal.error });
  }

  const startTime = Date.now();
  let finished = false;
  const sock = net.connect(portVal.sanitized, hostVal.sanitized, () => {
    if (finished) return;
    finished = true;
    const elapsed = Date.now() - startTime;
    sock.destroy();
    return res.json({ success: true, host: hostVal.sanitized, port: portVal.sanitized, elapsedMs: elapsed });
  });

  sock.setTimeout(6000);
  sock.on('timeout', () => {
    if (finished) return;
    finished = true;
    sock.destroy();
    return res.json({ success: false, host: hostVal.sanitized, port: portVal.sanitized, error: 'TCP connection timed out after 6 seconds' });
  });

  sock.on('error', (err) => {
    if (finished) return;
    finished = true;
    return res.json({ success: false, host: hostVal.sanitized, port: portVal.sanitized, error: err.message, code: (err as any).code });
  });
});

// Serve static frontend
const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDistPath, {
  dotfiles: 'ignore',
  index: 'index.html',
}));

// Zero-Auth Socket.io Handler
io.on('connection', (socket) => {
  // Join both bot rooms so the client receives live updates from both bots
  socket.join('bot_1');
  socket.join('bot_2');

  console.log(`[Socket] Client connected (${socket.id}). Joined bot_1 and bot_2 rooms.`);

  // Send initial slots state immediately
  socket.emit('init-slots', botManager.getAllSlotsState());

  // Also push active inventory if bot is already online
  const b1 = botManager.getBot('bot_1');
  if (b1) {
    socket.emit('bot-state', b1.getState());
    socket.emit('inventory-update', { slotId: 'bot_1', items: b1.getInventory() });
  }
  const b2 = botManager.getBot('bot_2');
  if (b2) {
    socket.emit('bot-state', b2.getState());
    socket.emit('inventory-update', { slotId: 'bot_2', items: b2.getInventory() });
  }

  // Helper to extract target slot
  const getSlot = (data: any): SlotId => {
    return (data && (data.slotId === 'bot_2' || data.slot === 'bot_2')) ? 'bot_2' : 'bot_1';
  };

  // Event: Spawn / Start Bot with validation
  socket.on('start-bot', (data) => {
    const slotId = getSlot(data);
    const config = {
      username: data.username,
      serverIp: data.serverIp,
      serverPort: data.serverPort,
      authPassword: data.authPassword,
      version: data.version,
      ownerIgn: data.ownerIgn || 'Player',
      autoEat: data.autoEat,
      antiAfk: data.antiAfk,
      autoAttack: data.autoAttack,
      isAiChatActive: data.isAiChatActive,
    };

    const result = botManager.startBot(slotId, config);
    if (!result.success) {
      socket.emit('bot-error', { slotId, error: result.error });
    }
  });

  // Event: Stop Bot
  socket.on('stop-bot', (data) => {
    const slotId = getSlot(data);
    botManager.stopBot(slotId);
  });

  // Event: Retry connection manually
  socket.on('retry-connect', (data) => {
    const slotId = getSlot(data);
    const existing = botManager.getBot(slotId);
    if (existing) {
      existing.retryNow();
    }
  });

  // Event: Send In-Game Chat / Command
  socket.on('send-chat', (data) => {
    const slotId = typeof data === 'object' ? getSlot(data) : 'bot_1';
    const text = typeof data === 'object' ? data.text : data;

    const chatRateKey = `chat:${socket.id}:${slotId}`;
    if (!rateLimiter.isAllowed(chatRateKey, 3, 1000)) {
      socket.emit('chat-message', {
        slotId,
        id: Math.random().toString(36).substring(2, 9),
        sender: 'System',
        text: 'Chat rate limit reached. Slow down!',
        timestamp: Date.now(),
        isSystem: true,
      });
      return;
    }

    const bot = botManager.getBot(slotId);
    if (bot && typeof text === 'string') {
      bot.sendChat(text);
    }
  });

  // Event: Toggle Anti-AFK
  socket.on('toggle-anti-afk', (data) => {
    const slotId = getSlot(data);
    const enabled = typeof data?.enabled === 'boolean' ? data.enabled : Boolean(data);
    const bot = botManager.getBot(slotId);
    if (bot) {
      bot.setAntiAfk(enabled);
    }
  });

  // Event: Toggle Auto-Eat
  socket.on('toggle-auto-eat', (data) => {
    const slotId = getSlot(data);
    const enabled = typeof data?.enabled === 'boolean' ? data.enabled : Boolean(data);
    const bot = botManager.getBot(slotId);
    if (bot) {
      bot.setAutoEat(enabled);
    }
  });

  // Event: Toggle Auto-Attack
  socket.on('toggle-auto-attack', (data) => {
    const slotId = getSlot(data);
    const enabled = typeof data?.enabled === 'boolean' ? data.enabled : Boolean(data);
    const bot = botManager.getBot(slotId);
    if (bot) {
      bot.setAutoAttack(enabled);
    }
  });

  // Event: Toggle AI Chat
  socket.on('toggle-ai-chat', (data) => {
    const slotId = getSlot(data);
    const enabled = typeof data?.enabled === 'boolean' ? data.enabled : Boolean(data);
    const bot = botManager.getBot(slotId);
    if (bot) {
      bot.isAiChatActive = enabled;
      bot.broadcastState();
    }
  });

  // Event: Bed Sleep Navigation
  socket.on('bot-sleep', (data) => {
    const slotId = getSlot(data);
    const bot = botManager.getBot(slotId);
    if (bot) {
      bot.goToSleep();
    }
  });

  // Event: Wake up from Bed
  socket.on('bot-wake', (data) => {
    const slotId = getSlot(data);
    const bot = botManager.getBot(slotId);
    if (bot) {
      bot.wakeUp();
    }
  });

  // Event: Night Skip
  socket.on('bot-night-skip', (data) => {
    const slotId = getSlot(data);
    const bot = botManager.getBot(slotId);
    if (bot) {
      bot.temporarySleepLeave(60);
    }
  });

  // Event: Follow Player
  socket.on('follow-player', (data) => {
    const slotId = getSlot(data);
    const target = typeof data?.target === 'string' ? data.target : data;
    const bot = botManager.getBot(slotId);
    if (bot && typeof target === 'string') {
      bot.followPlayer(target);
    }
  });

  // Event: Stop Following
  socket.on('stop-follow', (data) => {
    const slotId = getSlot(data);
    const bot = botManager.getBot(slotId);
    if (bot) {
      bot.stopFollow();
    }
  });

  // Event: Change Bot Username
  socket.on('change-bot-username', (data) => {
    const slotId = getSlot(data);
    const newUsername = typeof data?.newUsername === 'string' ? data.newUsername : data;
    const bot = botManager.getBot(slotId);
    if (!bot) {
      socket.emit('bot-error', { slotId, error: 'No active bot found to rename.' });
      return;
    }

    const result = bot.changeUsernameAndRejoin(newUsername, 10);
    if (!result.success) {
      socket.emit('bot-error', { slotId, error: result.error || 'Failed to rename bot.' });
    }
  });

  // Event: Toss Item
  socket.on('toss-item', (data) => {
    const slotId = getSlot(data);
    const bot = botManager.getBot(slotId);
    if (bot && typeof data?.slot === 'number') {
      const slotValidation = SecurityValidator.validateInventorySlot(data.slot);
      if (slotValidation.valid && slotValidation.sanitized !== undefined) {
        bot.tossItem(slotValidation.sanitized, data.count);
      }
    }
  });

  // Event: Equip Item
  socket.on('equip-item', (data) => {
    const slotId = getSlot(data);
    const bot = botManager.getBot(slotId);
    if (bot && typeof data?.slot === 'number') {
      const slotValidation = SecurityValidator.validateInventorySlot(data.slot);
      if (slotValidation.valid && slotValidation.sanitized !== undefined) {
        bot.equipItem(slotValidation.sanitized, data.destination);
      }
    }
  });

  // Event: Toss All
  socket.on('toss-all', (data) => {
    const slotId = getSlot(data);
    const bot = botManager.getBot(slotId);
    if (bot) {
      bot.tossAll();
    }
  });

  // Event: Eat Item
  socket.on('eat-item', (data) => {
    const slotId = getSlot(data);
    const itemSlot = typeof data?.slot === 'number' ? data.slot : data;
    const bot = botManager.getBot(slotId);
    if (bot && typeof itemSlot === 'number') {
      const slotValidation = SecurityValidator.validateInventorySlot(itemSlot);
      if (slotValidation.valid && slotValidation.sanitized !== undefined) {
        bot.eatItem(slotValidation.sanitized);
      }
    }
  });

  // Event: Use Item
  socket.on('use-item', (data) => {
    const slotId = getSlot(data);
    const itemSlot = typeof data?.slot === 'number' ? data.slot : data;
    const bot = botManager.getBot(slotId);
    if (bot && typeof itemSlot === 'number') {
      const slotValidation = SecurityValidator.validateInventorySlot(itemSlot);
      if (slotValidation.valid && slotValidation.sanitized !== undefined) {
        bot.useItem(slotValidation.sanitized);
      }
    }
  });

  // Event: Move Item
  socket.on('move-item', (data) => {
    const slotId = getSlot(data);
    const bot = botManager.getBot(slotId);
    if (bot && typeof data?.sourceSlot === 'number' && typeof data?.destSlot === 'number') {
      const srcValidation = SecurityValidator.validateInventorySlot(data.sourceSlot);
      const dstValidation = SecurityValidator.validateInventorySlot(data.destSlot);
      if (srcValidation.valid && dstValidation.valid && srcValidation.sanitized !== undefined && dstValidation.sanitized !== undefined) {
        bot.moveItem(srcValidation.sanitized, dstValidation.sanitized);
      }
    }
  });

  // Event: Share Item
  socket.on('share-item', (data) => {
    const slotId = getSlot(data);
    const itemSlot = typeof data?.slot === 'number' ? data.slot : data;
    const bot = botManager.getBot(slotId);
    if (bot && typeof itemSlot === 'number') {
      const slotValidation = SecurityValidator.validateInventorySlot(itemSlot);
      if (slotValidation.valid && slotValidation.sanitized !== undefined) {
        bot.shareItem(slotValidation.sanitized);
      }
    }
  });

  // Event: Set Auto-Disconnect Timer
  socket.on('set-timer', (data) => {
    const slotId = getSlot(data);
    const minutes = typeof data?.minutes === 'number' ? data.minutes : data;
    const bot = botManager.getBot(slotId);
    if (!bot) return;

    const timerValidation = SecurityValidator.validateTimerMinutes(minutes);
    if (timerValidation.valid && timerValidation.sanitized !== undefined) {
      bot.setDisconnectTimer(timerValidation.sanitized);
    } else {
      socket.emit('bot-error', { slotId, error: timerValidation.error || 'Invalid timer duration.' });
    }
  });

  // Event: Cancel Auto-Disconnect Timer
  socket.on('cancel-timer', (data) => {
    const slotId = getSlot(data);
    const bot = botManager.getBot(slotId);
    if (bot) {
      bot.cancelDisconnectTimer();
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected (${socket.id}). Bots remain active in background.`);
  });
});

// Fallback to client index.html for SPA routing (also wakes up active bots on ping to root!)
app.get('*', (req, res) => {
  botManager.checkAndReviveSlots();
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Centralized Express Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[CraftBot Express Error]:', err?.message || err);
  const status = typeof err?.status === 'number' ? err.status : 500;
  res.status(status).json({
    error: status === 500 ? 'Internal Server Error' : (err?.message || 'Request processing failed.'),
  });
});

server.on('error', (err: any) => {
  if (err.code === 'EACCES' && PORT === 80) {
    console.warn(`[CraftBot] Port 80 permission denied, falling back to 3001...`);
    server.listen(3001);
  } else {
    console.error(`[CraftBot] Server error:`, err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(` CraftBot 24/7 Cloud Manager Running!`);
  console.log(` Server & WebSocket Gateway: http://0.0.0.0:${PORT}`);
  console.log(` Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Dual-Bot Slot System: Active & Online`);
  console.log(`===============================================`);
});
