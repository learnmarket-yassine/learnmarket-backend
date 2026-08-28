import { Module } from '@nestjs/common';
import { PlatformSettingsService } from './services/platform-settings.service';
import { AdminPlatformSettingsController } from './controllers/admin-platform-settings.controller';

@Module({
  providers: [PlatformSettingsService],
  controllers: [AdminPlatformSettingsController],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
