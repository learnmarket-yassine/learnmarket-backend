import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { EducationService } from './education.service';
import { EducationController } from './education.controller';
import { LanguageService } from './language.service';
import { LanguageController } from './language.controller';

@Module({
  controllers: [UsersController, EducationController, LanguageController],
  providers: [UsersService, EducationService, LanguageService],
  exports: [UsersService],
})
export class UsersModule {}
