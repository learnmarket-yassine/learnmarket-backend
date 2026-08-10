import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmailModule } from '../email/email.module';
import { RedisModule } from '../redis/redis.module';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  providers: [AuthService, JwtStrategy, RefreshTokenService],
  controllers: [AuthController],
  imports: [
    UsersModule,
    JwtModule.register({}),
    PassportModule,
    EmailModule,
    RedisModule,
  ],
  exports: [AuthService],
})
export class AuthModule {}
