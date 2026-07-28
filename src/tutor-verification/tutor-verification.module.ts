import { Module } from '@nestjs/common';
import { TutorModule } from '../tutor/tutor.module';
import { TutorVerificationService } from './services/tutor-verification.service';
import { TutorVerificationController } from './controllers/tutor-verification.controller';
import { AdminTutorVerificationController } from './controllers/admin-tutor-verification.controller';

@Module({
  imports: [TutorModule],
  providers: [TutorVerificationService],
  controllers: [TutorVerificationController, AdminTutorVerificationController],
})
export class TutorVerificationModule {}
