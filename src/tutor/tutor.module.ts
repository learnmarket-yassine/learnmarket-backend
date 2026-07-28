import { Module } from '@nestjs/common';

import { SkillsModule } from '../skills/skills.module';
import { CategoriesModule } from '../categories/categories.module';

import { TutorProfileService } from './services/tutor-profile.service';
import { PortfolioService } from './services/portfolio.service';
import { CertificationService } from './services/certification.service';
import { EmploymentService } from './services/employment.service';
import { TutorSkillsService } from './services/tutor-skills.service';
import { TutorSpecialtiesService } from './services/tutor-specialties.service';

import { TutorProfileController } from './controllers/tutor-profile.controller';
import { PortfolioController } from './controllers/portfolio.controller';
import { CertificationController } from './controllers/certification.controller';
import { EmploymentController } from './controllers/employment.controller';
import { TutorSkillsController } from './controllers/tutor-skills.controller';
import { TutorSpecialtiesController } from './controllers/tutor-specialties.controller';

@Module({
  imports: [SkillsModule, CategoriesModule],
  providers: [
    TutorProfileService,
    PortfolioService,
    CertificationService,
    EmploymentService,
    TutorSkillsService,
    TutorSpecialtiesService,
  ],
  controllers: [
    TutorProfileController,
    PortfolioController,
    CertificationController,
    EmploymentController,
    TutorSkillsController,
    TutorSpecialtiesController,
  ],
  // CertificationService is consumed by TutorVerificationModule's admin
  // review flow (fetching a signed URL for a certification file).
  exports: [CertificationService],
})
export class TutorModule {}
