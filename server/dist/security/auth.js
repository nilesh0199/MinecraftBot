"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionAuth = void 0;
const crypto_1 = __importDefault(require("crypto"));
const AUTH_SECRET = process.env.CRAFTBOT_SECRET || 'craftbot_secure_production_secret_key_92813';
class SessionAuth {
    /**
     * Create an HMAC-signed session token for a user
     */
    static createSessionToken(uid, ownerIgn) {
        const payload = JSON.stringify({
            uid,
            ownerIgn,
            issuedAt: Date.now(),
        });
        const base64Payload = Buffer.from(payload).toString('base64url');
        const signature = crypto_1.default
            .createHmac('sha256', AUTH_SECRET)
            .update(base64Payload)
            .digest('base64url');
        return `${base64Payload}.${signature}`;
    }
    /**
     * Verify and decode a session token
     */
    static verifySessionToken(token) {
        if (!token || typeof token !== 'string')
            return null;
        const parts = token.split('.');
        if (parts.length !== 2)
            return null;
        const [base64Payload, signature] = parts;
        // Verify signature
        const expectedSignature = crypto_1.default
            .createHmac('sha256', AUTH_SECRET)
            .update(base64Payload)
            .digest('base64url');
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expectedSignature);
        // CRITICAL SECURITY FIX: Buffer lengths MUST match before calling timingSafeEqual
        // Otherwise Node.js throws ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH
        if (sigBuf.length !== expBuf.length) {
            return null;
        }
        // Constant-time comparison to prevent timing attacks
        if (!crypto_1.default.timingSafeEqual(sigBuf, expBuf)) {
            return null;
        }
        try {
            const json = Buffer.from(base64Payload, 'base64url').toString('utf8');
            const data = JSON.parse(json);
            if (!data.uid || typeof data.uid !== 'string')
                return null;
            // Check expiration: valid for 30 days
            const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
            if (Date.now() - data.issuedAt > maxAgeMs) {
                return null;
            }
            return {
                uid: data.uid,
                ownerIgn: data.ownerIgn || '',
                issuedAt: data.issuedAt,
            };
        }
        catch {
            return null;
        }
    }
}
exports.SessionAuth = SessionAuth;
