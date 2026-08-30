import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from './users.service';

@Controller('admin/users')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post(':id/block')
  async block(@Param('id') id: string) {
    const user = await this.usersService.blockUser(id);
    await this.notifications.create(
      id,
      NotificationType.ACCOUNT_STATUS_UPDATED,
      'Account blocked',
      'Your account has been blocked. Contact support for assistance.',
    );
    return user;
  }

  @Post(':id/unblock')
  async unblock(@Param('id') id: string) {
    const user = await this.usersService.unblockUser(id);
    await this.notifications.create(
      id,
      NotificationType.ACCOUNT_STATUS_UPDATED,
      'Account unblocked',
      'Your account has been unblocked. You can resume using the platform.',
    );
    return user;
  }
}
