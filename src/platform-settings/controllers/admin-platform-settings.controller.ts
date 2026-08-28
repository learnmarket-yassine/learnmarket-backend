import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformSettingsService } from '../services/platform-settings.service';
import { UpdatePlatformSettingsDto } from '../dto/update-platform-settings.dto';

@Controller('admin/platform-settings')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  get() {
    return this.settings.getSettings();
  }

  @Patch()
  update(@Body() dto: UpdatePlatformSettingsDto) {
    return this.settings.updateSettings(dto);
  }
}
