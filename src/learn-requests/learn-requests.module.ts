import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module';
import { SkillsModule } from '../skills/skills.module';
import { SparksModule } from '../sparks/sparks.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { LearnRequestsService } from './services/learn-requests.service';
import { LearnRequestValidationService } from './services/learn-request-validation.service';
import { SavedLearnRequestsService } from './services/saved-learn-requests.service';
import { LearnRequestsController } from './controllers/learn-requests.controller';
import { SavedLearnRequestsController } from './controllers/saved-learn-requests.controller';

@Module({
  imports: [
    CategoriesModule,
    SkillsModule,
    SparksModule,
    PlatformSettingsModule,
  ],
  providers: [
    LearnRequestsService,
    LearnRequestValidationService,
    SavedLearnRequestsService,
  ],
  controllers: [SavedLearnRequestsController, LearnRequestsController],
})
export class LearnRequestsModule {}
