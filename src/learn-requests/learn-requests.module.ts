import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module';
import { SkillsModule } from '../skills/skills.module';
import { LearnRequestsService } from './services/learn-requests.service';
import { LearnRequestsController } from './controllers/learn-requests.controller';
import { AdminLearnRequestsController } from './controllers/admin-learn-requests.controller';

@Module({
  imports: [CategoriesModule, SkillsModule],
  providers: [LearnRequestsService],
  controllers: [LearnRequestsController, AdminLearnRequestsController],
})
export class LearnRequestsModule {}
