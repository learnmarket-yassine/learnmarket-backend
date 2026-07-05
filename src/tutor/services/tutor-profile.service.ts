import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from '../dto/profile/update-profile.dto';
import { UploadService } from '../../storage/upload.service';

const PROFILE_INCLUDE = {
  languages: true,
  education: true,
  portfolio: { include: { images: true } },
  certifications: { include: { files: true } },
  employment: { include: { certificates: true } },
} as const;

@Injectable()
export class TutorProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadService,
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

    const profile = await this.prisma.tutorProfile.create({
      data: { userId },
      include: PROFILE_INCLUDE,
    });
    return this.withImageUrls(profile);
  }

  async findByUserId(userId: string) {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { userId },
      include: PROFILE_INCLUDE,
    });
    if (!profile) throw new NotFoundException('Tutor profile not found');
    return this.withImageUrls(profile);
  }

  async update(userId: string, dto: UpdateProfileDto) {
    await this.resolveProfileId(userId);
    const profile = await this.prisma.tutorProfile.update({
      where: { userId },
      data: dto,
      include: PROFILE_INCLUDE,
    });
    return this.withImageUrls(profile);
  }

  async resolveProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Tutor profile not found');
    return profile.id;
  }

  /** Portfolio images are public; certification/employment files stay key-only — fetch a signed URL per file on demand. */
  private withImageUrls<
    T extends { portfolio: { images: { key: string }[] }[] },
  >(profile: T) {
    return {
      ...profile,
      portfolio: profile.portfolio.map((item) => ({
        ...item,
        images: item.images.map((image) => ({
          ...image,
          url: this.uploads.getPublicUrl(image.key),
        })),
      })),
    };
  }
}
