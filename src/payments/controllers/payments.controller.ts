import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaymentsService } from '../services/payments.service';
import { TutorConnectService } from '../services/tutor-connect.service';
import { CancelProposalDto } from '../dto/cancel-proposal.dto';

@Controller()
@UseGuards(RolesGuard)
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly tutorConnect: TutorConnectService,
  ) {}

  @Post('proposals/:id/checkout')
  @Roles(UserRole.LEARNER)
  @HttpCode(HttpStatus.CREATED)
  checkout(@CurrentUser('id') learnerId: string, @Param('id') id: string) {
    return this.payments.createPaymentIntentForProposal(learnerId, id);
  }

  @Post('payments/connect/onboarding-link')
  @Roles(UserRole.TUTOR)
  getOnboardingLink(@CurrentUser('id') tutorId: string) {
    return this.tutorConnect.getOnboardingLink(tutorId);
  }

  @Post('proposals/:id/cancel')
  @Roles(UserRole.LEARNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(
    @CurrentUser('id') learnerId: string,
    @Param('id') id: string,
    @Body() dto: CancelProposalDto,
  ) {
    return this.payments.cancelProposal(learnerId, id, dto.reason);
  }
}
