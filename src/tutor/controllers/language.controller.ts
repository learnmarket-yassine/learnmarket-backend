import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UpsertLanguageDto } from '../dto/language/upsert-language.dto';
import { LanguageService } from '../services/language.service';

@Controller('tutor/languages')
@UseGuards(RolesGuard)
@Roles(UserRole.TUTOR)
export class LanguageController {
  constructor(private readonly language: LanguageService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  add(@CurrentUser('id') userId: string, @Body() dto: UpsertLanguageDto) {
    return this.language.add(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') languageId: string,
    @Body() dto: UpsertLanguageDto,
  ) {
    return this.language.update(userId, languageId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') userId: string, @Param('id') languageId: string) {
    return this.language.remove(userId, languageId);
  }
}
