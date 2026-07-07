import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProposalsService } from './proposals.service';
import { CreateProposalDto } from './dto/create-proposal.dto';

@Controller()
@UseGuards(RolesGuard)
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Roles(UserRole.TUTOR)
  @Post('annonces/:annonceId/proposals')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser('id') userId: string,
    @Param('annonceId') annonceId: string,
    @Body() dto: CreateProposalDto,
  ) {
    return this.proposals.create(userId, annonceId, dto);
  }

  @Roles(UserRole.TUTOR)
  @Get('proposals/me')
  findMine(@CurrentUser('id') userId: string) {
    return this.proposals.findMine(userId);
  }

  @Roles(UserRole.TUTOR)
  @Patch('proposals/:id/withdraw')
  withdraw(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.proposals.withdraw(userId, id);
  }

  @Roles(UserRole.LEARNER)
  @Patch('proposals/:id/decline')
  decline(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.proposals.decline(userId, id);
  }
}
