import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AttachFileDto } from '../../storage/dto/attach-file.dto';
import { CreateAssignmentDto } from '../dto/create-assignment.dto';
import { CreateCommentDto, UpdateCommentDto } from '../dto/create-comment.dto';
import { PresignSubmissionAttachmentDto } from '../dto/presign-submission-attachment.dto';
import { UpdateAssignmentDto } from '../dto/update-assignment.dto';
import { AssignmentsService } from '../services/assignments.service';

@Controller()
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post('sessions/:id/assignment')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.assignments.create(userId, id, dto);
  }

  @Get('sessions/:id/assignment')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.assignments.get(userId, id);
  }

  @Patch('sessions/:id/assignment')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignments.update(userId, id, dto);
  }

  @Delete('sessions/:id/assignment')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.assignments.remove(userId, id);
  }

  @Get('assignments/:id/attachments/:attachmentId/url')
  getAttachmentUrl(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.assignments.getAttachmentUrl(userId, id, attachmentId);
  }

  @Get('assignments/:id/submission/attachments/:attachmentId/url')
  getSubmissionAttachmentUrl(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.assignments.getSubmissionAttachmentUrl(userId, id, attachmentId);
  }

  @Post('assignments/:id/submission/attachments/presign')
  presignSubmissionAttachment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: PresignSubmissionAttachmentDto,
  ) {
    return this.assignments.presignSubmissionAttachment(userId, id, dto);
  }

  @Post('assignments/:id/submission/attachments')
  @HttpCode(HttpStatus.CREATED)
  addSubmissionAttachment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AttachFileDto,
  ) {
    return this.assignments.addSubmissionAttachment(userId, id, dto);
  }

  @Delete('assignments/:id/submission/attachments/:attachmentId')
  removeSubmissionAttachment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.assignments.removeSubmissionAttachment(
      userId,
      id,
      attachmentId,
    );
  }

  @Post('assignments/:id/submission/complete')
  @HttpCode(HttpStatus.OK)
  completeSubmission(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.assignments.completeSubmission(userId, id);
  }

  @Post('assignments/:id/submission/excuse')
  @HttpCode(HttpStatus.OK)
  excuseSubmission(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.assignments.excuseSubmission(userId, id);
  }

  @Post('assignments/:id/comments')
  @HttpCode(HttpStatus.CREATED)
  addComment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.assignments.addComment(userId, id, dto);
  }

  @Patch('assignments/comments/:commentId')
  updateComment(
    @CurrentUser('id') userId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.assignments.updateComment(userId, commentId, dto);
  }

  @Delete('assignments/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeComment(
    @CurrentUser('id') userId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.assignments.removeComment(userId, commentId);
  }
}
