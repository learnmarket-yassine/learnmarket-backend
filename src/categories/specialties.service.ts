import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import { CategoriesService } from './categories.service';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';
import { UpdateSpecialtyDto } from './dto/update-specialty.dto';
import { ListSpecialtiesQueryDto } from './dto/list-specialties-query.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { Specialty } from '@prisma/client';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

@Injectable()
export class SpecialtiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  async create(dto: CreateSpecialtyDto) {
    await this.categories.assertActive(dto.categoryId);
    const name = dto.name.trim();
    const slug = slugify(name);
    await this.assertSlugAvailable(dto.categoryId, slug);
    return this.prisma.specialty.create({
      data: { categoryId: dto.categoryId, name, slug },
    });
  }

  findAll(query: ListSpecialtiesQueryDto) {
    return this.prisma.specialty.findMany({
      where: {
        categoryId: query.categoryId,
        isActive: query.includeInactive ? undefined : true,
        name: query.search
          ? { contains: query.search, mode: 'insensitive' }
          : undefined,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findAllPaginated(
    categoryId: string,
    query: ListSpecialtiesQueryDto,
  ): Promise<PaginatedResult<Specialty>> {
    await this.categories.assertActive(categoryId);

    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where = {
      categoryId,
      isActive: query.includeInactive ? undefined : true,
      name: query.search
        ? { contains: query.search, mode: 'insensitive' as const }
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.specialty.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.specialty.count({ where }),
    ]);

    return { data, total, page, hasMore: page * limit < total };
  }

  async update(id: string, dto: UpdateSpecialtyDto) {
    const specialty = await this.findOneOrThrow(id);
    const categoryId = dto.categoryId ?? specialty.categoryId;
    if (dto.categoryId) await this.categories.assertActive(dto.categoryId);

    const name = dto.name?.trim();
    const slug = name ? slugify(name) : undefined;
    if (
      slug &&
      (slug !== specialty.slug || categoryId !== specialty.categoryId)
    ) {
      await this.assertSlugAvailable(categoryId, slug);
    }

    return this.prisma.specialty.update({
      where: { id },
      data: { categoryId: dto.categoryId, name, slug, isActive: dto.isActive },
    });
  }

  async softDelete(id: string) {
    await this.findOneOrThrow(id);
    await this.prisma.specialty.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async assertActive(id: string) {
    const specialty = await this.prisma.specialty.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!specialty) throw new NotFoundException('Specialty not found');
    if (!specialty.isActive || !specialty.category.isActive) {
      throw new ConflictException('Specialty is not active');
    }
    return specialty;
  }

  async assertAllActive(specialtyIds: string[]): Promise<string[]> {
    const uniqueIds = [...new Set(specialtyIds)];
    const found = await this.prisma.specialty.findMany({
      where: {
        id: { in: uniqueIds },
        isActive: true,
        category: { isActive: true },
      },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      throw new NotFoundException('One or more specialties not found');
    }
    return uniqueIds;
  }

  private async findOneOrThrow(id: string) {
    const specialty = await this.prisma.specialty.findUnique({
      where: { id },
    });
    if (!specialty) throw new NotFoundException('Specialty not found');
    return specialty;
  }

  private async assertSlugAvailable(categoryId: string, slug: string) {
    const existing = await this.prisma.specialty.findUnique({
      where: { categoryId_slug: { categoryId, slug } },
    });
    if (existing) throw new ConflictException('Specialty already exists');
  }
}
