import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module';
import { SkillsModule } from '../skills/skills.module';
import { LearnRequestsService } from './services/learn-requests.service';
import { LearnRequestValidationService } from './services/learn-request-validation.service';
import { LearnRequestsController } from './controllers/learn-requests.controller';

@Module({
  imports: [CategoriesModule, SkillsModule],
  providers: [LearnRequestsService, LearnRequestValidationService],
  controllers: [LearnRequestsController],
})
export class LearnRequestsModule {}
