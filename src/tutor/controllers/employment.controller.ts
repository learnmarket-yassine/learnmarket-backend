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
import { EmploymentService } from '../services/employment.service';
import { CreateEmploymentDto } from '../dto/employment/create-employment.dto';
import { UpdateEmploymentDto } from '../dto/employment/update-employment.dto';
import { AttachFileDto } from '../../storage/dto/attach-file.dto';

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

  @Post(':id/certificates')
  @HttpCode(HttpStatus.CREATED)
  addCertificate(
    @CurrentUser('id') userId: string,
    @Param('id') employmentId: string,
    @Body() dto: AttachFileDto,
  ) {
    return this.employment.addCertificate(
      userId,
      employmentId,
      dto.key,
      dto.fileName,
    );
  }

  @Delete(':id/certificates/:certificateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCertificate(
    @CurrentUser('id') userId: string,
    @Param('id') employmentId: string,
    @Param('certificateId') certificateId: string,
  ) {
    return this.employment.removeCertificate(
      userId,
      employmentId,
      certificateId,
    );
  }

  @Get(':id/certificates/:certificateId/url')
  getCertificateUrl(
    @CurrentUser('id') userId: string,
    @Param('id') employmentId: string,
    @Param('certificateId') certificateId: string,
  ) {
    return this.employment.getCertificateUrl(
      userId,
      employmentId,
      certificateId,
    );
  }
}
