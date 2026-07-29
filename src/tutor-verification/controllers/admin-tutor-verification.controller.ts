import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CertificationService } from '../../tutor/services/certification.service';
import { TutorVerificationService } from '../services/tutor-verification.service';
import { ListVerificationsQueryDto } from '../dto/list-verifications-query.dto';
import { ReviewDecisionDto } from '../dto/review-decision.dto';

@Controller('admin/tutor-verifications')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminTutorVerificationController {
  constructor(
    private readonly verification: TutorVerificationService,
    private readonly certification: CertificationService,
  ) {}

  @Get()
  list(@Query() query: ListVerificationsQueryDto) {
    return this.verification.listPendingVerifications(query);
  }

  @Get(':tutorId')
  detail(@Param('tutorId') tutorId: string) {
    return this.verification.getVerificationDetail(tutorId);
  }

  @Get(':tutorId/certifications/:certId/files/:fileId/url')
  getCertificationFileUrl(
    @Param('certId') certId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.certification.getFileUrlForAdmin(certId, fileId);
  }

  @Post(':tutorId/approve')
  approve(
    @CurrentUser('id') adminId: string,
    @Param('tutorId') tutorId: string,
  ) {
    return this.verification.approve(adminId, tutorId);
  }

  @Post(':tutorId/reject')
  reject(
    @CurrentUser('id') adminId: string,
    @Param('tutorId') tutorId: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.verification.reject(adminId, tutorId, dto.reason);
  }

  @Post(':tutorId/revoke')
  revoke(
    @CurrentUser('id') adminId: string,
    @Param('tutorId') tutorId: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.verification.revoke(adminId, tutorId, dto.reason);
  }
}
