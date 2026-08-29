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
import { DisputeOutcome, UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SessionsService } from '../services/sessions.service';
import { ListSessionDisputesQueryDto } from '../dto/list-session-disputes-query.dto';
import { ResolveSessionDisputeDto } from '../dto/resolve-session-dispute.dto';

@Controller('admin/session-disputes')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSessionDisputesController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@Query() query: ListSessionDisputesQueryDto) {
    return this.sessions.listDisputedSessions(query);
  }

  @Get(':sessionId')
  detail(@Param('sessionId') sessionId: string) {
    return this.sessions.getDisputeDetail(sessionId);
  }

  @Post(':sessionId/refund')
  @HttpCode(HttpStatus.OK)
  refund(
    @Param('sessionId') sessionId: string,
    @Body() dto: ResolveSessionDisputeDto,
  ) {
    return this.sessions.resolveDispute(
      sessionId,
      DisputeOutcome.REFUNDED,
      dto.note,
    );
  }

  @Post(':sessionId/release')
  @HttpCode(HttpStatus.OK)
  release(
    @Param('sessionId') sessionId: string,
    @Body() dto: ResolveSessionDisputeDto,
  ) {
    return this.sessions.resolveDispute(
      sessionId,
      DisputeOutcome.RELEASED,
      dto.note,
    );
  }
}
