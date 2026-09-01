import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { ListSkillsQueryDto } from './dto/list-skills-query.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';

const SEARCH_RESULT_LIMIT = 20;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const withUsageCounts = {
  _count: { select: { categorySkills: true, tutorProfiles: true } },
} as const;

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSkillDto) {
    const name = dto.name.trim();
    await this.assertNameAvailable(name);
    return this.prisma.skill.create({ data: { name } });
  }

  findAll(query: ListSkillsQueryDto) {
    return this.prisma.skill.findMany({
      where: {
        isActive: query.includeInactive ? undefined : true,
        name: query.search
          ? { contains: query.search, mode: 'insensitive' }
          : undefined,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findAllPaginated(
    query: ListSkillsQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where = {
      isActive: query.includeInactive ? undefined : true,
      name: query.search
        ? { contains: query.search, mode: 'insensitive' as const }
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.skill.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: page * limit,
        take: limit,
        include: withUsageCounts,
      }),
      this.prisma.skill.count({ where }),
    ]);

    return { data, total, page, hasMore: page * limit < total };
  }

  search(search?: string) {
    return this.prisma.skill.findMany({
      where: {
        isActive: true,
        name: search ? { contains: search, mode: 'insensitive' } : undefined,
      },
      orderBy: { name: 'asc' },
      take: SEARCH_RESULT_LIMIT,
    });
  }

  async update(id: string, dto: UpdateSkillDto) {
    await this.findOneOrThrow(id);
    if (dto.name) {
      await this.assertNameAvailable(dto.name.trim(), id);
    }
    return this.prisma.skill.update({
      where: { id },
      data: { name: dto.name?.trim(), isActive: dto.isActive },
    });
  }

  async softDelete(id: string) {
    await this.findOneOrThrow(id);
    await this.prisma.skill.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async remove(id: string) {
    await this.findOneOrThrow(id);
    await this.prisma.skill.delete({ where: { id } });
  }

  async assertActive(id: string) {
    const skill = await this.prisma.skill.findUnique({ where: { id } });
    if (!skill) throw new NotFoundException('Skill not found');
    if (!skill.isActive) throw new ConflictException('Skill is not active');
    return skill;
  }

  async assertAllActive(skillIds: string[]): Promise<string[]> {
    const uniqueIds = [...new Set(skillIds)];
    const found = await this.prisma.skill.findMany({
      where: { id: { in: uniqueIds }, isActive: true },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      throw new NotFoundException('One or more skills not found');
    }
    return uniqueIds;
  }

  private async findOneOrThrow(id: string) {
    const skill = await this.prisma.skill.findUnique({ where: { id } });
    if (!skill) throw new NotFoundException('Skill not found');
    return skill;
  }

  private async assertNameAvailable(name: string, excludeId?: string) {
    const existing = await this.prisma.skill.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        id: excludeId ? { not: excludeId } : undefined,
      },
    });
    if (existing) {
      throw new ConflictException('A skill with this name already exists');
    }
  }
}
