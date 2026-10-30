import mineflayer, { Bot } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { plugin as autoEat } from 'mineflayer-auto-eat';
import { Server as SocketServer } from 'socket.io';
import { SecurityValidator } from '../security/validator';
import { GroqChatService } from '../ai/GroqChatService';

export interface BotConfig {
  username: string;
  serverIp: string;
  serverPort: number;
  authPassword?: string;
  version?: string;
  ownerIgn: string;
  autoEat?: boolean;
  antiAfk?: boolean;
  autoAttack?: boolean;
  isAiChatActive?: boolean;
  groqApiKey?: string;
}

export class BotInstance {
  public bot: Bot | null = null;
  public config: BotConfig;
  public userId: string;
  public io: SocketServer;

  public status: 'offline' | 'connecting' | 'online' | 'error' = 'offline';
  public uptimeStart: number = 0;
  public errorMessage: string | null = null;

  // Timers & intervals
  private antiAfkInterval: NodeJS.Timeout | null = null;
  private autoAttackInterval: NodeJS.Timeout | null = null;
  private disconnectTimer: NodeJS.Timeout | null = null;
  private disconnectTimerEnd: number | null = null;
  private stateBroadcastInterval: NodeJS.Timeout | null = null;
  private connectionHealthInterval: NodeJS.Timeout | null = null;

  private lastPacketTime: number = 0;
  private lastInGameCommandTime: number = 0;
  private hasAnnouncedSpawn: boolean = false;
  private lastEmittedChatMessage: { text: string; time: number } = { text: '', time: 0 };
  private trackedDoors: Map<string, { x: number; y: number; z: number; openedAt: number; initialDist: number }> = new Map();

  // Smart Reconnect & Offline Handling
  public isExplicitlyStopped: boolean = false;
  private retryCount: number = 0;
  private readonly maxRetries: number = 5;
  private retryTimer: NodeJS.Timeout | null = null;
  private nextRetryAt: number = 0;

  // Automation flags
  public isAntiAfkActive: boolean = true;
  public isAutoEatActive: boolean = true;
  public isAutoAttackActive: boolean = false;
  public isAiChatActive: boolean = true;
  public isFollowing: boolean = false;
  public targetPlayerToFollow: string | null = null;
  public onOwnerChanged?: (newOwner: string) => void;
  private tempLeaveTimer: NodeJS.Timeout | null = null;
  private groqService = GroqChatService.getInstance();

  constructor(userId: string, config: BotConfig, io: SocketServer) {
    this.userId = userId;
    this.config = config;
    this.io = io;
    this.isAntiAfkActive = config.antiAfk ?? true;
    this.isAutoEatActive = config.autoEat ?? true;
    this.isAutoAttackActive = config.autoAttack ?? false;
    this.isAiChatActive = config.isAiChatActive ?? true;
  }

  public start() {
    if (this.bot) {
      this.stop();
    }

    // Security Validation 1: Hostname / IP (SSRF Protection)
    const allowLocal = process.env.ALLOW_LOCAL_SERVERS === 'true';
    const hostValidation = SecurityValidator.validateServerHost(this.config.serverIp, allowLocal);
    if (!hostValidation.valid) {
      this.failFast(hostValidation.error || 'Invalid server host.');
      return;
    }

    // Security Validation 2: Port
    const portValidation = SecurityValidator.validatePort(this.config.serverPort, allowLocal);
    if (!portValidation.valid) {
      this.failFast(portValidation.error || 'Invalid server port.');
      return;
    }

    // Security Validation 3: Username
    const userValidation = SecurityValidator.validateUsername(this.config.username);
    if (!userValidation.valid) {
      this.failFast(userValidation.error || 'Invalid bot username.');
      return;
    }

    // Security Validation 4: Owner IGN
    const ownerValidation = SecurityValidator.validateUsername(this.config.ownerIgn);
    if (!ownerValidation.valid) {
      this.failFast(ownerValidation.error || 'Invalid Owner Minecraft IGN.');
      return;
    }

    this.status = 'connecting';
    this.isExplicitlyStopped = false;
    this.cancelRetryTimer();
    this.lastPacketTime = Date.now();
    this.broadcastState();

    try {
      this.bot = mineflayer.createBot({
        host: hostValidation.sanitized!,
        port: portValidation.sanitized!,
        username: userValidation.sanitized!,
        version: this.config.version || undefined,
        auth: 'offline', // Cracked server authentication
        checkTimeoutInterval: 45000, // 45s ping timeout
        hideErrors: true, // Prevent raw stack traces leaking to stdout
      });

      // Defensive: Catch low-level client socket errors (e.g. ECONNRESET, broken pipes)
      if ((this.bot as any)._client) {
        (this.bot as any)._client.on('error', (err: any) => {
          console.error(`[Bot ${this.config.username} Socket Error Caught]:`, err?.message);
        });

        // Packet heartbeat tracker (detects zombie half-open TCP connections)
        (this.bot as any)._client.on('packet', () => {
          this.lastPacketTime = Date.now();
        });
      }

      // Load plugins
      this.bot.loadPlugin(pathfinder);
      this.bot.loadPlugin(autoEat);

      this.setupListeners();
    } catch (err: any) {
      this.failFast(err?.message || 'Failed to initialize Minecraft client.');
    }
  }

  private failFast(error: string) {
    this.status = 'error';
    this.errorMessage = error;
    this.broadcastState();
    this.io.to(this.userId).emit('bot-error', error);
  }

  private setupListeners() {
    if (!this.bot) return;

    // 1. Modern Server Resource Pack Handler (Prevents login limbo kicks)
    this.bot.on('resourcePack' as any, (_url: string, _hash: string) => {
      try {
        console.log(`[Bot ${this.config.username}] Server requested resource pack. Accepting...`);
        if ((this.bot as any)?.acceptResourcePack) {
          (this.bot as any).acceptResourcePack();
        }
      } catch (e) {}
    });

    // 2. Respawn / Dimension Change Handler (Prevents entity & pathfinding desyncs)
    this.bot.on('respawn', () => {
      try {
        console.log(`[Bot ${this.config.username}] Bot respawned / dimension transitioned.`);
        this.stopFollow();
        this.broadcastState();
      } catch (e) {}
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
      } catch (e) {}
      this.broadcastState();
    });

    // 3. Successful Spawn in World
    this.bot.once('spawn', () => {
      try {
        console.log(`[Bot ${this.config.username}] Successfully spawned in ${this.config.serverIp}!`);
        this.status = 'online';
        this.uptimeStart = Date.now();
        this.errorMessage = null;
        this.retryCount = 0;
        this.cancelRetryTimer();

        // Setup pathfinder movements with anti-cheat safe defaults & door navigation
        if (this.bot) {
          const defaultMove = new Movements(this.bot);
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
            } catch (e) {}
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
            } catch (e) {
              console.error('Auto-login error:', e);
            }
          }, 1200);
        }

        // Configure auto-eat
        if (this.isAutoEatActive && (this.bot as any)?.autoEat) {
          (this.bot as any).autoEat.options = {
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
      } catch (err) {
        console.error(`[Bot ${this.config.username} Spawn Setup Error]:`, err);
      }
    });

    // In-Game Chat Command Listener (commands processed without emitting duplicate UI chat)
    this.bot.on('chat', (username, message) => {
      try {
        const sanitizedText = SecurityValidator.sanitizeChatMessage(message);
        const textToDisplay = sanitizedText.sanitized || message;

        // Process in-game commands (public and owner-only)
        this.handleInGameCommand(username, textToDisplay);
      } catch (err) {
        console.error('Chat handling error:', err);
      }
    });

    // Unified In-Game Chat & System Messages Listener with Deduplication
    this.bot.on('message', (jsonMsg) => {
      try {
        const plainText = jsonMsg.toString();
        if (!plainText.trim()) return;

        const sanitized = SecurityValidator.sanitizeChatMessage(plainText);
        const textToDisplay = sanitized.sanitized || plainText;

        // Emit single unified message to web dashboard
        this.emitChatMessage(textToDisplay, undefined, true, jsonMsg);

        // Check for authentic whisper commands
        this.handleWhisperFromText(textToDisplay);
      } catch (err) {
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

      // Check if kick is permanent ban or whitelist rejection
      const isPermanent = SecurityValidator.isBanOrPermanentKick(reasonStr);
      if (isPermanent) {
        console.warn(`[Bot ${this.config.username}] Server issued ban/whitelist kick. Auto-reconnect permanently disabled.`);
        this.status = 'error';
        this.errorMessage = `Banned or not whitelisted: ${reasonStr}`;
        this.isExplicitlyStopped = true;
        this.cancelRetryTimer();
        this.broadcastState();
        this.io.to(this.userId).emit('bot-error', `Kicked: ${reasonStr}`);
        this.cleanup();
        return;
      }

      this.handleAutoReconnect(`Kicked: ${reasonStr}`);
    });

    this.bot.on('end', (reason) => {
      console.log(`[Bot ${this.config.username}] Connection ended:`, reason);
      this.handleAutoReconnect(`Disconnected from server (${reason || 'server closed'})`);
    });

    this.bot.on('error', (err) => {
      console.error(`[Bot ${this.config.username}] Error:`, err);
      this.handleAutoReconnect(err?.message || 'Connection error');
    });
  }

  /**
   * Broadcast message to dashboard with deduplication protection
   */
  private emitChatMessage(text: string, sender?: string, isSystem = false, raw?: any) {
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
  private handleDoorClosing() {
    if (!this.bot || !this.bot.entity) return;
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
          } catch (e) {}
        }
      }
    }

    // Check tracked doors and close them if the bot has stepped past them
    const now = Date.now();
    for (const [key, tracked] of this.trackedDoors.entries()) {
      try {
        const doorBlock = this.bot.blockAt(new (this.bot as any).vec3(tracked.x, tracked.y, tracked.z) || pos.offset(0,0,0));
        if (!doorBlock) {
          this.trackedDoors.delete(key);
          continue;
        }

        const currentDist = pos.distanceTo(doorBlock.position);
        // If bot is between 1.6 and 3.2 blocks away and further away than when it entered
        if (currentDist > 1.6 && currentDist < 3.2 && currentDist > tracked.initialDist + 0.5) {
          const props = doorBlock.getProperties();
          if (props?.open === true || props?.open === 'true') {
            this.bot.activateBlock(doorBlock).catch(() => {});
          }
          this.trackedDoors.delete(key);
        } else if (currentDist >= 3.5 || now - tracked.openedAt > 8000) {
          this.trackedDoors.delete(key);
        }
      } catch (e) {
        this.trackedDoors.delete(key);
      }
    }
  }

  /**
   * Process in-game commands sent in public chat
   * Tiered System: Common commands for everyone, Owner-only commands strictly for ownerIgn
   */
  private handleInGameCommand(sender: string, message: string) {
    if (!this.bot || this.status !== 'online') return;

    // Do not respond to self
    if (sender.trim().toLowerCase() === this.config.username.trim().toLowerCase()) return;

    const trimmed = message.trim();
    const lower = trimmed.toLowerCase();
    const isOwner = sender.trim().toLowerCase() === this.config.ownerIgn.trim().toLowerCase();
    const botNameLower = this.config.username.trim().toLowerCase();
    const isMention = lower.includes(botNameLower) || lower.includes('@' + botNameLower);

    // Throttle commands to prevent chat spam (min 1 second between replies)
    const now = Date.now();
    if (now - this.lastInGameCommandTime < 1000) return;

    // 1. HELP / COMMANDS (Available for everyone)
    if (lower === '!help' || lower === '!commands' || lower === '!cmds') {
      this.lastInGameCommandTime = now;
      this.bot.chat(`[Commands] Public: !help, !sleep, !wake, !nightskip, !ask <msg>, !follow, !stop, !status | Owner (${this.config.ownerIgn}): !shutdown bot, !transfer <IGN>, !ai on/off, !dropall, !eat, !attack`);
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
      this.bot.chat(`[AI] Groq AI Chat Companion enabled! Talk to me with @${this.config.username} or "!ask <question>".`);
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

    // 7. AI CHAT QUESTIONS (!ask <question> or !ai <question>)
    if (lower.startsWith('!ask ') || lower.startsWith('!ai ')) {
      this.lastInGameCommandTime = now;
      if (!this.isAiChatActive) {
        this.bot.chat(`[AI] AI companion is currently disabled. Ask owner to enable with "!ai on".`);
        return;
      }
      const question = trimmed.replace(/^!(ask|ai)\s+/i, '');
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
      } else {
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
      const validation = SecurityValidator.validateUsername(targetOwner);
      if (!validation.valid || !validation.sanitized) {
        this.bot.chat(`Invalid player IGN "${targetOwner}". Ownership transfer canceled.`);
        return;
      }
      const oldOwner = this.config.ownerIgn;
      this.config.ownerIgn = validation.sanitized;
      this.onOwnerChanged?.(validation.sanitized);
      this.broadcastState();
      this.io.to(this.userId).emit('owner-updated', { newOwner: validation.sanitized });
      this.bot.chat(`👑 [Ownership Transferred] ${oldOwner} transferred bot ownership to <${validation.sanitized}>!`);
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

    if (
      lower.startsWith('!drop') || lower.startsWith('!dropall') || lower.startsWith('!toss') ||
      lower.startsWith('!eat') || lower.startsWith('!feed') ||
      lower.startsWith('!attack') || lower.startsWith('!grind') ||
      lower.startsWith('!antiafk') || lower.startsWith('!say')
    ) {
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
        if ((this.bot as any)?.autoEat) {
          (this.bot as any).autoEat.eat().then(() => {
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
  private handleWhisperFromText(text: string) {
    const owner = this.config.ownerIgn.trim();
    if (!owner) return;

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
  public sendChat(message: string) {
    if (!this.bot || this.status !== 'online') return;

    const sanitized = SecurityValidator.sanitizeChatMessage(message);
    if (!sanitized.valid || !sanitized.sanitized) return;

    try {
      this.bot.chat(sanitized.sanitized);
    } catch (err) {
      console.error(`[Bot ${this.config.username}] Failed to send chat:`, err);
    }
  }

  /**
   * Follow a player with pathfinder (with error boundary)
   */
  public followPlayer(playerName: string) {
    if (!this.bot || this.status !== 'online') return;

    const validatedTarget = SecurityValidator.validateUsername(playerName);
    if (!validatedTarget.valid) return;

    const target = this.bot.players[validatedTarget.sanitized!]?.entity;
    if (!target) {
      this.bot.chat(`Cannot find player ${validatedTarget.sanitized} nearby.`);
      return;
    }

    try {
      this.isFollowing = true;
      this.targetPlayerToFollow = validatedTarget.sanitized!;
      this.bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
      this.bot.chat(`Following ${validatedTarget.sanitized}...`);
    } catch (err) {
      console.error('Follow pathfinding error:', err);
      this.stopFollow();
    }
  }

  public stopFollow() {
    if (!this.bot) return;
    try {
      this.isFollowing = false;
      this.targetPlayerToFollow = null;
      this.bot.pathfinder.setGoal(null);
    } catch (err) {}
  }

  /**
   * Find nearest bed within 24 blocks, walk to it, and sleep
   */
  public async goToSleep(): Promise<void> {
    if (!this.bot || this.status !== 'online') return;

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
      const goal = new goals.GoalNear(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z, 2);
      await this.bot.pathfinder.goto(goal);

      // Settle position
      await new Promise((r) => setTimeout(r, 250));

      await this.bot.sleep(bedBlock);
      this.bot.chat('🛏️ In bed! Goodnight everyone.');
      this.broadcastState();
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('day') || msg.includes('not at night')) {
        this.bot.chat('Can only sleep at night or during thunderstorms!');
      } else if (msg.includes('monster')) {
        this.bot.chat('Cannot sleep now, there are monsters nearby!');
      } else if (msg.includes('occupied')) {
        this.bot.chat('That bed is already occupied by someone else!');
      } else if (msg.includes('too far')) {
        this.bot.chat('Bed is too far away to reach.');
      } else {
        this.bot.chat(`Could not sleep (${msg || 'error'}). Type "!nightskip" to make me leave for 1 min.`);
      }
    }
  }

  /**
   * Wake up from bed
   */
  public async wakeUp(): Promise<void> {
    if (!this.bot || this.status !== 'online') return;
    if (!this.bot.isSleeping) {
      this.bot.chat('I am not currently sleeping in a bed.');
      return;
    }
    try {
      await this.bot.wake();
      this.bot.chat('Woke up from bed.');
      this.broadcastState();
    } catch (err: any) {
      this.bot.chat(`Could not wake up: ${err?.message || 'error'}`);
    }
  }

  /**
   * Temporary Sleep Leave: Disconnect for 60 seconds so players can pass the night, then auto-rejoin
   */
  public temporarySleepLeave(durationSeconds: number = 60) {
    if (this.tempLeaveTimer) {
      clearTimeout(this.tempLeaveTimer);
      this.tempLeaveTimer = null;
    }

    if (this.bot && this.status === 'online') {
      try {
        this.bot.chat(`🌙 Leaving for ${durationSeconds} seconds so players can sleep and pass the night! Rejoining automatically in 1 minute...`);
      } catch (e) {}
    }

    const delayMs = durationSeconds * 1000;
    this.nextRetryAt = Date.now() + delayMs;
    this.status = 'connecting';
    this.errorMessage = `Passing the night: Disconnected for ${durationSeconds}s to let players sleep. Rejoining in ${durationSeconds}s...`;

    setTimeout(() => {
      this.cleanup();
      this.broadcastState();

      this.tempLeaveTimer = setTimeout(() => {
        this.tempLeaveTimer = null;
        if (this.isExplicitlyStopped) return;
        console.log(`[Bot ${this.config.username}] 60s night-skip completed. Rejoining Minecraft server...`);
        this.retryNow();
      }, delayMs);
    }, 400);
  }

  /**
   * Anti-AFK Routine
   */
  public startAntiAfk() {
    if (this.antiAfkInterval) clearInterval(this.antiAfkInterval);
    if (!this.isAntiAfkActive) return;

    this.antiAfkInterval = setInterval(() => {
      if (!this.bot || this.status !== 'online' || this.isFollowing || this.bot.isSleeping) return;

      try {
        const randomYaw = this.bot.entity.yaw + (Math.random() * 0.4 - 0.2);
        const randomPitch = (Math.random() * 0.3 - 0.15);
        this.bot.look(randomYaw, randomPitch, false);

        const action = Math.random();
        if (action > 0.7) {
          this.bot.setControlState('sneak', true);
          setTimeout(() => this.bot?.setControlState('sneak', false), 800);
        } else if (action > 0.5) {
          this.bot.swingArm('right');
        }
      } catch (e) {}
    }, 15000);
  }

  public setAntiAfk(enabled: boolean) {
    this.isAntiAfkActive = enabled;
    if (enabled) {
      this.startAntiAfk();
    } else if (this.antiAfkInterval) {
      clearInterval(this.antiAfkInterval);
      this.antiAfkInterval = null;
    }
  }

  /**
   * Auto-Attack for Mob Grinders
   */
  public startAutoAttack() {
    if (this.autoAttackInterval) clearInterval(this.autoAttackInterval);
    if (!this.isAutoAttackActive) return;

    this.autoAttackInterval = setInterval(() => {
      if (!this.bot || this.status !== 'online' || this.bot.isSleeping) return;

      try {
        const mobFilter = (entity: any) =>
          entity.type === 'mob' &&
          entity.name !== 'armor_stand' &&
          this.bot!.entity.position.distanceTo(entity.position) <= 3.5;

        const target = this.bot.nearestEntity(mobFilter);
        if (target) {
          this.bot.lookAt(target.position.offset(0, target.height * 0.6, 0))
            .then(() => {
              if (this.bot && target.isValid) {
                this.bot.attack(target);
              }
            })
            .catch(() => {});
        }
      } catch (err) {}
    }, 650);
  }

  public setAutoAttack(enabled: boolean) {
    this.isAutoAttackActive = enabled;
    if (enabled) {
      this.startAutoAttack();
    } else if (this.autoAttackInterval) {
      clearInterval(this.autoAttackInterval);
      this.autoAttackInterval = null;
    }
  }

  public setAutoEat(enabled: boolean) {
    this.isAutoEatActive = enabled;
    if ((this.bot as any)?.autoEat) {
      (this.bot as any).autoEat.options.bannedFood = enabled
        ? ['rotten_flesh', 'spider_eye', 'poisonous_potato', 'pufferfish']
        : [];
    }
  }

  /**
   * Disconnect Timer
   */
  public setDisconnectTimer(minutes: number) {
    const validMinutes = SecurityValidator.validateTimerMinutes(minutes);
    if (!validMinutes.valid) return;

    this.cancelDisconnectTimer();
    const ms = validMinutes.sanitized! * 60 * 1000;
    this.disconnectTimerEnd = Date.now() + ms;

    this.disconnectTimer = setTimeout(() => {
      console.log(`[Bot ${this.config.username}] Auto-disconnect timer expired (${minutes}m). Leaving...`);
      if (this.bot) {
        try {
          this.bot.chat(`Disconnect timer expired. Leaving game...`);
        } catch (e) {}
      }
      setTimeout(() => this.stop(), 500);
    }, ms);

    this.broadcastTimer();
  }

  public cancelDisconnectTimer() {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      this.disconnectTimerEnd = null;
      this.broadcastTimer();
    }
  }

  private broadcastTimer() {
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
  private startConnectionHealthWatchdog() {
    if (this.connectionHealthInterval) clearInterval(this.connectionHealthInterval);

    this.connectionHealthInterval = setInterval(() => {
      if (this.status !== 'online' || !this.bot) return;

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
  public tossItem(slot: number, count?: number) {
    if (!this.bot || this.status !== 'online') return;

    const validSlot = SecurityValidator.validateInventorySlot(slot);
    if (!validSlot.valid) return;

    const item = this.bot.inventory?.slots?.[validSlot.sanitized!];
    if (!item) return;

    const amountToToss = (count && count > 0 && count <= item.count) ? count : item.count;
    this.bot.toss(item.type, null, amountToToss)
      .then(() => this.broadcastInventory())
      .catch((err) => console.error('Toss error:', err));
  }

  public tossAll() {
    if (!this.bot || this.status !== 'online') return;
    try {
      const items = this.bot.inventory.items();
      items.forEach((item, index) => {
        setTimeout(() => {
          if (this.bot && this.status === 'online') {
            this.bot.tossStack(item).catch(() => {});
          }
        }, index * 100);
      });
    } catch (err) {}
  }

  public equipItem(slot: number, destination: 'hand' | 'off-hand' | 'head' | 'torso' | 'legs' | 'feet') {
    if (!this.bot || this.status !== 'online') return;

    const validSlot = SecurityValidator.validateInventorySlot(slot);
    if (!validSlot.valid) return;

    const item = this.bot.inventory?.slots?.[validSlot.sanitized!];
    if (!item) return;

    this.bot.equip(item, destination as any)
      .then(() => this.broadcastInventory())
      .catch((err) => console.error('Equip error:', err));
  }

  public broadcastInventory() {
    if (!this.bot || !this.bot.inventory) return;

    try {
      const items = this.bot.inventory.slots
        .map((item, slot) => {
          if (!item) return null;
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
    } catch (err) {
      console.error('Broadcast inventory error:', err);
    }
  }

  /**
   * Periodic State Broadcasting
   */
  private startStateBroadcasting() {
    if (this.stateBroadcastInterval) clearInterval(this.stateBroadcastInterval);

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
  private async replyWithAi(sender: string, question: string) {
    if (!this.bot || this.status !== 'online') return;
    try {
      const reply = await this.groqService.generateReply({
        sender,
        message: question,
        botUsername: this.config.username,
        ownerIgn: this.config.ownerIgn,
        customApiKey: this.config.groqApiKey,
      });

      if (reply && this.bot && this.status === 'online') {
        this.bot.chat(reply);
      }
    } catch (e) {
      console.error(`[Bot ${this.config.username}] Failed to reply with AI:`, e);
    }
  }

  public broadcastState() {
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
      ping: (this.bot?.player as any)?.ping ?? 0,
      uptimeSeconds,
      error: this.errorMessage,
      ownerIgn: this.config.ownerIgn,
      isAiChatActive: this.isAiChatActive,
      isSleeping: Boolean(this.bot?.isSleeping),
      retryInfo: this.retryTimer ? {
        attempt: this.retryCount,
        maxAttempts: this.maxRetries,
        nextRetryAt: this.nextRetryAt,
      } : null,
    };

    this.io.to(this.userId).emit('bot-state', payload);
  }

  /**
   * Handle Disconnection & Offline Server Reconnection with Exponential Backoff
   */
  private handleAutoReconnect(reason: string) {
    this.cleanup();

    if (this.isExplicitlyStopped) {
      this.status = 'offline';
      this.broadcastState();
      return;
    }

    // Avoid duplicate re-entry if a retry timer is already pending
    if (this.retryTimer) {
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
      this.errorMessage = `Server offline or restarting. Reconnecting in ${seconds}s (Attempt ${this.retryCount}/${this.maxRetries})...`;
      console.log(`[Bot ${this.config.username}] ${this.errorMessage}`);
      this.broadcastState();

      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.nextRetryAt = 0;
        if (this.isExplicitlyStopped) return;
        console.log(`[Bot ${this.config.username}] Auto-reconnect attempt ${this.retryCount}/${this.maxRetries} to ${this.config.serverIp}:${this.config.serverPort}...`);
        this.start();
      }, delayMs);
    } else {
      // Retries exhausted (server is definitely offline)
      this.status = 'offline';
      this.nextRetryAt = 0;
      this.errorMessage = `Minecraft server is offline (unreachable after ${this.maxRetries} attempts). Click "Retry Now" when server is back up.`;
      console.warn(`[Bot ${this.config.username}] Max retries reached. Server is offline.`);
      this.cancelRetryTimer();
      this.broadcastState();
      this.io.to(this.userId).emit('server-offline', {
        serverIp: this.config.serverIp,
        serverPort: this.config.serverPort,
        attempts: this.maxRetries,
      });
    }
  }

  public cancelRetryTimer() {
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
  public retryNow() {
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
  public stop() {
    this.isExplicitlyStopped = true;
    this.cancelRetryTimer();
    this.retryCount = 0;
    this.nextRetryAt = 0;
    this.status = 'offline';
    this.cleanup();

    if (this.bot) {
      try {
        this.bot.removeAllListeners();
        if ((this.bot as any)._client) {
          (this.bot as any)._client.removeAllListeners();
        }
        this.bot.quit();
      } catch (e) {}
      this.bot = null;
    }

    this.broadcastState();
  }

  private cleanup() {
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

    // Wipe short-term AI conversation context on disconnect
    this.groqService.clearHistory(this.config.username);
  }
}
