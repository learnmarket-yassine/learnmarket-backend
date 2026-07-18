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
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateProposalDto } from '../dto/create-proposal.dto';
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

  @Post('proposals/:id/accept')
  @Roles(UserRole.LEARNER)
  accept(@CurrentUser('id') learnerId: string, @Param('id') id: string) {
    return this.proposals.accept(learnerId, id);
  }
}
