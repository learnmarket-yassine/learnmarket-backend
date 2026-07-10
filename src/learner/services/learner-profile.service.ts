import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateAvailabilityDto } from '../dto/availability/update-availability.dto';

const PROFILE_INCLUDE = {
  interests: { include: { specialty: { include: { category: true } } } },
} as const;

@Injectable()
export class LearnerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.LEARNER) {
      throw new ForbiddenException('Only learners can create a profile');
    }

    const existing = await this.prisma.learnerProfile.findUnique({
      where: { userId },
    });
    if (existing) throw new ConflictException('Profile already exists');

    return this.prisma.learnerProfile.create({
      data: { userId },
      include: PROFILE_INCLUDE,
    });
  }

  async findByUserId(userId: string) {
    const profile = await this.prisma.learnerProfile.findUnique({
      where: { userId },
      include: PROFILE_INCLUDE,
    });
    if (!profile) throw new NotFoundException('Learner profile not found');
    return profile;
  }

  async updateAvailability(userId: string, dto: UpdateAvailabilityDto) {
    await this.resolveProfileId(userId);

    const seen = new Set<string>();
    const slots = dto.slots.map(({ day, slot }) => {
      const key = `${day}_${slot}`;
      if (seen.has(key)) {
        throw new ConflictException(`Duplicate availability slot: ${key}`);
      }
      seen.add(key);
      return { day, slot };
    });

    return this.prisma.learnerProfile.update({
      where: { userId },
      data: { availability: slots },
      include: PROFILE_INCLUDE,
    });
  }

  async resolveProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.learnerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Learner profile not found');
    return profile.id;
  }
}
