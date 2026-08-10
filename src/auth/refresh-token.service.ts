import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import type { StringValue } from 'ms';
import { RedisService } from '../redis/redis.service';
import { hashToken } from './utils/token.util';

interface RefreshTokenPayload {
  sub: string;
  familyId: string;
  jti: string;
}

export interface RefreshFamilySession {
  familyId: string;
  deviceName?: string;
  createdAt: string;
  updatedAt: string;
  expiresInSeconds: number;
}

interface IssuedRefreshToken {
  refreshToken: string;
  familyId: string;
}

const ROTATION_GRACE_MS = 10_000;

const ROTATE_SCRIPT = `
local key = KEYS[1]
local presented = ARGV[1]
local newHash = ARGV[2]
local ttl = tonumber(ARGV[3])
local grace = tonumber(ARGV[4])
local now = tonumber(ARGV[5])
local updatedAt = ARGV[6]

if redis.call('EXISTS', key) == 0 then
  return 0
end

local current = redis.call('HGET', key, 'hash')
if presented == current then
  redis.call('HSET', key, 'hash', newHash, 'prevHash', current, 'prevGraceExp', tostring(now + grace), 'updatedAt', updatedAt)
  redis.call('EXPIRE', key, ttl)
  return 1
end

local prev = redis.call('HGET', key, 'prevHash')
local prevExp = redis.call('HGET', key, 'prevGraceExp')
if prev and presented == prev and prevExp and now < tonumber(prevExp) then
  redis.call('HSET', key, 'hash', newHash, 'prevHash', prev, 'prevGraceExp', tostring(now + grace), 'updatedAt', updatedAt)
  redis.call('EXPIRE', key, ttl)
  return 1
end

redis.call('DEL', key)
return 2
`;

const familyKey = (userId: string, familyId: string) =>
  `refresh:${userId}:${familyId}`;
const familyScanPattern = (userId: string) => `refresh:${userId}:*`;

@Injectable()
export class RefreshTokenService implements OnModuleInit {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.redis.getClient().defineCommand('rotateRefreshFamily', {
      numberOfKeys: 1,
      lua: ROTATE_SCRIPT,
    });
  }

  async issue(
    userId: string,
    familyId: string,
    deviceName?: string,
  ): Promise<IssuedRefreshToken> {
    const { token, hash, ttlSeconds } = this.mint(userId, familyId);
    const now = new Date().toISOString();
    const key = familyKey(userId, familyId);

    await this.redis
      .getClient()
      .multi()
      .hset(key, {
        hash,
        deviceName: deviceName ?? '',
        createdAt: now,
        updatedAt: now,
      })
      .expire(key, ttlSeconds)
      .exec();

    return { refreshToken: token, familyId };
  }
  async rotate(
    rawToken: string,
  ): Promise<IssuedRefreshToken & { userId: string }> {
    const payload = this.verify(rawToken);
    const key = familyKey(payload.sub, payload.familyId);
    const presentedHash = hashToken(rawToken);
    const {
      token: newToken,
      hash: newHash,
      ttlSeconds,
    } = this.mint(payload.sub, payload.familyId);

    const result = await this.redis
      .getClient()
      .rotateRefreshFamily(
        key,
        presentedHash,
        newHash,
        ttlSeconds,
        ROTATION_GRACE_MS,
        Date.now(),
        new Date().toISOString(),
      );

    if (result === 2) {
      this.logger.warn(
        `SECURITY: refresh token reuse detected, revoking session family — userId=${payload.sub} familyId=${payload.familyId}`,
      );
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (result !== 1) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      refreshToken: newToken,
      familyId: payload.familyId,
      userId: payload.sub,
    };
  }

  /** Best-effort decode used by logout: never throws, returns null if unverifiable. */
  identify(rawToken: string): { userId: string; familyId: string } | null {
    try {
      const payload = this.verify(rawToken);
      return { userId: payload.sub, familyId: payload.familyId };
    } catch {
      return null;
    }
  }

  /** Returns true if the family existed (and was revoked). */
  async revokeFamily(userId: string, familyId: string): Promise<boolean> {
    const deleted = await this.redis
      .getClient()
      .del(familyKey(userId, familyId));
    return deleted > 0;
  }

  async revokeAllFamilies(userId: string): Promise<void> {
    const keys = await this.scanFamilyKeys(userId);
    if (keys.length) {
      await this.redis.getClient().del(...keys);
    }
  }

  async listFamilies(userId: string): Promise<RefreshFamilySession[]> {
    const keys = await this.scanFamilyKeys(userId);
    const client = this.redis.getClient();

    const sessions = await Promise.all(
      keys.map(async (key) => {
        const [data, ttl] = await Promise.all([
          client.hgetall(key),
          client.ttl(key),
        ]);
        if (!data.hash || ttl < 0) return null;

        const session: RefreshFamilySession = {
          familyId: key.slice(key.lastIndexOf(':') + 1),
          deviceName: data.deviceName || undefined,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          expiresInSeconds: ttl,
        };
        return session;
      }),
    );

    return sessions.filter((s): s is RefreshFamilySession => s !== null);
  }

  private async scanFamilyKeys(userId: string): Promise<string[]> {
    const client = this.redis.getClient();
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await client.scan(
        cursor,
        'MATCH',
        familyScanPattern(userId),
        'COUNT',
        100,
      );
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }

  private mint(
    userId: string,
    familyId: string,
  ): { token: string; hash: string; ttlSeconds: number } {
    const payload: RefreshTokenPayload = {
      sub: userId,
      familyId,
      jti: randomUUID(),
    };
    const token = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<StringValue>(
        'JWT_REFRESH_EXPIRES_IN',
        '7d' as StringValue,
      ),
    });

    // TTL is derived from the token's own exp/iat rather than re-parsed
    // from the env string, so it can never drift from what was signed.
    const decoded = this.jwtService.decode<{ exp: number; iat: number }>(token);
    const ttlSeconds = decoded.exp - decoded.iat;

    return { token, hash: hashToken(token), ttlSeconds };
  }

  private verify(rawToken: string): RefreshTokenPayload {
    try {
      return this.jwtService.verify<RefreshTokenPayload>(rawToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}

declare module 'ioredis' {
  interface Redis {
    rotateRefreshFamily(
      key: string,
      presentedHash: string,
      newHash: string,
      ttlSeconds: number,
      graceMs: number,
      nowMs: number,
      updatedAt: string,
    ): Promise<number>;
  }
}
