import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ListDisputesQueryDto } from '../dto/list-disputes-query.dto';
import { PaymentDisputesService } from '../services/payment-disputes.service';

@Controller('admin/payment-disputes')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPaymentDisputesController {
  constructor(private readonly disputes: PaymentDisputesService) {}

  @Get()
  list(@Query() query: ListDisputesQueryDto) {
    return this.disputes.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.disputes.detail(id);
  }
}
