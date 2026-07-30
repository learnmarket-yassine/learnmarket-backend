import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { FeedbackService } from '../services/feedback.service';

@Controller('tutors/:id/rating')
export class TutorRatingController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @Public()
  getRating(@Param('id') tutorId: string) {
    return this.feedback.getTutorRatingSummary(tutorId);
  }
}
