import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorProfileService } from './tutor-profile.service';
import { CreateCertificationDto } from '../dto/certification/create-certification.dto';
import { UpdateCertificationDto } from '../dto/certification/update-certification.dto';

@Injectable()
export class CertificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorProfile: TutorProfileService,
  ) {}

  async add(userId: string, dto: CreateCertificationDto) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    return this.prisma.certification.create({ data: { ...dto, profileId } });
  }

  async update(userId: string, certId: string, dto: UpdateCertificationDto) {
    await this.assertOwnership(userId, certId);
    return this.prisma.certification.update({
      where: { id: certId },
      data: dto,
    });
  }

  async remove(userId: string, certId: string) {
    await this.assertOwnership(userId, certId);
    await this.prisma.certification.delete({ where: { id: certId } });
  }

  private async assertOwnership(userId: string, certId: string) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    const item = await this.prisma.certification.findUnique({
      where: { id: certId },
      select: { profileId: true },
    });
    if (!item) throw new NotFoundException('Certification not found');
    if (item.profileId !== profileId)
      throw new ForbiddenException('Access denied');
  }
}
