import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SparksTransactionType } from '@prisma/client';
import type Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../payments/services/stripe.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { SparksService } from './sparks.service';

// Matches the default seeded by the platform_settings migration -- this
// spec exercises the real PlatformSettingsService against the real DB
// rather than mocking the Sparks cost.
const PROPOSAL_SPARKS_COST = 4;

describe('SparksService (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let sparks: SparksService;
  let createSparksPaymentIntent: jest.Mock;

  let tutorId: string;
  let learnerId: string;
  let categoryId: string;
  let learnRequestId: string;

  beforeAll(async () => {
    createSparksPaymentIntent = jest.fn();
    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        SparksService,
        PlatformSettingsService,
        {
          provide: StripeService,
          useValue: { createSparksPaymentIntent },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    sparks = moduleRef.get(SparksService);
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [tutor, learner, category] = await Promise.all([
      prisma.user.create({
        data: {
          email: `tutor-${suffix}@test.local`,
          password: 'x',
          firstname: 'T',
          lastname: 'Tutor',
          role: 'TUTOR',
        },
      }),
      prisma.user.create({
        data: {
          email: `learner-${suffix}@test.local`,
          password: 'x',
          firstname: 'L',
          lastname: 'Learner',
          role: 'LEARNER',
        },
      }),
      prisma.category.create({
        data: { name: `Category ${suffix}`, slug: `category-${suffix}` },
      }),
    ]);
    tutorId = tutor.id;
    learnerId = learner.id;
    categoryId = category.id;
    await prisma.tutorProfile.create({ data: { userId: tutorId } });

    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'ONE_TIME',
        title: 'Request',
        status: 'OPEN',
        categoryId,
      },
    });
    learnRequestId = learnRequest.id;
    createSparksPaymentIntent.mockReset();
  });

  afterEach(async () => {
    await prisma.learnRequest.deleteMany({ where: { id: learnRequestId } });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, learnerId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  async function setBalance(amount: number) {
    await prisma.tutorProfile.update({
      where: { userId: tutorId },
      data: { sparksBalance: amount },
    });
  }

  async function balanceOf(id: string) {
    const profile = await prisma.tutorProfile.findUniqueOrThrow({
      where: { userId: id },
    });
    return profile.sparksBalance;
  }

  async function createProposal(): Promise<string> {
    const proposal = await prisma.proposal.create({
      data: {
        learnRequestId,
        tutorId,
        sessionDurationMinutes: 60,
        totalPrice: 100,
      },
    });
    return proposal.id;
  }

  describe('spendSparksForProposal', () => {
    it('deducts exactly PROPOSAL_SPARKS_COST and logs one PROPOSAL_SPEND transaction', async () => {
      await setBalance(10);
      const proposalId = await createProposal();

      await prisma.$transaction((tx) =>
        sparks.spendSparksForProposal(tx, tutorId, proposalId),
      );

      expect(await balanceOf(tutorId)).toBe(10 - PROPOSAL_SPARKS_COST);

      const transactions = await prisma.sparksTransaction.findMany({
        where: { tutorId, type: SparksTransactionType.PROPOSAL_SPEND },
      });
      expect(transactions).toHaveLength(1);
      expect(transactions[0].amount).toBe(-PROPOSAL_SPARKS_COST);
      expect(transactions[0].balanceAfter).toBe(10 - PROPOSAL_SPARKS_COST);
      expect(transactions[0].proposalId).toBe(proposalId);
    });

    it('rejects cleanly with no partial deduction when the balance is insufficient', async () => {
      await setBalance(PROPOSAL_SPARKS_COST - 1);
      const proposalId = await createProposal();

      await expect(
        prisma.$transaction((tx) =>
          sparks.spendSparksForProposal(tx, tutorId, proposalId),
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(await balanceOf(tutorId)).toBe(PROPOSAL_SPARKS_COST - 1);
      const transactions = await prisma.sparksTransaction.findMany({
        where: { tutorId },
      });
      expect(transactions).toHaveLength(0);
    });

    it('race condition: two concurrent spends against a balance that covers exactly one both attempt, but only one succeeds and the balance never goes negative', async () => {
      await setBalance(PROPOSAL_SPARKS_COST);
      const [proposalA, proposalB] = await Promise.all([
        createProposal(),
        createProposal(),
      ]);

      const attempt = (proposalId: string) =>
        prisma
          .$transaction((tx) =>
            sparks.spendSparksForProposal(tx, tutorId, proposalId),
          )
          .then(() => 'succeeded' as const)
          .catch((error) => {
            if (error instanceof ConflictException) return 'rejected' as const;
            throw error;
          });

      const results = await Promise.all([
        attempt(proposalA),
        attempt(proposalB),
      ]);

      expect(results.filter((r) => r === 'succeeded')).toHaveLength(1);
      expect(results.filter((r) => r === 'rejected')).toHaveLength(1);

      const finalBalance = await balanceOf(tutorId);
      expect(finalBalance).toBe(0);
      expect(finalBalance).toBeGreaterThanOrEqual(0);

      const transactions = await prisma.sparksTransaction.findMany({
        where: { tutorId, type: SparksTransactionType.PROPOSAL_SPEND },
      });
      expect(transactions).toHaveLength(1);
    });
  });

  describe('refundSparksForProposal', () => {
    it('refunds exactly the previously spent amount and logs a REFUND transaction', async () => {
      await setBalance(10);
      const proposalId = await createProposal();
      await prisma.$transaction((tx) =>
        sparks.spendSparksForProposal(tx, tutorId, proposalId),
      );
      expect(await balanceOf(tutorId)).toBe(10 - PROPOSAL_SPARKS_COST);

      await prisma.$transaction((tx) =>
        sparks.refundSparksForProposal(tx, proposalId),
      );

      expect(await balanceOf(tutorId)).toBe(10);
      const refunds = await prisma.sparksTransaction.findMany({
        where: { tutorId, type: SparksTransactionType.REFUND },
      });
      expect(refunds).toHaveLength(1);
      expect(refunds[0].amount).toBe(PROPOSAL_SPARKS_COST);
      expect(refunds[0].proposalId).toBe(proposalId);
    });

    it('is a no-op when nothing was ever spent for that proposal (e.g. a DECLINED proposal never refunds)', async () => {
      await setBalance(10);

      await prisma.$transaction((tx) =>
        sparks.refundSparksForProposal(tx, 'never-spent-proposal'),
      );

      expect(await balanceOf(tutorId)).toBe(10);
      const transactions = await prisma.sparksTransaction.findMany({
        where: { tutorId },
      });
      expect(transactions).toHaveLength(0);
    });
  });

  describe('offer CRUD', () => {
    it('listActiveOffers excludes offers deactivated via setOfferActive, listAllOffers still includes them', async () => {
      const offer = await sparks.createOffer({
        name: 'Starter',
        sparksAmount: 20,
        priceCents: 999,
      });

      await sparks.setOfferActive(offer.id, false);

      const active = await sparks.listActiveOffers();
      expect(active.find((o) => o.id === offer.id)).toBeUndefined();

      const all = await sparks.listAllOffers();
      expect(all.find((o) => o.id === offer.id)).toBeDefined();

      await prisma.sparksOffer.delete({ where: { id: offer.id } });
    });
  });

  describe('purchase flow', () => {
    it('createSparksPurchaseIntent rejects a nonexistent offerId', async () => {
      await expect(
        sparks.createSparksPurchaseIntent(tutorId, 'does-not-exist'),
      ).rejects.toThrow('This offer is no longer available');
    });

    it('createSparksPurchaseIntent rejects a deactivated offer', async () => {
      const offer = await sparks.createOffer({
        name: 'Retired',
        sparksAmount: 20,
        priceCents: 999,
      });
      await sparks.setOfferActive(offer.id, false);

      await expect(
        sparks.createSparksPurchaseIntent(tutorId, offer.id),
      ).rejects.toThrow('This offer is no longer available');

      await prisma.sparksOffer.delete({ where: { id: offer.id } });
    });

    it('createSparksPurchaseIntent uses the offer real current price, not a fallback', async () => {
      const offer = await sparks.createOffer({
        name: 'Pro',
        sparksAmount: 50,
        priceCents: 2499,
      });
      createSparksPaymentIntent.mockResolvedValue({
        id: 'pi_test',
        client_secret: 'secret_test',
      });

      const intent = await sparks.createSparksPurchaseIntent(tutorId, offer.id);

      expect(intent.amount).toBe(2499);
      expect(intent.currency).toBe('usd');
      expect(intent.paymentIntentId).toBe('pi_test');
      expect(intent.clientSecret).toBe('secret_test');
      expect(createSparksPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ id: offer.id, priceCents: 2499 }),
        tutorId,
      );

      await prisma.sparksOffer.delete({ where: { id: offer.id } });
    });

    it('fulfillSparksPurchase snapshots pricePaidCents from the PaymentIntent, unaffected by later offer price changes', async () => {
      const offer = await sparks.createOffer({
        name: 'Snapshot Test',
        sparksAmount: 30,
        priceCents: 1500,
      });

      const paymentIntent = {
        id: 'pi_snapshot_test',
        amount: 1500,
        metadata: {
          tutorId,
          offerId: offer.id,
          sparksAmount: '30',
        },
      } as unknown as Stripe.PaymentIntent;

      await prisma.$transaction((tx) =>
        sparks.fulfillSparksPurchase(tx, paymentIntent),
      );

      // Admin changes the offer's price after the purchase.
      await sparks.updateOffer(offer.id, { priceCents: 9999 });

      const transaction = await prisma.sparksTransaction.findUniqueOrThrow({
        where: { stripePaymentIntentId: 'pi_snapshot_test' },
      });
      expect(transaction.pricePaidCents).toBe(1500); // unchanged by the price edit
      expect(await balanceOf(tutorId)).toBe(30);

      await prisma.sparksOffer.delete({ where: { id: offer.id } });
    });

    it('fulfillSparksPurchase is idempotent for the same stripePaymentIntentId', async () => {
      const offer = await sparks.createOffer({
        name: 'Idempotency Test',
        sparksAmount: 15,
        priceCents: 500,
      });
      const paymentIntent = {
        id: 'pi_idempotent_test',
        amount: 500,
        metadata: { tutorId, offerId: offer.id, sparksAmount: '15' },
      } as unknown as Stripe.PaymentIntent;

      await prisma.$transaction((tx) =>
        sparks.fulfillSparksPurchase(tx, paymentIntent),
      );
      await prisma.$transaction((tx) =>
        sparks.fulfillSparksPurchase(tx, paymentIntent),
      );

      expect(await balanceOf(tutorId)).toBe(15);
      const transactions = await prisma.sparksTransaction.findMany({
        where: { stripePaymentIntentId: 'pi_idempotent_test' },
      });
      expect(transactions).toHaveLength(1);

      await prisma.sparksOffer.delete({ where: { id: offer.id } });
    });
  });

  it('sparksBalance always equals the sum of SparksTransaction.amount after a mix of grants, purchases, spends and refunds', async () => {
    await setBalance(0);

    // MONTHLY_GRANT
    await prisma.$transaction(async (tx) => {
      const updated = await tx.tutorProfile.update({
        where: { userId: tutorId },
        data: { sparksBalance: { increment: 10 } },
      });
      await tx.sparksTransaction.create({
        data: {
          tutorId,
          type: SparksTransactionType.MONTHLY_GRANT,
          amount: 10,
          balanceAfter: updated.sparksBalance,
        },
      });
    });

    // PROPOSAL_SPEND
    const proposalId = await createProposal();
    await prisma.$transaction((tx) =>
      sparks.spendSparksForProposal(tx, tutorId, proposalId),
    );

    // REFUND
    await prisma.$transaction((tx) =>
      sparks.refundSparksForProposal(tx, proposalId),
    );

    // PURCHASE
    const offer = await sparks.createOffer({
      name: 'Invariant Offer',
      sparksAmount: 25,
      priceCents: 1200,
    });
    await prisma.$transaction((tx) =>
      sparks.fulfillSparksPurchase(tx, {
        id: 'pi_invariant',
        amount: 1200,
        metadata: { tutorId, offerId: offer.id, sparksAmount: '25' },
      } as unknown as Stripe.PaymentIntent),
    );

    const balance = await balanceOf(tutorId);
    const transactions = await prisma.sparksTransaction.findMany({
      where: { tutorId },
    });
    const sum = transactions.reduce((total, t) => total + t.amount, 0);
    expect(balance).toBe(sum);

    await prisma.sparksOffer.delete({ where: { id: offer.id } });
  });
});
