import { Module } from '@nestjs/common';

import { TutorProfileService } from './services/tutor-profile.service';
import { EducationService } from './services/education.service';
import { LanguageService } from './services/language.service';
import { SkillService } from './services/skill.service';
import { PortfolioService } from './services/portfolio.service';
import { CertificationService } from './services/certification.service';
import { EmploymentService } from './services/employment.service';

import { TutorProfileController } from './controllers/tutor-profile.controller';
import { EducationController } from './controllers/education.controller';
import { LanguageController } from './controllers/language.controller';
import { SkillController } from './controllers/skill.controller';
import { PortfolioController } from './controllers/portfolio.controller';
import { CertificationController } from './controllers/certification.controller';
import { EmploymentController } from './controllers/employment.controller';

@Module({
  providers: [
    TutorProfileService,
    EducationService,
    LanguageService,
    SkillService,
    PortfolioService,
    CertificationService,
    EmploymentService,
  ],
  controllers: [
    TutorProfileController,
    EducationController,
    LanguageController,
    SkillController,
    PortfolioController,
    CertificationController,
    EmploymentController,
  ],
})
export class TutorModule {}
