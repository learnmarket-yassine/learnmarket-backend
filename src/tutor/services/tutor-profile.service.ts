import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TutorVerificationStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from '../dto/profile/update-profile.dto';

const PROFILE_INCLUDE = {
  skills: { include: { skill: true } },
  specialties: { include: { specialty: { include: { category: true } } } },
  portfolio: { include: { media: true, skills: { include: { skill: true } } } },
  certifications: { include: { files: true } },
  employment: { include: { certificates: true } },
} as const;

@Injectable()
export class TutorProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.TUTOR) {
      throw new ForbiddenException('Only tutors can create a profile');
    }

    const existing = await this.prisma.tutorProfile.findUnique({
      where: { userId },
    });
    if (existing) throw new ConflictException('Profile already exists');

    return this.prisma.tutorProfile.create({
      data: { userId },
      include: PROFILE_INCLUDE,
    });
  }

  async findByUserId(userId: string) {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { userId },
      include: PROFILE_INCLUDE,
    });
    if (!profile) throw new NotFoundException('Tutor profile not found');
    return profile;
  }

  async update(userId: string, dto: UpdateProfileDto) {
    await this.resolveProfileId(userId);
    return this.prisma.tutorProfile.update({
      where: { userId },
      data: dto,
      include: PROFILE_INCLUDE,
    });
  }

  async resolveProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Tutor profile not found');
    return profile.id;
  }

  // Learner-facing public profile -- only exposes fields safe to show to
  // anyone (no email/phone/address/stripe/verification-review internals),
  // and only for tutors who have actually cleared verification. An
  // unverified tutor never has an accepted proposal (see ProposalsService),
  // so gating on APPROVED here doesn't hide anyone a learner could
  // otherwise be working with.
  async findPublicByUserId(tutorId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: tutorId },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        avatar: true,
        headline: true,
        bio: true,
        country: true,
        city: true,
        languages: { select: { language: true, level: true } },
        education: true,
        tutorProfile: {
          select: {
            videoIntroUrl: true,
            verificationStatus: true,
            skills: { include: { skill: true } },
            specialties: {
              include: { specialty: { include: { category: true } } },
            },
            portfolio: {
              include: { media: true, skills: { include: { skill: true } } },
            },
            certifications: { include: { files: true } },
            employment: { include: { certificates: true } },
          },
        },
      },
    });

    if (
      !user?.tutorProfile ||
      user.tutorProfile.verificationStatus !== TutorVerificationStatus.APPROVED
    ) {
      throw new NotFoundException('Tutor profile not found');
    }

    return user;
  }
}
