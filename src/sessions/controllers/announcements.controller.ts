import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateAnnouncementDto } from '../dto/create-announcement.dto';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { AnnouncementsService } from '../services/announcements.service';

@Controller()
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Post('sessions/:id/announcements')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcements.create(userId, id, dto);
  }

  @Get('sessions/:id/announcements')
  list(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.announcements.list(userId, id);
  }

  @Get('announcements/:id/attachments/:attachmentId/url')
  getAttachmentUrl(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.announcements.getAttachmentUrl(userId, id, attachmentId);
  }

  @Post('announcements/:id/comments')
  @HttpCode(HttpStatus.CREATED)
  addComment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.announcements.addComment(userId, id, dto);
  }
}
