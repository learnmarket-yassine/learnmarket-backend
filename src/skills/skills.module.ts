import { Module } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { SkillsController } from './skills.controller';
import { AdminSkillsController } from './admin-skills.controller';

@Module({
  providers: [SkillsService],
  controllers: [SkillsController, AdminSkillsController],
  exports: [SkillsService],
})
export class SkillsModule {}
