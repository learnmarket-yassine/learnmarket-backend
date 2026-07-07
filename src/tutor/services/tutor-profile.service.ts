import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectsService } from '../../connects/connects.service';
import { UpdateProfileDto } from '../dto/profile/update-profile.dto';

const PROFILE_INCLUDE = {
  languages: true,
  education: true,
  portfolio: { include: { media: true } },
  certifications: { include: { files: true } },
  employment: { include: { certificates: true } },
} as const;

@Injectable()
export class TutorProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connects: ConnectsService,
  ) {}

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

    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.tutorProfile.create({ data: { userId } });
      await this.connects.grantSignupBonus(tx, profile.id);
      return tx.tutorProfile.findUniqueOrThrow({
        where: { id: profile.id },
        include: PROFILE_INCLUDE,
      });
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
}
