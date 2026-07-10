import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpsertLanguageDto } from './dto/language/upsert-language.dto';
import { LanguageService } from './language.service';

@Controller('users/me/languages')
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
