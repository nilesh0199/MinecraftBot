"use strict";
/**
 * Security validation and sanitization for CraftBot
 * Guards against SSRF, command injection, chat packet corruption, zalgo attacks, and IP blacklist loops
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = exports.SecurityValidator = void 0;
// Blocked private / internal IP ranges to prevent SSRF (Server-Side Request Forgery)
const BLOCKED_IP_PATTERNS = [
    /^127\./, // Loopback IPv4
    /^0\./, // Current network
    /^169\.254\./, // Link-local / Cloud Metadata (e.g. AWS/Oracle 169.254.169.254)
    /^10\./, // Private Class A
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
    /^192\.168\./, // Private Class C
    /^fc00:/i, // Unique local address IPv6
    /^fe80:/i, // Link-local IPv6
    /^::1$/, // Loopback IPv6
    /^localhost$/i, // Localhost hostname
];
// Dangerous ports to prevent scanning internal server services
const DANGEROUS_PORTS = new Set([
    22, // SSH
    23, // Telnet
    25, // SMTP
    80, // HTTP internal
    443, // HTTPS internal
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
class SecurityValidator {
    /**
     * Validate Minecraft Server Hostname / IP (SSRF protection)
     */
    static validateServerHost(host, allowLocal = false) {
        if (!host || typeof host !== 'string') {
            return { valid: false, error: 'Server host is required.' };
        }
        const trimmed = host.trim().toLowerCase();
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
            for (const pattern of BLOCKED_IP_PATTERNS) {
                if (pattern.test(trimmed)) {
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
    static validatePort(port, allowDangerousPorts = false) {
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
    static validateUsername(username) {
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
    static sanitizeChatMessage(message) {
        if (typeof message !== 'string') {
            return { valid: false, error: 'Message must be a string.' };
        }
        // 1. Strip carriage returns, newlines, and null bytes to prevent packet injection
        let clean = message.replace(/[\r\n\0\x08\x0B\x0C]/g, ' ');
        // 2. Strip dangerous Unicode: Right-to-Left overrides, zero-width chars, and stacked Zalgo diacritics
        clean = clean
            .replace(/[\u202E\u202D\u200E\u200F\u200B\uFEFF]/g, '') // RTL overrides & zero-width
            .replace(/[\u0300-\u036F\u0489]{3,}/g, ''); // Excessive stacked Zalgo accents
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
    static isBanOrPermanentKick(reason) {
        if (!reason || typeof reason !== 'string')
            return false;
        const lower = reason.toLowerCase();
        return PERMANENT_KICK_KEYWORDS.some((kw) => lower.includes(kw));
    }
    /**
     * Validate Inventory Slot
     */
    static validateInventorySlot(slot) {
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
    static validateTimerMinutes(minutes) {
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
    static validateUid(uid) {
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
exports.SecurityValidator = SecurityValidator;
/**
 * Token bucket / sliding window rate limiter
 */
class RateLimiter {
    actions = new Map();
    constructor(cleanupIntervalMs = 60000) {
        if (typeof setInterval !== 'undefined') {
            const timer = setInterval(() => {
                const now = Date.now();
                for (const [key, timestamps] of this.actions.entries()) {
                    const fresh = timestamps.filter(t => now - t < 120000);
                    if (fresh.length === 0) {
                        this.actions.delete(key);
                    }
                    else {
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
    isAllowed(key, maxAttempts, windowMs) {
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
    reset(key) {
        this.actions.delete(key);
    }
}
exports.RateLimiter = RateLimiter;
