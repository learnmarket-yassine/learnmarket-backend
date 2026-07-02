import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorProfileService } from './tutor-profile.service';
import { CreateSkillDto } from '../dto/skill/create-skill.dto';

@Injectable()
export class SkillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorProfile: TutorProfileService,
  ) {}

  async add(userId: string, dto: CreateSkillDto) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    return this.prisma.profileSkill.create({ data: { ...dto, profileId } });
  }

  async remove(userId: string, skillId: string) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    const item = await this.prisma.profileSkill.findUnique({
      where: { id: skillId },
      select: { profileId: true },
    });
    if (!item) throw new NotFoundException('Skill not found');
    if (item.profileId !== profileId)
      throw new ForbiddenException('Access denied');
    await this.prisma.profileSkill.delete({ where: { id: skillId } });
  }
}
