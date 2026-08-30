import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from './users.module';
import { AdminUsersController } from './admin-users.controller';

@Module({
  imports: [UsersModule, NotificationsModule],
  controllers: [AdminUsersController],
})
export class AdminUsersModule {}
