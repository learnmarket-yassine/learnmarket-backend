import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { SpecialtiesService } from './specialties.service';
import { CategoriesController } from './categories.controller';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminSpecialtiesController } from './admin-specialties.controller';

@Module({
  providers: [CategoriesService, SpecialtiesService],
  controllers: [
    CategoriesController,
    AdminCategoriesController,
    AdminSpecialtiesController,
  ],
  exports: [CategoriesService, SpecialtiesService],
})
export class CategoriesModule {}
