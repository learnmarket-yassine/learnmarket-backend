import { createHash, randomBytes } from 'crypto';

/**
 * Refresh tokens are opaque, cryptographically random strings — NOT JWTs.
 * The raw value is handed to the client once; only its SHA-256 hash is
 */

/** 256 bits of entropy, hex-encoded. */
export function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}

/** Deterministic hash used both to store and to look up a token. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Returns a new Date `days` in the future, without mutating the input. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
