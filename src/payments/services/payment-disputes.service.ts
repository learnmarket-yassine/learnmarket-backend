import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ListDisputesQueryDto } from '../dto/list-disputes-query.dto';

const DISPUTE_DETAIL_INCLUDE = {
  payment: {
    select: {
      id: true,
      proposalId: true,
      learnerId: true,
      amount: true,
      currency: true,
      stripePaymentIntentId: true,
    },
  },
} as const;

@Injectable()
export class PaymentDisputesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListDisputesQueryDto) {
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.paymentDispute.findMany({
        skip: query.page * query.take,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: DISPUTE_DETAIL_INCLUDE,
      }),
      this.prisma.paymentDispute.count(),
    ]);
    return { paginatedResult: items, totalCount };
  }

  async detail(id: string) {
    const dispute = await this.prisma.paymentDispute.findUnique({
      where: { id },
      include: DISPUTE_DETAIL_INCLUDE,
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    return dispute;
  }
}
