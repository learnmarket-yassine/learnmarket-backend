import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SpecialtiesService } from '../../categories/specialties.service';
import { TutorProfileService } from './tutor-profile.service';

const SPECIALTY_INCLUDE = {
  specialty: { include: { category: true } },
} as const;

@Injectable()
export class TutorSpecialtiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorProfile: TutorProfileService,
    private readonly specialties: SpecialtiesService,
  ) {}

  async attach(userId: string, specialtyId: string) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    await this.specialties.assertActive(specialtyId);

    const existing = await this.prisma.tutorProfileSpecialty.findUnique({
      where: { profileId_specialtyId: { profileId, specialtyId } },
    });
    if (existing) throw new ConflictException('Specialty already added');

    return this.prisma.tutorProfileSpecialty.create({
      data: { profileId, specialtyId },
      include: SPECIALTY_INCLUDE,
    });
  }

  async detach(userId: string, specialtyId: string) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    const { count } = await this.prisma.tutorProfileSpecialty.deleteMany({
      where: { profileId, specialtyId },
    });
    if (count === 0) {
      throw new NotFoundException('Specialty not found on profile');
    }
  }

  async replace(userId: string, specialtyIds: string[]) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    const uniqueSpecialtyIds = specialtyIds.length
      ? await this.specialties.assertAllActive(specialtyIds)
      : [];

    return this.prisma.$transaction(async (tx) => {
      await tx.tutorProfileSpecialty.deleteMany({ where: { profileId } });
      if (uniqueSpecialtyIds.length) {
        await tx.tutorProfileSpecialty.createMany({
          data: uniqueSpecialtyIds.map((specialtyId) => ({
            profileId,
            specialtyId,
          })),
        });
      }
      return tx.tutorProfileSpecialty.findMany({
        where: { profileId },
        include: SPECIALTY_INCLUDE,
      });
    });
  }
}
