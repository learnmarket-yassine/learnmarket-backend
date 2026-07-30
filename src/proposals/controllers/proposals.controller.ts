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
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateProposalDto } from '../dto/create-proposal.dto';
import { GetMyProposalsQueryDto } from '../dto/get-my-proposals-query.dto';
import { UpdateProposalDto } from '../dto/update-proposal.dto';
import { ProposalsService } from '../services/proposals.service';

@Controller()
@UseGuards(RolesGuard)
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Post('learn-requests/:learnRequestId/proposals')
  @Roles(UserRole.TUTOR)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser('id') tutorId: string,
    @Param('learnRequestId') learnRequestId: string,
    @Body() dto: CreateProposalDto,
  ) {
    return this.proposals.create(tutorId, learnRequestId, dto);
  }

  @Get('proposals')
  findAllForViewer(@CurrentUser() viewer: AuthUser) {
    return this.proposals.findAllForViewer(viewer);
  }

  // Must stay registered before 'proposals/:id' -- otherwise Nest matches
  // the literal segment "mine" as the :id param instead.
  @Get('proposals/mine')
  @Roles(UserRole.TUTOR)
  findMyProposals(
    @CurrentUser('id') tutorId: string,
    @Query() query: GetMyProposalsQueryDto,
  ) {
    return this.proposals.findMyProposals(tutorId, query);
  }

  @Get('proposals/:id')
  findOne(@CurrentUser() viewer: AuthUser, @Param('id') id: string) {
    return this.proposals.findOneForViewer(viewer, id);
  }

  @Patch('proposals/:id')
  @Roles(UserRole.TUTOR)
  update(
    @CurrentUser('id') tutorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProposalDto,
  ) {
    return this.proposals.update(tutorId, id, dto);
  }

  @Delete('proposals/:id')
  @Roles(UserRole.TUTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') tutorId: string, @Param('id') id: string) {
    return this.proposals.remove(tutorId, id);
  }

  @Post('proposals/:id/withdraw')
  @Roles(UserRole.TUTOR)
  withdraw(@CurrentUser('id') tutorId: string, @Param('id') id: string) {
    return this.proposals.withdraw(tutorId, id);
  }

  // Hiring a tutor now requires a successful Stripe payment before the
  // proposal is accepted -- see PaymentsController's
  // `POST proposals/:id/checkout`. Acceptance itself only ever happens via
  // the payment_intent.succeeded webhook (ProposalsService.runAcceptTransaction).
}
