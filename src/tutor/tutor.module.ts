import { Module } from '@nestjs/common';

import { SkillsModule } from '../skills/skills.module';
import { CategoriesModule } from '../categories/categories.module';

import { TutorProfileService } from './services/tutor-profile.service';
import { EducationService } from './services/education.service';
import { LanguageService } from './services/language.service';
import { PortfolioService } from './services/portfolio.service';
import { CertificationService } from './services/certification.service';
import { EmploymentService } from './services/employment.service';
import { TutorSkillsService } from './services/tutor-skills.service';
import { TutorSpecialtiesService } from './services/tutor-specialties.service';

import { TutorProfileController } from './controllers/tutor-profile.controller';
import { EducationController } from './controllers/education.controller';
import { LanguageController } from './controllers/language.controller';
import { PortfolioController } from './controllers/portfolio.controller';
import { CertificationController } from './controllers/certification.controller';
import { EmploymentController } from './controllers/employment.controller';
import { TutorSkillsController } from './controllers/tutor-skills.controller';
import { TutorSpecialtiesController } from './controllers/tutor-specialties.controller';

@Module({
  imports: [SkillsModule, CategoriesModule],
  providers: [
    TutorProfileService,
    EducationService,
    LanguageService,
    PortfolioService,
    CertificationService,
    EmploymentService,
    TutorSkillsService,
    TutorSpecialtiesService,
  ],
  controllers: [
    TutorProfileController,
    EducationController,
    LanguageController,
    PortfolioController,
    CertificationController,
    EmploymentController,
    TutorSkillsController,
    TutorSpecialtiesController,
  ],
})
export class TutorModule {}
