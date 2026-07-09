import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AttachSpecialtyDto } from '../dto/specialty/attach-specialty.dto';
import { ReplaceSpecialtiesDto } from '../dto/specialty/replace-specialties.dto';
import { TutorSpecialtiesService } from '../services/tutor-specialties.service';

@Controller('tutor/specialties')
@UseGuards(RolesGuard)
@Roles(UserRole.TUTOR)
export class TutorSpecialtiesController {
  constructor(private readonly tutorSpecialties: TutorSpecialtiesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  attach(@CurrentUser('id') userId: string, @Body() dto: AttachSpecialtyDto) {
    return this.tutorSpecialties.attach(userId, dto.specialtyId);
  }

  @Put()
  replace(
    @CurrentUser('id') userId: string,
    @Body() dto: ReplaceSpecialtiesDto,
  ) {
    return this.tutorSpecialties.replace(userId, dto.specialtyIds);
  }

  @Delete(':specialtyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  detach(
    @CurrentUser('id') userId: string,
    @Param('specialtyId') specialtyId: string,
  ) {
    return this.tutorSpecialties.detach(userId, specialtyId);
  }
}
