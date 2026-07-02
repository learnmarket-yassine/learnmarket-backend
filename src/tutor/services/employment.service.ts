import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorProfileService } from './tutor-profile.service';
import { CreateEmploymentDto } from '../dto/employment/create-employment.dto';
import { UpdateEmploymentDto } from '../dto/employment/update-employment.dto';

@Injectable()
export class EmploymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorProfile: TutorProfileService,
  ) {}

  async add(userId: string, dto: CreateEmploymentDto) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    return this.prisma.employment.create({ data: { ...dto, profileId } });
  }

  async update(userId: string, employmentId: string, dto: UpdateEmploymentDto) {
    await this.assertOwnership(userId, employmentId);
    return this.prisma.employment.update({
      where: { id: employmentId },
      data: dto,
    });
  }

  async remove(userId: string, employmentId: string) {
    await this.assertOwnership(userId, employmentId);
    await this.prisma.employment.delete({ where: { id: employmentId } });
  }

  private async assertOwnership(userId: string, employmentId: string) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    const item = await this.prisma.employment.findUnique({
      where: { id: employmentId },
      select: { profileId: true },
    });
    if (!item) throw new NotFoundException('Employment record not found');
    if (item.profileId !== profileId)
      throw new ForbiddenException('Access denied');
  }
}
