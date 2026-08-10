import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { StringValue } from 'ms';
import { SignupDto } from './dto/signup.dto';
import * as crypto from 'crypto';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';
import { RefreshTokenService } from './refresh-token.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  familyId: string;
}
interface ResetTokenPayload {
  sub: string;
  purpose: 'password-reset';
  email: string;
}
interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
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
    private readonly refreshTokens: RefreshTokenService,
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
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { ...userData, password: passwordHash },
      });
      if (created.role === UserRole.TUTOR) {
        await tx.tutorProfile.create({ data: { userId: created.id } });
      } else if (created.role === UserRole.LEARNER) {
        await tx.learnerProfile.create({ data: { userId: created.id } });
      }
      return created;
    });

    return { id: user.id, email: user.email, role: user.role };
  }

  async login(
    email: string,
    password: string,
    deviceId?: string,
    deviceName?: string,
  ): Promise<TokenPair> {
    return this.authenticate(
      email,
      password,
      [UserRole.LEARNER, UserRole.TUTOR],
      'Please use the admin login',
      deviceId,
      deviceName,
    );
  }

  async adminLogin(
    email: string,
    password: string,
    deviceId?: string,
    deviceName?: string,
  ): Promise<TokenPair> {
    return this.authenticate(
      email,
      password,
      [UserRole.ADMIN],
      'Access restricted to administrators',
      deviceId,
      deviceName,
    );
  }
  private async authenticate(
    email: string,
    password: string,
    allowedRoles: UserRole[],
    forbiddenMessage: string,
    deviceId?: string,
    deviceName?: string,
  ): Promise<TokenPair> {
    const user = await this.getUserAndCheckPassword(password, email);
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException(forbiddenMessage);
    }

    const resolvedFamilyId = deviceId ?? randomUUID();

    return this.issueTokens(user, resolvedFamilyId, deviceName);
  }

  verifyAccessToken(token: string): AuthUser {
    const payload = this.jwtService.verify<AccessTokenPayload>(token, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
    });
    return { id: payload.sub, email: payload.email, role: payload.role };
  }

  // ---------------------------------------------------------------------------
  // Refresh — Redis-backed family rotation with reuse detection
  // ---------------------------------------------------------------------------

  async refresh(rawToken: string): Promise<TokenPair> {
    const rotated = await this.refreshTokens.rotate(rawToken);

    const user = await this.users.findById(rotated.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      accessToken: this.signAccessToken(user),
      refreshToken: rotated.refreshToken,
      familyId: rotated.familyId,
    };
  }

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------
  async logout(rawToken: string): Promise<{ message: string }> {
    const identity = this.refreshTokens.identify(rawToken);
    if (identity) {
      await this.refreshTokens.revokeFamily(identity.userId, identity.familyId);
    }
    return { message: 'Logged out' };
  }

  //Revoke every active session for the user.
  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.refreshTokens.revokeAllFamilies(userId);
    return { message: 'Logged out from all devices' };
  }

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  // List active (unexpired) sessions for the sessions screen.
  async listSessions(userId: string) {
    const sessions = await this.refreshTokens.listFamilies(userId);
    return sessions.map((session) => ({
      id: session.familyId,
      deviceId: session.familyId,
      deviceName: session.deviceName ?? null,
      createdAt: session.createdAt,
      expiresAt: new Date(
        Date.now() + session.expiresInSeconds * 1000,
      ).toISOString(),
    }));
  }

  // Revoke one session by family id, if it belongs to the user.
  async revokeSession(
    userId: string,
    sessionId: string,
  ): Promise<{ message: string }> {
    const revoked = await this.refreshTokens.revokeFamily(userId, sessionId);

    if (!revoked) {
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
    //Update password, then revoke every refresh-token family for the user
    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { password: passwordHash },
    });
    await this.refreshTokens.revokeAllFamilies(payload.sub);

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
    familyId: string,
    deviceName?: string,
  ): Promise<TokenPair> {
    const { refreshToken } = await this.refreshTokens.issue(
      user.id,
      familyId,
      deviceName,
    );

    return {
      accessToken: this.signAccessToken(user),
      refreshToken,
      familyId,
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
