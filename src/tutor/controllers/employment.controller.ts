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
import { EmploymentService } from '../services/employment.service';
import { CreateEmploymentDto } from '../dto/employment/create-employment.dto';
import { UpdateEmploymentDto } from '../dto/employment/update-employment.dto';

@Controller('tutor/employment')
@UseGuards(RolesGuard)
@Roles(UserRole.TUTOR)
export class EmploymentController {
  constructor(private readonly employment: EmploymentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  add(@CurrentUser('id') userId: string, @Body() dto: CreateEmploymentDto) {
    return this.employment.add(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') employmentId: string,
    @Body() dto: UpdateEmploymentDto,
  ) {
    return this.employment.update(userId, employmentId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') userId: string, @Param('id') employmentId: string) {
    return this.employment.remove(userId, employmentId);
  }
}
