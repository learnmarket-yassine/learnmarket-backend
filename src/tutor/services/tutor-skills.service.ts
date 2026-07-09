import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SkillsService } from '../../skills/skills.service';
import { TutorProfileService } from './tutor-profile.service';

@Injectable()
export class TutorSkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorProfile: TutorProfileService,
    private readonly skills: SkillsService,
  ) {}

  async attach(userId: string, skillId: string) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    await this.skills.assertActive(skillId);

    const existing = await this.prisma.tutorProfileSkill.findUnique({
      where: { profileId_skillId: { profileId, skillId } },
    });
    if (existing) throw new ConflictException('Skill already added');

    return this.prisma.tutorProfileSkill.create({
      data: { profileId, skillId },
      include: { skill: true },
    });
  }

  async detach(userId: string, skillId: string) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    const { count } = await this.prisma.tutorProfileSkill.deleteMany({
      where: { profileId, skillId },
    });
    if (count === 0) throw new NotFoundException('Skill not found on profile');
  }

  async replace(userId: string, skillIds: string[]) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    const uniqueSkillIds = skillIds.length
      ? await this.skills.assertAllActive(skillIds)
      : [];

    return this.prisma.$transaction(async (tx) => {
      await tx.tutorProfileSkill.deleteMany({ where: { profileId } });
      if (uniqueSkillIds.length) {
        await tx.tutorProfileSkill.createMany({
          data: uniqueSkillIds.map((skillId) => ({ profileId, skillId })),
        });
      }
      return tx.tutorProfileSkill.findMany({
        where: { profileId },
        include: { skill: true },
      });
    });
  }
}
