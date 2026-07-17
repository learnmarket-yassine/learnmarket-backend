import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';
import { CategorySkillsService } from './category-skills.service';
import { SkillsService } from '../skills/skills.service';

describe('CategorySkillsService (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let categorySkills: CategorySkillsService;

  let categoryId: string;
  let skillAId: string;
  let skillBId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        CategoriesService,
        SkillsService,
        CategorySkillsService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    categorySkills = moduleRef.get(CategorySkillsService);
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const category = await prisma.category.create({
      data: { name: `Category ${suffix}`, slug: `category-${suffix}` },
    });
    categoryId = category.id;

    const [skillB, skillA] = await Promise.all([
      prisma.skill.create({ data: { name: `Zebra-${suffix}` } }),
      prisma.skill.create({ data: { name: `Alpha-${suffix}` } }),
    ]);
    skillAId = skillA.id;
    skillBId = skillB.id;
  });

  afterEach(async () => {
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.skill.deleteMany({
      where: { id: { in: [skillAId, skillBId] } },
    });
  });

  it('returns an empty array for a category with no linked skills', async () => {
    const result = await categorySkills.findByCategory(categoryId);
    expect(result).toEqual([]);
  });

  it('throws 404 when the category does not exist', async () => {
    await expect(
      categorySkills.findByCategory('00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns linked skills sorted alphabetically by name', async () => {
    await categorySkills.add(categoryId, skillBId);
    await categorySkills.add(categoryId, skillAId);

    const result = await categorySkills.findByCategory(categoryId);
    expect(result.map((s) => s.id)).toEqual([skillAId, skillBId]);
  });

  it('returns 409 when adding the same (category, skill) pair twice', async () => {
    await categorySkills.add(categoryId, skillAId);
    await expect(
      categorySkills.add(categoryId, skillAId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('removes a mapping, and 404s if it does not exist', async () => {
    await categorySkills.add(categoryId, skillAId);
    await categorySkills.remove(categoryId, skillAId);

    const result = await categorySkills.findByCategory(categoryId);
    expect(result).toEqual([]);

    await expect(
      categorySkills.remove(categoryId, skillAId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cascades: deleting a Category removes its CategorySkill rows', async () => {
    await categorySkills.add(categoryId, skillAId);
    await categorySkills.add(categoryId, skillBId);

    await prisma.category.delete({ where: { id: categoryId } });

    const remaining = await prisma.categorySkill.findMany({
      where: { categoryId },
    });
    expect(remaining).toEqual([]);
  });
});
