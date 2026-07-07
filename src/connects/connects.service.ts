import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectsTransactionType, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { InsufficientConnectsException } from './exceptions/insufficient-connects.exception';
import { DEFAULT_CONNECTS_SIGNUP_GRANT } from './connects.constants';

@Injectable()
export class ConnectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  async getBalance(userId: string) {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { userId },
      select: { connects: true },
    });
    if (!profile) throw new NotFoundException('Tutor profile not found');
    return { connects: profile.connects };
  }

  async getTransactions(userId: string, page = 1, limit = 20) {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Tutor profile not found');

    const [items, total] = await Promise.all([
      this.prisma.connectsTransaction.findMany({
        where: { tutorId: profile.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.connectsTransaction.count({ where: { tutorId: profile.id } }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async listPackages() {
    return this.prisma.connectsPackage.findMany({
      where: { isActive: true },
      orderBy: { priceCents: 'asc' },
    });
  }

  async createCheckoutSession(userId: string, packageId: string) {
    const pkg = await this.prisma.connectsPackage.findUnique({
      where: { id: packageId },
    });
    if (!pkg || !pkg.isActive) {
      throw new NotFoundException('Connects package not found');
    }

    const session = await this.stripe.createCheckoutSession(pkg, userId);
    return { url: session.url };
  }

  /** Grants free starter connects when a TutorProfile is created. Must run inside the same transaction that creates the profile, so a crash between the two never leaves it un-granted. */
  async grantSignupBonus(tx: Prisma.TransactionClient, tutorProfileId: string) {
    const amount = Number(
      this.config.get<string>('CONNECTS_SIGNUP_GRANT') ??
        DEFAULT_CONNECTS_SIGNUP_GRANT,
    );

    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { connects: { increment: amount } },
    });

    await tx.connectsTransaction.create({
      data: {
        tutorId: tutorProfileId,
        type: ConnectsTransactionType.SIGNUP_GRANT,
        amount,
        balanceAfter: updated.connects,
      },
    });
  }

  /**
   * Decrements connects for a proposal submission. The WHERE-guarded
   * updateMany makes the check-and-decrement atomic at the row level, so
   * concurrent submissions can't both pass a balance check that's already
   * stale by the time either writes.
   */
  async spend(
    tx: Prisma.TransactionClient,
    tutorId: string,
    amount: number,
    meta: { relatedProposalId?: string } = {},
  ) {
    const result = await tx.tutorProfile.updateMany({
      where: { id: tutorId, connects: { gte: amount } },
      data: { connects: { decrement: amount } },
    });

    const profile = await tx.tutorProfile.findUniqueOrThrow({
      where: { id: tutorId },
      select: { connects: true },
    });

    if (result.count === 0) {
      throw new InsufficientConnectsException(amount, profile.connects);
    }

    await tx.connectsTransaction.create({
      data: {
        tutorId,
        type: ConnectsTransactionType.SPEND,
        amount: -amount,
        balanceAfter: profile.connects,
        relatedProposalId: meta.relatedProposalId,
      },
    });

    return profile.connects;
  }

  /**
   * Not called automatically on withdraw/decline (matches Upwork's model).
   * Reserved for an admin action on disputes/edge cases.
   */
  async refundConnects(proposalId: string) {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.findUnique({
        where: { id: proposalId },
      });
      if (!proposal) throw new NotFoundException('Proposal not found');

      const alreadyRefunded = await tx.connectsTransaction.findFirst({
        where: {
          relatedProposalId: proposalId,
          type: ConnectsTransactionType.REFUND,
        },
      });
      if (alreadyRefunded) {
        throw new ConflictException('Proposal already refunded');
      }

      const spendEntry = await tx.connectsTransaction.findFirst({
        where: {
          relatedProposalId: proposalId,
          type: ConnectsTransactionType.SPEND,
        },
      });
      if (!spendEntry) {
        throw new NotFoundException(
          'No spend transaction found for this proposal',
        );
      }

      const amount = Math.abs(spendEntry.amount);
      const updated = await tx.tutorProfile.update({
        where: { id: proposal.tutorId },
        data: { connects: { increment: amount } },
      });

      await tx.connectsTransaction.create({
        data: {
          tutorId: proposal.tutorId,
          type: ConnectsTransactionType.REFUND,
          amount,
          balanceAfter: updated.connects,
          relatedProposalId: proposalId,
        },
      });

      return { refunded: amount, balance: updated.connects };
    });
  }

  /**
   * Stripe fires both checkout.session.completed and payment_intent.succeeded
   * for the same purchase; both carry the same metadata (see
   * StripeService.createCheckoutSession's payment_intent_data). Whichever
   * arrives, we credit against the payment intent id and rely on its unique
   * constraint on ConnectsTransaction to make double delivery a no-op.
   */
  async handleStripeEvent(event: Stripe.Event) {
    let paymentIntentId: string | undefined;
    let metadata: Stripe.Metadata | null | undefined;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;
      metadata = session.metadata;
    } else if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      paymentIntentId = intent.id;
      metadata = intent.metadata;
    } else {
      return;
    }

    const tutorUserId = metadata?.tutorUserId;
    const packageId = metadata?.packageId;
    if (!paymentIntentId || !tutorUserId || !packageId) return;

    await this.creditPurchase(paymentIntentId, tutorUserId, packageId);
  }

  private async creditPurchase(
    paymentIntentId: string,
    tutorUserId: string,
    packageId: string,
  ) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const [profile, pkg] = await Promise.all([
          tx.tutorProfile.findUnique({
            where: { userId: tutorUserId },
            select: { id: true },
          }),
          tx.connectsPackage.findUnique({ where: { id: packageId } }),
        ]);
        if (!profile || !pkg) return;

        const updated = await tx.tutorProfile.update({
          where: { id: profile.id },
          data: { connects: { increment: pkg.amount } },
        });

        await tx.connectsTransaction.create({
          data: {
            tutorId: profile.id,
            type: ConnectsTransactionType.PURCHASE,
            amount: pkg.amount,
            balanceAfter: updated.connects,
            relatedPackageId: pkg.id,
            stripePaymentIntentId: paymentIntentId,
          },
        });
      });
    } catch (error) {
      // Unique constraint on stripePaymentIntentId — already credited by a
      // prior delivery of this event. Safe to ignore.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }
}
