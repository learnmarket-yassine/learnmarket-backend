import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorProfileService } from './tutor-profile.service';
import { CreateCertificationDto } from '../dto/certification/create-certification.dto';
import { UpdateCertificationDto } from '../dto/certification/update-certification.dto';
import { UploadService } from '../../storage/upload.service';
import { UploadPurpose } from '../../storage/upload-purpose.enum';

@Injectable()
export class CertificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorProfile: TutorProfileService,
    private readonly uploads: UploadService,
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
    const files = await this.prisma.certificationFile.findMany({
      where: { certificationId: certId },
      select: { key: true },
    });
    await this.prisma.certification.delete({ where: { id: certId } });
    await Promise.all(
      files.map((file) => this.uploads.deleteIfPresent(file.key)),
    );
  }

  async addFile(
    userId: string,
    certId: string,
    key: string,
    fileName?: string,
    mimeType?: string,
  ) {
    await this.assertOwnership(userId, certId);
    const head = await this.uploads.finalize(
      userId,
      UploadPurpose.CERTIFICATION_FILE,
      key,
    );
    return this.prisma.certificationFile.create({
      data: {
        certificationId: certId,
        key,
        fileName: fileName ?? null,
        mimeType: mimeType ?? head.contentType ?? null,
      },
    });
  }

  async removeFile(userId: string, certId: string, fileId: string) {
    await this.assertOwnership(userId, certId);
    const file = await this.prisma.certificationFile.findUnique({
      where: { id: fileId },
    });
    if (!file || file.certificationId !== certId) {
      throw new NotFoundException('Certification file not found');
    }
    await this.prisma.certificationFile.delete({ where: { id: fileId } });
    await this.uploads.deleteIfPresent(file.key);
  }

  async getFileUrl(userId: string, certId: string, fileId: string) {
    await this.assertOwnership(userId, certId);
    const file = await this.prisma.certificationFile.findUnique({
      where: { id: fileId },
    });
    if (!file || file.certificationId !== certId) {
      throw new NotFoundException('Certification file not found');
    }
    return this.uploads.getSignedDownloadUrl(file.key);
  }

  async getFileUrlForAdmin(certId: string, fileId: string) {
    const file = await this.prisma.certificationFile.findUnique({
      where: { id: fileId },
    });
    if (!file || file.certificationId !== certId) {
      throw new NotFoundException('Certification file not found');
    }
    return this.uploads.getSignedDownloadUrl(file.key);
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
