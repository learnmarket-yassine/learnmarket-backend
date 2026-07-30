import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SparksTransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MONTHLY_FREE_GRANT } from '../constants/sparks.constants';

@Injectable()
export class SparksGrantCron {
  private readonly logger = new Logger(SparksGrantCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 0 1 * *')
  async grantMonthlySparks(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error(
        'grantMonthlySparks failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async run(): Promise<void> {
    const tutors = await this.prisma.tutorProfile.findMany({
      select: { userId: true },
    });

    for (const tutor of tutors) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.tutorProfile.update({
          where: { userId: tutor.userId },
          data: { sparksBalance: { increment: MONTHLY_FREE_GRANT } },
        });
        await tx.sparksTransaction.create({
          data: {
            tutorId: tutor.userId,
            type: SparksTransactionType.MONTHLY_GRANT,
            amount: MONTHLY_FREE_GRANT,
            balanceAfter: updated.sparksBalance,
          },
        });
      });
    }

    if (tutors.length > 0) {
      this.logger.debug(
        `Granted monthly Sparks to ${tutors.length} tutor(s)`,
      );
    }
  }
}
