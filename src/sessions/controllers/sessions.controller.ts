import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  type AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SessionsService } from '../services/sessions.service';
import { SubmitSessionSummaryDto } from '../dto/submit-session-summary.dto';
import { DisputeSessionDto } from '../dto/dispute-session.dto';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post(':id/meeting/retry')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TUTOR)
  retryMeeting(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.sessions.retryMeeting(userId, id);
  }

  @Get(':id')
  getContext(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @CurrentUser() viewer: AuthUser,
  ) {
    return this.sessions.getSessionContext(userId, id, viewer);
  }

  @Get(':id/meeting')
  getMeeting(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.sessions.getMeetingDetails(userId, id);
  }

  // --- Parallel confirmation gate --------------------------------------

  @Post(':id/summary')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TUTOR)
  submitSummary(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SubmitSessionSummaryDto,
  ) {
    return this.sessions.submitSessionSummary(userId, id, dto.summary);
  }

  @Post(':id/confirm')
  @UseGuards(RolesGuard)
  @Roles(UserRole.LEARNER)
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.sessions.confirmSession(userId, id);
  }

  @Post(':id/dispute')
  @UseGuards(RolesGuard)
  @Roles(UserRole.LEARNER)
  dispute(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: DisputeSessionDto,
  ) {
    return this.sessions.disputeSession(userId, id, dto.reason);
  }
}
