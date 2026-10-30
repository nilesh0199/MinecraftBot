import mineflayer, { Bot } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { plugin as autoEat } from 'mineflayer-auto-eat';
import { Server as SocketServer } from 'socket.io';
import { SecurityValidator } from '../security/validator';

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

  // Automation flags
  public isAntiAfkActive: boolean = true;
  public isAutoEatActive: boolean = true;
  public isAutoAttackActive: boolean = false;
  public isFollowing: boolean = false;
  public targetPlayerToFollow: string | null = null;

  constructor(userId: string, config: BotConfig, io: SocketServer) {
    this.userId = userId;
    this.config = config;
    this.io = io;
    this.isAntiAfkActive = config.antiAfk ?? true;
    this.isAutoEatActive = config.autoEat ?? true;
    this.isAutoAttackActive = config.autoAttack ?? false;
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

    // 3. Successful Spawn in World
    this.bot.once('spawn', () => {
      try {
        console.log(`[Bot ${this.config.username}] Successfully spawned in ${this.config.serverIp}!`);
        this.status = 'online';
        this.uptimeStart = Date.now();
        this.errorMessage = null;

        // Setup pathfinder movements with anti-cheat safe defaults
        if (this.bot) {
          const defaultMove = new Movements(this.bot);
          defaultMove.canDig = false; // Prevents triggering server anti-cheat for impossible mining
          defaultMove.allow1by1towers = false;
          defaultMove.allowFreeMotion = false;
          this.bot.pathfinder.setMovements(defaultMove);
          this.bot.pathfinder.thinkTimeout = 8000;
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

    // In-Game Chat Listener
    this.bot.on('chat', (username, message) => {
      try {
        // Sanitize incoming message to prevent Zalgo/XSS exploits
        const sanitizedText = SecurityValidator.sanitizeChatMessage(message);
        const textToDisplay = sanitizedText.sanitized || message;

        // Broadcast to web dashboard
        this.io.to(this.userId).emit('chat-message', {
          id: Math.random().toString(36).substring(2, 9),
          sender: username,
          text: textToDisplay,
          timestamp: Date.now(),
        });

        // Strict: Check for In-Game Owner Commands using verified packet sender
        this.handleInGameCommand(username, textToDisplay);
      } catch (err) {
        console.error('Chat handling error:', err);
      }
    });

    // System/Server raw messages (broadcasts, death messages, MOTD)
    this.bot.on('message', (jsonMsg) => {
      try {
        const plainText = jsonMsg.toString();
        if (!plainText.trim()) return;

        const sanitized = SecurityValidator.sanitizeChatMessage(plainText);
        const textToDisplay = sanitized.sanitized || plainText;

        this.io.to(this.userId).emit('chat-message', {
          id: Math.random().toString(36).substring(2, 9),
          text: textToDisplay,
          raw: jsonMsg,
          timestamp: Date.now(),
          isSystem: true,
        });

        // Also check if this is an authentic whisper from the owner
        this.handleWhisperFromText(textToDisplay);
      } catch (err) {
        console.error('System message handling error:', err);
      }
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
      const isPermanent = SecurityValidator.isBanOrPermanentKick(reasonStr);
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
   * Process in-game commands sent in public chat
   */
  private handleInGameCommand(sender: string, message: string) {
    if (!this.bot || this.status !== 'online') return;

    // Strict verification: sender must match verified owner IGN
    const isOwner = sender.trim().toLowerCase() === this.config.ownerIgn.trim().toLowerCase();
    if (!isOwner) return;

    // Throttle commands (max 1 command every 1.5 seconds) to prevent command spamming
    const now = Date.now();
    if (now - this.lastInGameCommandTime < 1500) return;
    this.lastInGameCommandTime = now;

    const trimmed = message.trim();

    if (trimmed.startsWith('!leave') || trimmed.startsWith('!quit') || trimmed.startsWith('!disconnect')) {
      this.bot.chat(`Goodbye ${sender}! Disconnecting.`);
      setTimeout(() => this.stop(), 500);
      return;
    }

    if (trimmed.startsWith('!follow')) {
      const parts = trimmed.split(/\s+/);
      const targetName = parts[1] || sender;
      this.followPlayer(targetName);
      return;
    }

    if (trimmed.startsWith('!stop')) {
      this.stopFollow();
      this.bot.chat(`Stopped following.`);
      return;
    }

    if (trimmed.startsWith('!status')) {
      const pos = this.bot.entity?.position;
      const x = pos ? Math.round(pos.x) : 0;
      const y = pos ? Math.round(pos.y) : 0;
      const z = pos ? Math.round(pos.z) : 0;
      this.bot.chat(`Health: ${this.bot.health}/20 | Food: ${this.bot.food}/20 | Pos: ${x}, ${y}, ${z} (${this.bot.game.dimension})`);
      return;
    }

    if (trimmed.startsWith('!drop') || trimmed.startsWith('!dropall')) {
      this.tossAll();
      this.bot.chat(`Dropped inventory.`);
      return;
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
   * Anti-AFK Routine
   */
  public startAntiAfk() {
    if (this.antiAfkInterval) clearInterval(this.antiAfkInterval);
    if (!this.isAntiAfkActive) return;

    this.antiAfkInterval = setInterval(() => {
      if (!this.bot || this.status !== 'online' || this.isFollowing) return;

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
      if (!this.bot || this.status !== 'online') return;

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
    };

    this.io.to(this.userId).emit('bot-state', payload);
  }

  /**
   * Clean up and stop bot with complete resource detachment
   */
  public stop() {
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
  }
}
