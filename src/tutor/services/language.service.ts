import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorProfileService } from './tutor-profile.service';
import { UpsertLanguageDto } from '../dto/language/upsert-language.dto';

@Injectable()
export class LanguageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorProfile: TutorProfileService,
  ) {}

  async add(userId: string, dto: UpsertLanguageDto) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    return this.prisma.profileLanguage.create({ data: { ...dto, profileId } });
  }

  async update(userId: string, languageId: string, dto: UpsertLanguageDto) {
    await this.assertOwnership(userId, languageId);
    return this.prisma.profileLanguage.update({
      where: { id: languageId },
      data: dto,
    });
  }

  async remove(userId: string, languageId: string) {
    await this.assertOwnership(userId, languageId);
    await this.prisma.profileLanguage.delete({ where: { id: languageId } });
  }

  private async assertOwnership(userId: string, languageId: string) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    const item = await this.prisma.profileLanguage.findUnique({
      where: { id: languageId },
      select: { profileId: true },
    });
    if (!item) throw new NotFoundException('Language not found');
    if (item.profileId !== profileId)
      throw new ForbiddenException('Access denied');
  }
}
