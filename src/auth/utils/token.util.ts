import { createHash } from 'crypto';

/**
 * Refresh tokens are signed JWTs, but their authoritative validity is
 * controlled by Redis (RefreshTokenService), not just their signature —
 * only this hash is ever stored, never the raw token.
 */

/** Deterministic hash used both to store and to look up a token. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
