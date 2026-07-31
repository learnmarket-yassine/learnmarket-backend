import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { FeedbackService } from '../services/feedback.service';

@Controller('tutors/:id/feedback')
export class TutorFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @Public()
  getTutorFeedback(@Param('id') tutorId: string) {
    return this.feedback.getTutorFeedbackList(tutorId);
  }
}
