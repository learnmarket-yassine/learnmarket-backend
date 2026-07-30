import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SparksService } from '../services/sparks.service';
import { GetSparksHistoryQueryDto } from '../dto/get-sparks-history-query.dto';
import { CreatePurchaseIntentDto } from '../dto/create-purchase-intent.dto';

@Controller('sparks')
@UseGuards(RolesGuard)
@Roles(UserRole.TUTOR)
export class SparksController {
  constructor(private readonly sparks: SparksService) {}

  @Get('offers')
  listActiveOffers() {
    return this.sparks.listActiveOffers();
  }

  @Get('balance')
  getBalance(@CurrentUser('id') tutorId: string) {
    return this.sparks.getBalance(tutorId);
  }

  @Get('history')
  getHistory(
    @CurrentUser('id') tutorId: string,
    @Query() query: GetSparksHistoryQueryDto,
  ) {
    return this.sparks.getHistory(tutorId, query.page, query.take, query.sortDir);
  }

  @Post('purchase-intent')
  createPurchaseIntent(
    @CurrentUser('id') tutorId: string,
    @Body() dto: CreatePurchaseIntentDto,
  ) {
    return this.sparks.createSparksPurchaseIntent(tutorId, dto.offerId);
  }
}
