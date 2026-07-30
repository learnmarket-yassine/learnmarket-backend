import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SearchTransactionsQueryDto } from '../dto/search-transactions-query.dto';
import { PaymentsService } from '../services/payments.service';

@Controller('admin/transactions')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminTransactionsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  search(@Query() query: SearchTransactionsQueryDto) {
    return this.payments.searchTransactions(query);
  }
}
