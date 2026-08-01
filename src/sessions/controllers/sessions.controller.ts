import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AttachFileDto } from '../../storage/dto/attach-file.dto';
import { SessionsService } from '../services/sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post(':id/meeting/retry')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TUTOR)
  retryMeeting(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.sessions.retryMeeting(userId, id);
  }

  @Get(':id')
  getContext(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.sessions.getSessionContext(userId, id);
  }

  @Get(':id/meeting')
  getMeeting(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.sessions.getMeetingDetails(userId, id);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  join(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.sessions.join(userId, id);
  }

  @Post(':id/attachments')
  @HttpCode(HttpStatus.CREATED)
  addAttachment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AttachFileDto,
  ) {
    return this.sessions.addAttachment(userId, id, dto);
  }

  @Get(':id/attachments')
  listAttachments(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.sessions.listAttachments(userId, id);
  }

  @Get(':id/attachments/:attachmentId/url')
  getAttachmentUrl(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.sessions.getAttachmentUrl(userId, id, attachmentId);
  }

  @Delete(':id/attachments/:attachmentId')
  removeAttachment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.sessions.removeAttachment(userId, id, attachmentId);
  }
}
