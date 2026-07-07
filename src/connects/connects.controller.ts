import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ConnectsService } from './connects.service';
import { TransactionsQueryDto } from './dto/transactions-query.dto';
import { PurchaseConnectsDto } from './dto/purchase-connects.dto';

@Controller('connects')
@UseGuards(RolesGuard)
export class ConnectsController {
  constructor(private readonly connects: ConnectsService) {}

  @Public()
  @Get('packages')
  listPackages() {
    return this.connects.listPackages();
  }

  @Roles(UserRole.TUTOR)
  @Get('balance')
  getBalance(@CurrentUser('id') userId: string) {
    return this.connects.getBalance(userId);
  }

  @Roles(UserRole.TUTOR)
  @Get('transactions')
  getTransactions(
    @CurrentUser('id') userId: string,
    @Query() query: TransactionsQueryDto,
  ) {
    return this.connects.getTransactions(userId, query.page, query.limit);
  }

  @Roles(UserRole.TUTOR)
  @Post('purchase')
  purchase(
    @CurrentUser('id') userId: string,
    @Body() dto: PurchaseConnectsDto,
  ) {
    return this.connects.createCheckoutSession(userId, dto.packageId);
  }

  /** Not exposed to tutors — connects aren't auto-refunded on withdraw/decline (matches Upwork's model). This is for admin dispute resolution. */
  @Roles(UserRole.ADMIN)
  @Post('admin/refund/:proposalId')
  refund(@Param('proposalId') proposalId: string) {
    return this.connects.refundConnects(proposalId);
  }
}
