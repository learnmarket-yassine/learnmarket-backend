import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaymentsService } from '../services/payments.service';
import { PayoutsService } from '../services/payouts.service';
import { TutorConnectService } from '../services/tutor-connect.service';
import { CancelProposalDto } from '../dto/cancel-proposal.dto';
import { GetMyPaymentsQueryDto } from '../dto/get-my-payments-query.dto';
import { GetMyPayoutsQueryDto } from '../dto/get-my-payouts-query.dto';

@Controller()
@UseGuards(RolesGuard)
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly payouts: PayoutsService,
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

  @Get('payments/mine')
  @Roles(UserRole.LEARNER)
  getMyPayments(
    @CurrentUser('id') learnerId: string,
    @Query() query: GetMyPaymentsQueryDto,
  ) {
    return this.payments.getMyPayments(learnerId, query);
  }

  @Get('payouts/mine')
  @Roles(UserRole.TUTOR)
  getMyPayouts(
    @CurrentUser('id') tutorId: string,
    @Query() query: GetMyPayoutsQueryDto,
  ) {
    return this.payouts.getMyPayouts(tutorId, query);
  }
}
