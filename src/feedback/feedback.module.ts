import { Module } from '@nestjs/common';
import { FeedbackService } from './services/feedback.service';
import { FeedbackController } from './controllers/feedback.controller';
import { TutorRatingController } from './controllers/tutor-rating.controller';

@Module({
  providers: [FeedbackService],
  controllers: [FeedbackController, TutorRatingController],
  exports: [FeedbackService],
})
export class FeedbackModule {}
