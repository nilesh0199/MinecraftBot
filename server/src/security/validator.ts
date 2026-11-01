/**
 * Security validation and sanitization for CraftBot
 * Guards against SSRF, command injection, chat packet corruption, zalgo attacks, and IP blacklist loops
 */

// Blocked private / internal IP ranges to prevent SSRF (Server-Side Request Forgery)
const BLOCKED_IP_PATTERNS = [
  /^127\./,                         // Loopback IPv4
  /^0\./,                           // Current network
  /^169\.254\./,                    // Link-local / Cloud Metadata (e.g. AWS/Oracle 169.254.169.254)
  /^10\./,                          // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
  /^192\.168\./,                    // Private Class C
  /^fc00:/i,                       // Unique local address IPv6
  /^fe80:/i,                       // Link-local IPv6
  /^::1$/,                         // Loopback IPv6
  /^localhost$/i,                  // Localhost hostname
];

// Dangerous ports to prevent scanning internal server services
const DANGEROUS_PORTS = new Set([
  22,   // SSH
  23,   // Telnet
  25,   // SMTP
  80,   // HTTP internal
  443,  // HTTPS internal
  3000, // Common dev port
  3001, // CraftBot daemon port
  3306, // MySQL
  5432, // PostgreSQL
  6379, // Redis
  8080, // HTTP alt
  27017 // MongoDB
]);

// Keywords indicating permanent ban, whitelist rejection, or IP blacklisting danger
const PERMANENT_KICK_KEYWORDS = [
  'banned',
  'ban',
  'whitelist',
  'whitelisted',
  'not whitelisted',
  'kicked by operator',
  'suspended',
  'blacklisted',
  'maintenance',
  'security ban',
  'auth failed',
  'invalid password',
  'ip limit reached',
];

export interface ValidationResult<T> {
  valid: boolean;
  sanitized?: T;
  error?: string;
}

export class SecurityValidator {
  /**
   * Universal Server Address & Port parser and normalizer.
   * Gracefully handles:
   * - "choducid-7caj.aternos.me:16808" -> host: "choducid-7caj.aternos.me", port: 16808
   * - "http://mc.hypixel.net/" -> host: "mc.hypixel.net", port: 25565
   * - "tcp://play.myserver.org:25566" -> host: "play.myserver.org", port: 25566
   */
  public static cleanServerAddressAndPort(rawHost: string, rawPort?: any): { host: string; port: number } {
    let host = (rawHost || '').trim();
    // Strip protocol prefixes if present (e.g. http://, https://, tcp://)
    host = host.replace(/^[a-zA-Z]+:\/\//, '');
    // Strip any trailing slash or URL path
    host = host.replace(/\/.*$/, '').trim();

    let port = 25565;
    if (rawPort !== undefined && rawPort !== null && String(rawPort).trim() !== '') {
      const p = parseInt(String(rawPort).trim(), 10);
      if (!isNaN(p) && p > 0 && p <= 65535) {
        port = p;
      }
    }

    // If host contains colon (e.g. "choducid-7caj.aternos.me:16808")
    if (host.includes(':')) {
      const lastColonIdx = host.lastIndexOf(':');
      const candidateHost = host.substring(0, lastColonIdx).replace(/^\[|\]$/g, '').trim();
      const candidatePort = parseInt(host.substring(lastColonIdx + 1).trim(), 10);

      if (!isNaN(candidatePort) && candidatePort > 0 && candidatePort <= 65535) {
        port = candidatePort;
        host = candidateHost;
      }
    }

    return { host, port };
  }

  /**
   * Validate Minecraft Server Hostname / IP (SSRF protection)
   */
  public static validateServerHost(host: string, allowLocal: boolean = false): ValidationResult<string> {
    if (!host || typeof host !== 'string') {
      return { valid: false, error: 'Server host is required.' };
    }

    const trimmed = host.trim();

    // Check length
    if (trimmed.length > 255 || trimmed.length < 1) {
      return { valid: false, error: 'Host length must be between 1 and 255 characters.' };
    }

    // Must be valid hostname or IP address format (prevent command injection / shell chars)
    const validHostRegex = /^[a-z0-9]([a-z0-9\-_.]{0,253}[a-z0-9])?$/i;
    if (!validHostRegex.test(trimmed)) {
      return { valid: false, error: 'Host contains illegal characters or invalid format.' };
    }

    // If local connections are forbidden, verify host is not in blocked IP/hostname patterns
    if (!allowLocal) {
      const lower = trimmed.toLowerCase();
      for (const pattern of BLOCKED_IP_PATTERNS) {
        if (pattern.test(lower)) {
          return {
            valid: false,
            error: 'Connection to internal, loopback, or cloud metadata addresses is forbidden.',
          };
        }
      }
    }

    return { valid: true, sanitized: trimmed };
  }

  /**
   * Validate Server Port
   */
  public static validatePort(port: number, allowDangerousPorts: boolean = false): ValidationResult<number> {
    const num = Number(port);
    if (!Number.isInteger(num) || num < 1 || num > 65535) {
      return { valid: false, error: 'Port must be a valid integer between 1 and 65535.' };
    }

    if (!allowDangerousPorts && DANGEROUS_PORTS.has(num)) {
      return {
        valid: false,
        error: `Port ${num} is a restricted service port. Please use a Minecraft server port (default 25565).`,
      };
    }

    return { valid: true, sanitized: num };
  }

  /**
   * Validate Minecraft Username
   */
  public static validateUsername(username: string): ValidationResult<string> {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username is required.' };
    }

    const trimmed = username.trim();
    // Standard Minecraft username: 3-16 chars, letters, numbers, and underscores
    const validUsernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
    if (!validUsernameRegex.test(trimmed)) {
      return {
        valid: false,
        error: 'Minecraft username must be 3-16 characters and contain only letters, numbers, and underscores.',
      };
    }

    return { valid: true, sanitized: trimmed };
  }

  /**
   * Sanitize In-Game Chat Message
   * Strips newlines, carriage returns, null bytes, zalgo characters, RTL overrides, and trims to 256 chars.
   */
  public static sanitizeChatMessage(message: string): ValidationResult<string> {
    if (typeof message !== 'string') {
      return { valid: false, error: 'Message must be a string.' };
    }

    // 1. Strip carriage returns, newlines, and null bytes to prevent packet injection
    let clean = message.replace(/[\r\n\0\x08\x0B\x0C]/g, ' ');

    // 2. Strip dangerous Unicode: Right-to-Left overrides, zero-width chars, and stacked Zalgo diacritics
    clean = clean
      .replace(/[\u202E\u202D\u200E\u200F\u200B\uFEFF]/g, '') // RTL overrides & zero-width
      .replace(/[\u0300-\u036F\u0489]{3,}/g, '');             // Excessive stacked Zalgo accents

    clean = clean.trim();

    // Prevent empty messages
    if (!clean) {
      return { valid: false, error: 'Message cannot be empty.' };
    }

    // Truncate to standard Minecraft chat packet maximum length
    if (clean.length > 256) {
      clean = clean.substring(0, 256);
    }

    return { valid: true, sanitized: clean };
  }

  /**
   * Analyze server kick reason to determine if auto-reconnect should be blocked
   * Prevents servers and firewalls from IP-banning the VPS
   */
  public static isBanOrPermanentKick(reason: string): boolean {
    if (!reason || typeof reason !== 'string') return false;
    const lower = reason.toLowerCase();
    return PERMANENT_KICK_KEYWORDS.some((kw) => lower.includes(kw));
  }

  /**
   * Validate Inventory Slot
   */
  public static validateInventorySlot(slot: number): ValidationResult<number> {
    const num = Number(slot);
    // Minecraft player inventory total slots: 0 to 45
    if (!Number.isInteger(num) || num < 0 || num > 45) {
      return { valid: false, error: 'Invalid inventory slot index (must be 0 to 45).' };
    }
    return { valid: true, sanitized: num };
  }

  /**
   * Validate Disconnect Timer (in minutes)
   */
  public static validateTimerMinutes(minutes: number): ValidationResult<number> {
    const num = Number(minutes);
    if (!Number.isInteger(num) || num < 1 || num > 1440) {
      return { valid: false, error: 'Timer must be between 1 minute and 1440 minutes (24 hours).' };
    }
    return { valid: true, sanitized: num };
  }

  /**
   * Validate User ID (UID)
   * Must be 1-128 chars of safe alphanumeric, hyphen, underscore, colon, dot, or at-sign
   */
  public static validateUid(uid: string): ValidationResult<string> {
    if (!uid || typeof uid !== 'string') {
      return { valid: false, error: 'User ID is required.' };
    }
    const trimmed = uid.trim();
    if (trimmed.length < 1 || trimmed.length > 128) {
      return { valid: false, error: 'User ID must be between 1 and 128 characters.' };
    }
    const validUidRegex = /^[a-zA-Z0-9_\-:.@]{1,128}$/;
    if (!validUidRegex.test(trimmed)) {
      return { valid: false, error: 'User ID contains illegal characters.' };
    }
    return { valid: true, sanitized: trimmed };
  }
}

/**
 * Token bucket / sliding window rate limiter
 */
export class RateLimiter {
  private actions: Map<string, number[]> = new Map();

  constructor(cleanupIntervalMs: number = 60000) {
    if (typeof setInterval !== 'undefined') {
      const timer = setInterval(() => {
        const now = Date.now();
        for (const [key, timestamps] of this.actions.entries()) {
          const fresh = timestamps.filter(t => now - t < 120000);
          if (fresh.length === 0) {
            this.actions.delete(key);
          } else {
            this.actions.set(key, fresh);
          }
        }
      }, cleanupIntervalMs);
      if (timer && typeof timer.unref === 'function') {
        timer.unref();
      }
    }
  }

  /**
   * Check if action is allowed
   */
  public isAllowed(key: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now();
    const timestamps = this.actions.get(key) || [];

    // Filter out timestamps older than window
    const recent = timestamps.filter(t => now - t < windowMs);

    if (recent.length >= maxAttempts) {
      this.actions.set(key, recent);
      return false;
    }

    recent.push(now);
    this.actions.set(key, recent);
    return true;
  }

  public reset(key: string) {
    this.actions.delete(key);
  }
}
