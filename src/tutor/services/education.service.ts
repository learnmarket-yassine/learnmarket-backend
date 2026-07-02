import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorProfileService } from './tutor-profile.service';
import { CreateEducationDto } from '../dto/education/create-education.dto';
import { UpdateEducationDto } from '../dto/education/update-education.dto';

@Injectable()
export class EducationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorProfile: TutorProfileService,
  ) {}

  async add(userId: string, dto: CreateEducationDto) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    return this.prisma.education.create({ data: { ...dto, profileId } });
  }

  async update(userId: string, educationId: string, dto: UpdateEducationDto) {
    await this.assertOwnership(userId, educationId);
    return this.prisma.education.update({
      where: { id: educationId },
      data: dto,
    });
  }

  async remove(userId: string, educationId: string) {
    await this.assertOwnership(userId, educationId);
    await this.prisma.education.delete({ where: { id: educationId } });
  }

  private async assertOwnership(userId: string, educationId: string) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    const item = await this.prisma.education.findUnique({
      where: { id: educationId },
      select: { profileId: true },
    });
    if (!item) throw new NotFoundException('Education record not found');
    if (item.profileId !== profileId)
      throw new ForbiddenException('Access denied');
  }
}
