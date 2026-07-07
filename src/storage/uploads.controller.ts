import { Body, Controller, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { UploadService } from './upload.service';
import { PresignUploadDto } from './dto/presign-upload.dto';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadService) {}

  @Post('presign')
  presign(@CurrentUser() user: AuthUser, @Body() dto: PresignUploadDto) {
    return this.uploads.presign(user.id, user.role as UserRole, dto);
  }
}
