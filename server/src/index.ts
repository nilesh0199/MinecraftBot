import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { BotManager } from './bot/BotManager';
import { SessionAuth } from './security/auth';
import { RateLimiter, SecurityValidator } from './security/validator';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (process.platform === 'win32' ? 3001 : 80);
const rateLimiter = new RateLimiter();

app.use(cors({ origin: '*' }));
app.use(express.json());

// API: Session Token Generator for Authenticated Clients
app.post('/api/auth/token', (req, res) => {
  const { uid, ownerIgn } = req.body;
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ error: 'Valid UID is required.' });
  }

  const token = SessionAuth.createSessionToken(uid, ownerIgn || '');
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

// Serve static frontend in production
const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// Setup Socket.io
const io = new SocketServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 30000,
  pingInterval: 15000,
});

const botManager = new BotManager(io);

// Socket Authentication Middleware
io.use((socket, next) => {
  const token = (socket.handshake.auth?.token || socket.handshake.query?.token) as string;
  const rawUid = socket.handshake.query?.uid as string;
  const rawOwnerIgn = socket.handshake.query?.ownerIgn as string;

  if (token) {
    const session = SessionAuth.verifySessionToken(token);
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
  const userId = socket.data.userId as string;
  const ownerIgn = socket.data.ownerIgn as string;

  // Join private room isolated to this user
  socket.join(userId);
  console.log(`[Socket] Authenticated connection: User ${userId} (Owner IGN: ${ownerIgn || 'N/A'})`);

  // If user already has a bot running in background, sync state immediately
  const existingBot = botManager.getBot(userId);
  if (existingBot) {
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

  // Event: Send In-Game Chat / Command with Rate Limiting (max 3 per sec)
  socket.on('send-chat', (text: string) => {
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
  socket.on('toss-item', ({ slot, count }: { slot: number; count?: number }) => {
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
  socket.on('equip-item', ({ slot, destination }: { slot: number; destination: any }) => {
    const bot = botManager.getBot(userId);
    if (bot) {
      bot.equipItem(slot, destination);
    }
  });

  // Event: Follow Player
  socket.on('follow-player', (targetPlayer: string) => {
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
  socket.on('toggle-anti-afk', (enabled: boolean) => {
    const bot = botManager.getBot(userId);
    if (bot) {
      bot.setAntiAfk(Boolean(enabled));
    }
  });

  // Event: Toggle Auto-Eat
  socket.on('toggle-auto-eat', (enabled: boolean) => {
    const bot = botManager.getBot(userId);
    if (bot) {
      bot.setAutoEat(Boolean(enabled));
    }
  });

  // Event: Toggle Auto-Attack (Mob Farm)
  socket.on('toggle-auto-attack', (enabled: boolean) => {
    const bot = botManager.getBot(userId);
    if (bot) {
      bot.setAutoAttack(Boolean(enabled));
    }
  });

  // Event: Set Disconnect Timer
  socket.on('set-timer', (minutes: number) => {
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
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

server.on('error', (err: any) => {
  if (err.code === 'EACCES' && PORT === 80) {
    console.warn(`[CraftBot] Port 80 permission denied, falling back to 3001...`);
    server.listen(3001);
  } else {
    console.error(`[CraftBot] Server error:`, err);
  }
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` CraftBot 24/7 Cloud Manager Running!`);
  console.log(` Server & WebSocket Gateway: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
