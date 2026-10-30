import crypto from 'crypto';

const AUTH_SECRET = process.env.CRAFTBOT_SECRET || 'craftbot_secure_production_secret_key_92813';

export interface UserSession {
  uid: string;
  ownerIgn: string;
  issuedAt: number;
}

export class SessionAuth {
  /**
   * Create an HMAC-signed session token for a user
   */
  public static createSessionToken(uid: string, ownerIgn: string): string {
    const payload = JSON.stringify({
      uid,
      ownerIgn,
      issuedAt: Date.now(),
    });

    const base64Payload = Buffer.from(payload).toString('base64url');
    const signature = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(base64Payload)
      .digest('base64url');

    return `${base64Payload}.${signature}`;
  }

  /**
   * Verify and decode a session token
   */
  public static verifySessionToken(token: string): UserSession | null {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [base64Payload, signature] = parts;

    // Verify signature
    const expectedSignature = crypto
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
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    try {
      const json = Buffer.from(base64Payload, 'base64url').toString('utf8');
      const data = JSON.parse(json);

      if (!data.uid || typeof data.uid !== 'string') return null;

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
    } catch {
      return null;
    }
  }
}
