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
import { CreateEducationDto } from './dto/education/create-education.dto';
import { UpdateEducationDto } from './dto/education/update-education.dto';
import { EducationService } from './education.service';

@Controller('users/me/education')
export class EducationController {
  constructor(private readonly education: EducationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  add(@CurrentUser('id') userId: string, @Body() dto: CreateEducationDto) {
    return this.education.add(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') educationId: string,
    @Body() dto: UpdateEducationDto,
  ) {
    return this.education.update(userId, educationId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') userId: string, @Param('id') educationId: string) {
    return this.education.remove(userId, educationId);
  }
}
