import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertLanguageDto } from './dto/language/upsert-language.dto';

@Injectable()
export class LanguageService {
  constructor(private readonly prisma: PrismaService) {}

  add(userId: string, dto: UpsertLanguageDto) {
    return this.prisma.userLanguage.create({ data: { ...dto, userId } });
  }

  async update(userId: string, languageId: string, dto: UpsertLanguageDto) {
    await this.assertOwnership(userId, languageId);
    return this.prisma.userLanguage.update({
      where: { id: languageId },
      data: dto,
    });
  }

  async remove(userId: string, languageId: string) {
    await this.assertOwnership(userId, languageId);
    await this.prisma.userLanguage.delete({ where: { id: languageId } });
  }

  private async assertOwnership(userId: string, languageId: string) {
    const item = await this.prisma.userLanguage.findUnique({
      where: { id: languageId },
      select: { userId: true },
    });
    if (!item) throw new NotFoundException('Language not found');
    if (item.userId !== userId) throw new ForbiddenException('Access denied');
  }
}
