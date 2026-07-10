import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SpecialtiesService } from '../../categories/specialties.service';
import { LearnerProfileService } from './learner-profile.service';

const INTEREST_INCLUDE = {
  specialty: { include: { category: true } },
} as const;

@Injectable()
export class LearnerInterestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learnerProfile: LearnerProfileService,
    private readonly specialties: SpecialtiesService,
  ) {}

  async attach(userId: string, specialtyId: string) {
    const profileId = await this.learnerProfile.resolveProfileId(userId);
    await this.specialties.assertActive(specialtyId);

    const existing = await this.prisma.learnerProfileInterest.findUnique({
      where: { profileId_specialtyId: { profileId, specialtyId } },
    });
    if (existing) throw new ConflictException('Interest already added');

    return this.prisma.learnerProfileInterest.create({
      data: { profileId, specialtyId },
      include: INTEREST_INCLUDE,
    });
  }

  async detach(userId: string, specialtyId: string) {
    const profileId = await this.learnerProfile.resolveProfileId(userId);
    const { count } = await this.prisma.learnerProfileInterest.deleteMany({
      where: { profileId, specialtyId },
    });
    if (count === 0) {
      throw new NotFoundException('Interest not found on profile');
    }
  }

  async replace(userId: string, specialtyIds: string[]) {
    const profileId = await this.learnerProfile.resolveProfileId(userId);
    const uniqueSpecialtyIds = specialtyIds.length
      ? await this.specialties.assertAllActive(specialtyIds)
      : [];

    return this.prisma.$transaction(async (tx) => {
      await tx.learnerProfileInterest.deleteMany({ where: { profileId } });
      if (uniqueSpecialtyIds.length) {
        await tx.learnerProfileInterest.createMany({
          data: uniqueSpecialtyIds.map((specialtyId) => ({
            profileId,
            specialtyId,
          })),
        });
      }
      return tx.learnerProfileInterest.findMany({
        where: { profileId },
        include: INTEREST_INCLUDE,
      });
    });
  }
}
