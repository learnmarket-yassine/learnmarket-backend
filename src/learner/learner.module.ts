import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module';

import { LearnerProfileService } from './services/learner-profile.service';
import { LearnerInterestsService } from './services/learner-interests.service';

import { LearnerProfileController } from './controllers/learner-profile.controller';
import { LearnerInterestsController } from './controllers/learner-interests.controller';

@Module({
  imports: [CategoriesModule],
  providers: [LearnerProfileService, LearnerInterestsService],
  controllers: [LearnerProfileController, LearnerInterestsController],
})
export class LearnerModule {}
