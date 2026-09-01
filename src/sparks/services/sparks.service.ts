import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SparksTransactionType, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../payments/services/stripe.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { CreateSparksOfferDto } from '../dto/create-sparks-offer.dto';
import { UpdateSparksOfferDto } from '../dto/update-sparks-offer.dto';
import { GetSparksOffersQueryDto } from '../dto/get-sparks-offers';

@Injectable()
export class SparksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async spendSparksForProposal(
    tx: Prisma.TransactionClient,
    tutorId: string,
    proposalId: string,
  ): Promise<void> {
    const { proposalSparksCost } = await this.platformSettings.getSettings();
    const result = await tx.tutorProfile.updateMany({
      where: {
        userId: tutorId,
        sparksBalance: { gte: proposalSparksCost },
      },
      data: { sparksBalance: { decrement: proposalSparksCost } },
    });
    if (result.count === 0) {
      throw new ConflictException(
        `You need at least ${proposalSparksCost} Sparks to send a proposal. Purchase more from your profile.`,
      );
    }
    const updated = await tx.tutorProfile.findUniqueOrThrow({
      where: { userId: tutorId },
    });
    await tx.sparksTransaction.create({
      data: {
        tutorId,
        type: SparksTransactionType.PROPOSAL_SPEND,
        amount: -proposalSparksCost,
        balanceAfter: updated.sparksBalance,
        proposalId,
      },
    });
  }

  async refundSparksForProposal(
    tx: Prisma.TransactionClient,
    proposalId: string,
  ): Promise<void> {
    const spendTx = await tx.sparksTransaction.findFirst({
      where: { proposalId, type: SparksTransactionType.PROPOSAL_SPEND },
    });
    if (!spendTx) return;

    const refundAmount = Math.abs(spendTx.amount);
    const updated = await tx.tutorProfile.update({
      where: { userId: spendTx.tutorId },
      data: { sparksBalance: { increment: refundAmount } },
    });
    await tx.sparksTransaction.create({
      data: {
        tutorId: spendTx.tutorId,
        type: SparksTransactionType.REFUND,
        amount: refundAmount,
        balanceAfter: updated.sparksBalance,
        proposalId,
      },
    });
  }

  async createOffer(dto: CreateSparksOfferDto) {
    return this.prisma.sparksOffer.create({
      data: {
        name: dto.name,
        sparksAmount: dto.sparksAmount,
        priceCents: dto.priceCents,
        currency: dto.currency,
        displayOrder: dto.displayOrder,
      },
    });
  }

  async listAllOffers(query: GetSparksOffersQueryDto) {
    const where: Prisma.SparksOfferWhereInput = {
      isActive: true,
    };

    if (query.name?.trim()) {
      where.name = {
        contains: query.name.trim(),
        mode: 'insensitive',
      };
    }
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.sparksOffer.findMany({
        where,
        orderBy: {
          createdAt: query.sortDir ?? 'desc',
        },
        skip: query.page * query.take,
        take: query.take,
      }),

      this.prisma.sparksOffer.count({
        where,
      }),
    ]);

    return {
      paginatedResult: items,
      totalCount,
    };
  }

  async listActiveOffers() {
    return this.prisma.sparksOffer.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async updateOffer(id: string, dto: UpdateSparksOfferDto) {
    await this.assertOfferExists(id);
    return this.prisma.sparksOffer.update({ where: { id }, data: dto });
  }

  async setOfferActive(id: string, isActive: boolean) {
    await this.assertOfferExists(id);
    return this.prisma.sparksOffer.update({
      where: { id },
      data: { isActive },
    });
  }

  private async assertOfferExists(id: string): Promise<void> {
    const offer = await this.prisma.sparksOffer.findUnique({
      where: { id },
    });
    if (!offer) throw new NotFoundException('Sparks offer not found');
  }

  async getBalance(tutorId: string) {
    const profile = await this.prisma.tutorProfile.findUniqueOrThrow({
      where: { userId: tutorId },
      select: { sparksBalance: true },
    });
    return { sparksBalance: profile.sparksBalance };
  }

  async getHistory(
    tutorId: string,
    page: number,
    take: number,
    sortDir?: 'asc' | 'desc',
  ) {
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.sparksTransaction.findMany({
        where: { tutorId },
        orderBy: { createdAt: sortDir ?? 'desc' },
        skip: page * take,
        take,
      }),
      this.prisma.sparksTransaction.count({ where: { tutorId } }),
    ]);
    return { paginatedResult: items, totalCount };
  }

  async createSparksPurchaseIntent(tutorId: string, offerId: string) {
    const offer = await this.prisma.sparksOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer || !offer.isActive) {
      throw new BadRequestException('This offer is no longer available');
    }

    const paymentIntent = await this.stripeService.createSparksPaymentIntent(
      offer,
      tutorId,
    );

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: offer.priceCents,
      currency: offer.currency,
    };
  }

  async fulfillSparksPurchase(
    tx: Prisma.TransactionClient,
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    const existing = await tx.sparksTransaction.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    });
    if (existing) return;

    const { tutorId, offerId } = paymentIntent.metadata;
    const sparksAmount = Number(paymentIntent.metadata.sparksAmount);

    const updated = await tx.tutorProfile.update({
      where: { userId: tutorId },
      data: { sparksBalance: { increment: sparksAmount } },
    });
    await tx.sparksTransaction.create({
      data: {
        tutorId,
        type: SparksTransactionType.PURCHASE,
        amount: sparksAmount,
        balanceAfter: updated.sparksBalance,
        stripePaymentIntentId: paymentIntent.id,
        offerId,
        pricePaidCents: paymentIntent.amount,
      },
    });
  }
}
