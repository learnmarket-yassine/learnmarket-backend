import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CreateExceptionDto } from '../dto/exceptions/create-exception.dto';
import { UpdateExceptionDto } from '../dto/exceptions/update-exception.dto';
import { TutorAvailabilityExceptionsService } from '../services/tutor-availability-exceptions.service';

@Controller('tutor/availability/exceptions')
@UseGuards(RolesGuard)
@Roles(UserRole.TUTOR)
export class TutorAvailabilityExceptionsController {
  constructor(
    private readonly exceptions: TutorAvailabilityExceptionsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('id') tutorId: string, @Body() dto: CreateExceptionDto) {
    return this.exceptions.create(tutorId, dto);
  }

  @Get()
  findAll(@CurrentUser('id') tutorId: string) {
    return this.exceptions.findAll(tutorId);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') tutorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExceptionDto,
  ) {
    return this.exceptions.update(tutorId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') tutorId: string, @Param('id') id: string) {
    return this.exceptions.remove(tutorId, id);
  }
}
