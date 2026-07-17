import { Module } from '@nestjs/common';
import { SkillsModule } from '../skills/skills.module';
import { CategoriesService } from './categories.service';
import { CategorySkillsService } from './category-skills.service';
import { SpecialtiesService } from './specialties.service';
import { CategoriesController } from './categories.controller';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminSpecialtiesController } from './admin-specialties.controller';

@Module({
  imports: [SkillsModule],
  providers: [CategoriesService, SpecialtiesService, CategorySkillsService],
  controllers: [
    CategoriesController,
    AdminCategoriesController,
    AdminSpecialtiesController,
  ],
  exports: [CategoriesService, SpecialtiesService],
})
export class CategoriesModule {}
