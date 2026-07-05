import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorProfileService } from './tutor-profile.service';
import { CreateEmploymentDto } from '../dto/employment/create-employment.dto';
import { UpdateEmploymentDto } from '../dto/employment/update-employment.dto';
import { UploadService } from '../../storage/upload.service';
import { UploadPurpose } from '../../storage/upload-purpose.enum';

@Injectable()
export class EmploymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorProfile: TutorProfileService,
    private readonly uploads: UploadService,
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
    const certificates = await this.prisma.employmentCertificate.findMany({
      where: { employmentId },
      select: { key: true },
    });
    await this.prisma.employment.delete({ where: { id: employmentId } });
    await Promise.all(
      certificates.map((cert) => this.uploads.deleteIfPresent(cert.key)),
    );
  }

  async addCertificate(
    userId: string,
    employmentId: string,
    key: string,
    fileName?: string,
  ) {
    await this.assertOwnership(userId, employmentId);
    await this.uploads.finalize(
      userId,
      UploadPurpose.EMPLOYMENT_CERTIFICATE,
      key,
    );
    return this.prisma.employmentCertificate.create({
      data: { employmentId, key, fileName: fileName ?? null },
    });
  }

  async removeCertificate(
    userId: string,
    employmentId: string,
    certificateId: string,
  ) {
    await this.assertOwnership(userId, employmentId);
    const certificate = await this.prisma.employmentCertificate.findUnique({
      where: { id: certificateId },
    });
    if (!certificate || certificate.employmentId !== employmentId) {
      throw new NotFoundException('Employment certificate not found');
    }
    await this.prisma.employmentCertificate.delete({
      where: { id: certificateId },
    });
    await this.uploads.deleteIfPresent(certificate.key);
  }

  async getCertificateUrl(
    userId: string,
    employmentId: string,
    certificateId: string,
  ) {
    await this.assertOwnership(userId, employmentId);
    const certificate = await this.prisma.employmentCertificate.findUnique({
      where: { id: certificateId },
    });
    if (!certificate || certificate.employmentId !== employmentId) {
      throw new NotFoundException('Employment certificate not found');
    }
    return this.uploads.getSignedDownloadUrl(certificate.key);
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
