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
import { CertificationService } from '../services/certification.service';
import { CreateCertificationDto } from '../dto/certification/create-certification.dto';
import { UpdateCertificationDto } from '../dto/certification/update-certification.dto';
import { AttachFileDto } from '../../storage/dto/attach-file.dto';

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

  @Post(':id/files')
  @HttpCode(HttpStatus.CREATED)
  addFile(
    @CurrentUser('id') userId: string,
    @Param('id') certId: string,
    @Body() dto: AttachFileDto,
  ) {
    return this.certification.addFile(
      userId,
      certId,
      dto.key,
      dto.fileName,
      dto.mimeType,
    );
  }

  @Delete(':id/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFile(
    @CurrentUser('id') userId: string,
    @Param('id') certId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.certification.removeFile(userId, certId, fileId);
  }

  @Get(':id/files/:fileId/url')
  getFileUrl(
    @CurrentUser('id') userId: string,
    @Param('id') certId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.certification.getFileUrl(userId, certId, fileId);
  }
}
