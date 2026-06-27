import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { addDays, generateSecureToken, hashToken } from './utils/token.util';
import { StringValue } from 'ms';
import { SignupDto } from './dto/signup.dto';
import * as crypto from 'crypto';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
}
interface ResetTokenPayload {
  sub: string;
  purpose: 'password-reset';
  email: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const OTP_TTL = 15 * 60;
const RESET_TOKEN_TTL = 15 * 60;

// ── Redis key builders ────────────────────────────────────────────────────────
const otpKey = (userId: string) => `otp:password-reset:${userId}`;
const resetTokenKey = (userId: string) => `reset-token:${userId}`;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly redis: RedisService,
  ) {}

  async signup(
    signupUserDto: SignupDto,
  ): Promise<{ id: string; email: string; role: string }> {
    const existing = await this.users.findByEmail(signupUserDto.email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await argon2.hash(signupUserDto.password);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirmPassword, ...userData } = signupUserDto;
    const user = await this.users.create({
      ...userData,
      password: passwordHash,
    });

    return { id: user.id, email: user.email, role: user.role };
  }

  async login(
    email: string,
    password: string,
    deviceId?: string,
    deviceName?: string,
  ): Promise<TokenPair> {
    const user = await this.getUserAndCheckPassword(password, email);
    // Generate a device id if the client didn't supply one.
    const resolvedDeviceId = deviceId ?? randomUUID();

    // One active session per device: revoke any existing live session for
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, deviceId: resolvedDeviceId, revoked: false },
      data: { revoked: true },
    });

    return this.issueTokens(user, resolvedDeviceId, deviceName);
  }

  // ---------------------------------------------------------------------------
  // Refresh — per-device rotation with reuse detection (simple strategy)
  // ---------------------------------------------------------------------------

  async refresh(rawToken: string): Promise<TokenPair> {
    const hash = hashToken(rawToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Normal path.issue the next token atomically. The guarded
    const newRawToken = generateSecureToken();
    const refreshTokenExpiresDays = this.config.get<number>(
      'REFRESH_TOKEN_EXPIRES_DAYS',
      7,
    );
    const expiresAt = addDays(new Date(), refreshTokenExpiresDays);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const rotated = await tx.refreshToken.updateMany({
        where: { id: stored.id, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      });

      if (rotated.count === 0) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      await tx.refreshToken.create({
        data: {
          tokenHash: hashToken(newRawToken),
          userId: stored.userId,
          deviceId: stored.deviceId,
          deviceName: stored.deviceName,
          expiresAt,
        },
      });
    });

    const accessToken = this.signAccessToken(stored.user);

    return {
      accessToken,
      refreshToken: newRawToken,
      deviceId: stored.deviceId,
    };
  }

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------

  // Revoke a single device session by its raw token (the current device).
  async logout(rawToken: string): Promise<{ message: string }> {
    const hash = hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    return { message: 'Logged out' };
  }

  //Revoke every active session for the user.
  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    return { message: 'Logged out from all devices' };
  }

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  // List active (non-revoked, unexpired) sessions for the sessions screen.
  async listSessions(userId: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: { userId, revoked: false, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        deviceId: true,
        deviceName: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return sessions;
  }

  // Revoke one session by row id, if it belongs to the user.
  async revokeSession(
    userId: string,
    sessionId: string,
  ): Promise<{ message: string }> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });

    if (result.count === 0) {
      throw new UnauthorizedException('Session not found');
    }
    return { message: 'Session revoked' };
  }

  // ---------------------------------------------------------------------------
  // Forgot Password
  // ---------------------------------------------------------------------------
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { message: 'If that email exists, an OTP has been sent.' };
    }

    // Generate 6-digit OTP and hash it before storing
    const otp = crypto.randomInt(100_000, 999_999).toString();
    const otpHash = await argon2.hash(otp);

    await this.redis.set(otpKey(user.id), otpHash, OTP_TTL);

    await this.email.sendPasswordResetEmail({
      email: user.email,
      otp,
      name: `${user.lastname} ${user.firstname}`,
    });

    return { message: 'If that email exists, an OTP has been sent.' };
  }
  // ---------------------------------------------------------------------------
  // Verify OTP
  // ---------------------------------------------------------------------------
  async verifyOtp(email: string, otp: string): Promise<{ resetToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid or expired OTP.');

    // Fetch hash from Redis
    const storedHash = await this.redis.get(otpKey(user.id));
    if (!storedHash) throw new UnauthorizedException('Invalid or expired OTP.');

    // Verify
    const isValid = await argon2.verify(storedHash, otp);
    if (!isValid) throw new UnauthorizedException('Invalid or expired OTP.');

    // Consume OTP — deleted immediately so it can't be reused
    await this.redis.delete(otpKey(user.id));

    // Issue a short-lived JWT reset token
    const resetToken = this.signResetToken(user);

    // Store token in Redis — acts as a whitelist (single-use enforcement)
    await this.redis.set(resetTokenKey(user.id), resetToken, RESET_TOKEN_TTL);

    return { resetToken };
  }
  // ---------------------------------------------------------------------------
  // Reset password
  // ---------------------------------------------------------------------------
  async resetPassword(
    resetToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    let payload: ResetTokenPayload;
    try {
      payload = this.jwtService.verify<ResetTokenPayload>(resetToken, {
        secret: this.config.get<string>('JWT_RESET_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token.');
    }
    if (payload.purpose !== 'password-reset') {
      throw new UnauthorizedException('Invalid token purpose.');
    }
    const storedToken = await this.redis.get(resetTokenKey(payload.sub));
    if (!storedToken || storedToken !== resetToken) {
      throw new UnauthorizedException('Reset token already used or expired.');
    }
    //Consume token immediately (single-use)
    await this.redis.delete(resetTokenKey(payload.sub));
    //Update password and revoke all sessions in one transaction
    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: payload.sub },
        data: { password: passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: payload.sub, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      }),
    ]);

    return { message: 'Password reset successfully.' };
  }
  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async getUserAndCheckPassword(
    password: string,
    email?: string,
    userId?: string,
  ) {
    let user: User | null = null;
    if (userId) {
      user = await this.users.findById(userId);
    } else if (email) {
      user = await this.users.findByEmail(email);
    }

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isSamePassword = await argon2.verify(user.password, password);

    if (!isSamePassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  private async issueTokens(
    user: User,
    deviceId: string,
    deviceName?: string,
  ): Promise<TokenPair> {
    const rawRefreshToken = generateSecureToken();
    const refreshTokenExpiresDays = this.config.get<number>(
      'REFRESH_TOKEN_EXPIRES_DAYS',
      7,
    );
    const expiresAt = addDays(new Date(), refreshTokenExpiresDays);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(rawRefreshToken),
        userId: user.id,
        deviceId,
        deviceName,
        expiresAt,
      },
    });

    return {
      accessToken: this.signAccessToken(user),
      refreshToken: rawRefreshToken,
      deviceId,
    };
  }

  private signAccessToken(user: User): string {
    return this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<StringValue>(
          'JWT_ACCESS_EXPIRES_IN',
          '15m' as StringValue,
        ),
      },
    );
  }

  private signResetToken(user: User): string {
    return this.jwtService.sign(
      { sub: user.id, email: user.email, purpose: 'password-reset' },
      {
        secret: this.config.get<string>('JWT_RESET_SECRET'),
        expiresIn: this.config.get<StringValue>(
          'JWT_RESET_EXPIRES_IN',
          '15m' as StringValue,
        ),
      },
    );
  }
}
