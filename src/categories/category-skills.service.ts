import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SkillsService } from '../skills/skills.service';
import { CategoriesService } from './categories.service';

@Injectable()
export class CategorySkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly skills: SkillsService,
  ) {}

  async findByCategory(categoryId: string) {
    await this.categories.findOneOrThrow(categoryId);
    const categorySkills = await this.prisma.categorySkill.findMany({
      where: { categoryId },
      include: { skill: true },
      orderBy: { skill: { name: 'asc' } },
    });
    return categorySkills.map((categorySkill) => categorySkill.skill);
  }

  async add(categoryId: string, skillId: string) {
    await this.categories.findOneOrThrow(categoryId);
    await this.skills.assertActive(skillId);

    const existing = await this.prisma.categorySkill.findUnique({
      where: { categoryId_skillId: { categoryId, skillId } },
    });
    if (existing) {
      throw new ConflictException('Skill is already linked to this category');
    }

    await this.prisma.categorySkill.create({ data: { categoryId, skillId } });
  }

  async remove(categoryId: string, skillId: string) {
    await this.categories.findOneOrThrow(categoryId);
    const { count } = await this.prisma.categorySkill.deleteMany({
      where: { categoryId, skillId },
    });
    if (count === 0) {
      throw new NotFoundException('Skill is not linked to this category');
    }
  }
}
