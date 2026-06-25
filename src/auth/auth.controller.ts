import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { SignupDto } from './dto/signup.dto';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  // --- Registration & login -------------------------------------------------

  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.login(
      dto.email,
      dto.password,
      dto.deviceId,
      dto.deviceName,
    );
    this.setRefreshCookie(res, tokens.refreshToken);
    return tokens;
  }

  // --- Refresh --------------------------------------------------------------

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = this.extractRefreshToken(req, dto.refreshToken);
    const tokens = await this.auth.refresh(rawToken);
    this.setRefreshCookie(res, tokens.refreshToken);
    return tokens;
  }

  // --- Logout ---------------------------------------------------------------

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = this.extractRefreshToken(req, dto.refreshToken);
    const result = await this.auth.logout(rawToken);
    this.clearRefreshCookie(res);
    return result;
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.logoutAll(userId);
    this.clearRefreshCookie(res);
    return result;
  }

  // --- Sessions -------------------------------------------------------------

  @Get('sessions')
  listSessions(@CurrentUser('id') userId: string) {
    return this.auth.listSessions(userId);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  revokeSession(
    @CurrentUser('id') userId: string,
    @Param('id') sessionId: string,
  ) {
    return this.auth.revokeSession(userId, sessionId);
  }

  // --- Current user ---------------------------------------------------------

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  // --- Helpers --------------------------------------------------------------

  /** Web sends the token via httpOnly cookie; mobile sends it in the body. */
  private extractRefreshToken(req: Request, bodyToken?: string): string {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE
    ];
    const token = cookieToken ?? bodyToken;

    if (!token) {
      throw new UnauthorizedException('Refresh token missing');
    }
    return token;
  }

  private setRefreshCookie(res: Response, token: string): void {
    const days = this.config.get<number>('REFRESH_TOKEN_EXPIRES_DAYS', 7);
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get<boolean>('COOKIE_SECURE', false),
      sameSite: 'strict',
      domain: this.config.get<string>('COOKIE_DOMAIN'),
      path: '/auth',
      maxAge: days * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
  }
}
