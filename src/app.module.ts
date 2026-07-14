import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { EmailModule } from './email/email.module';
import { RedisModule } from './redis/redis.module';
import { TutorModule } from './tutor/tutor.module';
import { LearnerModule } from './learner/learner.module';
import { StorageModule } from './storage/storage.module';
import { SkillsModule } from './skills/skills.module';
import { CategoriesModule } from './categories/categories.module';
import { AvailabilityModule } from './availability/availability.module';
import { ProposalsModule } from './proposals/proposals.module';
import { LearnRequestsModule } from './learn-requests/learn-requests.module';
import { HoldsModule } from './holds/holds.module';
import { BookingsModule } from './bookings/bookings.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),
    ScheduleModule.forRoot(),
    HealthModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    EmailModule,
    RedisModule,
    TutorModule,
    LearnerModule,
    StorageModule,
    SkillsModule,
    CategoriesModule,
    AvailabilityModule,
    ProposalsModule,
    LearnRequestsModule,
    HoldsModule,
    BookingsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    // Protect every route by default; opt out per-route with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
