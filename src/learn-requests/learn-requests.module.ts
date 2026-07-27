import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module';
import { SkillsModule } from '../skills/skills.module';
import { LearnRequestsService } from './services/learn-requests.service';
import { LearnRequestValidationService } from './services/learn-request-validation.service';
import { SavedLearnRequestsService } from './services/saved-learn-requests.service';
import { LearnRequestsController } from './controllers/learn-requests.controller';
import { SavedLearnRequestsController } from './controllers/saved-learn-requests.controller';

@Module({
  imports: [CategoriesModule, SkillsModule],
  providers: [
    LearnRequestsService,
    LearnRequestValidationService,
    SavedLearnRequestsService,
  ],
  // SavedLearnRequestsController registered before LearnRequestsController:
  // its POST/DELETE :id/save routes don't collide, but this keeps the
  // save/unsave endpoints declared ahead of LearnRequestsController's
  // catch-all GET :id as a matter of habit -- see the route-ordering
  // comment on LearnRequestsController's `listSaved` method for the one
  // route that actually depends on it.
  controllers: [SavedLearnRequestsController, LearnRequestsController],
})
export class LearnRequestsModule {}
