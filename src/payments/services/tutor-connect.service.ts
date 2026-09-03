import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe.service';

@Injectable()
export class TutorConnectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  async getOnboardingLink(tutorId: string): Promise<{ url: string }> {
    const tutorProfile = await this.prisma.tutorProfile.findUnique({
      where: { userId: tutorId },
    });

    let stripeAccountId = tutorProfile?.stripeAccountId;
    if (!stripeAccountId) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: tutorId },
        select: { email: true },
      });
      const account = await this.stripe.createConnectedAccount(
        tutorId,
        user.email,
      );
      stripeAccountId = account.id;
      await this.prisma.tutorProfile.upsert({
        where: { userId: tutorId },
        create: { userId: tutorId, stripeAccountId },
        update: { stripeAccountId },
      });
    }

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const returnUrl = `${frontendUrl}/profile/stripe-return`;
    const link = await this.stripe.createOnboardingLink(
      stripeAccountId,
      `${returnUrl}?refresh=true`,
      returnUrl,
    );
    return { url: link.url };
  }
}
