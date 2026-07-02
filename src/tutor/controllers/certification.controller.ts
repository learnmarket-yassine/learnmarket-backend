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
import { CertificationService } from '../services/certification.service';
import { CreateCertificationDto } from '../dto/certification/create-certification.dto';
import { UpdateCertificationDto } from '../dto/certification/update-certification.dto';

@Controller('tutor/certifications')
@UseGuards(RolesGuard)
@Roles(UserRole.TUTOR)
export class CertificationController {
  constructor(private readonly certification: CertificationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  add(@CurrentUser('id') userId: string, @Body() dto: CreateCertificationDto) {
    return this.certification.add(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') certId: string,
    @Body() dto: UpdateCertificationDto,
  ) {
    return this.certification.update(userId, certId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') userId: string, @Param('id') certId: string) {
    return this.certification.remove(userId, certId);
  }
}
