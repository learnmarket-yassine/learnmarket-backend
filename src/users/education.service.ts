import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEducationDto } from './dto/education/create-education.dto';
import { UpdateEducationDto } from './dto/education/update-education.dto';

@Injectable()
export class EducationService {
  constructor(private readonly prisma: PrismaService) {}

  add(userId: string, dto: CreateEducationDto) {
    return this.prisma.education.create({ data: { ...dto, userId } });
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
    const item = await this.prisma.education.findUnique({
      where: { id: educationId },
      select: { userId: true },
    });
    if (!item) throw new NotFoundException('Education record not found');
    if (item.userId !== userId) throw new ForbiddenException('Access denied');
  }
}
