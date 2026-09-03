import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FeedbackService } from '../services/feedback.service';
import { SubmitFeedbackDto } from '../dto/submit-feedback.dto';

@Controller('proposals/:id/feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  submit(
    @CurrentUser('id') authorId: string,
    @Param('id') proposalId: string,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.feedback.submitFeedback(authorId, proposalId, dto);
  }

  @Get()
  findForProposal(
    @CurrentUser('id') viewerId: string,
    @Param('id') proposalId: string,
  ) {
    return this.feedback.getFeedbackForProposal(viewerId, proposalId);
  }
}
