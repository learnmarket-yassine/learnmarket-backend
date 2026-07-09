import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { Category } from '@prisma/client';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const name = dto.name.trim();
    const slug = slugify(name);
    await this.assertNameAvailable(name);
    await this.assertSlugAvailable(slug);
    return this.prisma.category.create({ data: { name, slug } });
  }

  findAll(query: ListCategoriesQueryDto) {
    return this.prisma.category.findMany({
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
    query: ListCategoriesQueryDto,
  ): Promise<PaginatedResult<Category>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where = {
      isActive: query.includeInactive ? undefined : true,
      name: query.search
        ? { contains: query.search, mode: 'insensitive' as const }
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.category.count({ where }),
    ]);

    return { data, total, page, hasMore: page * limit < total };
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOneOrThrow(id);
    const name = dto.name?.trim();
    if (name) await this.assertNameAvailable(name, id);
    return this.prisma.category.update({
      where: { id },
      data: {
        name,
        slug: name ? slugify(name) : undefined,
        isActive: dto.isActive,
      },
    });
  }

  async softDelete(id: string) {
    await this.findOneOrThrow(id);
    await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async assertActive(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    if (!category.isActive) {
      throw new ConflictException('Category is not active');
    }
    return category;
  }

  private async findOneOrThrow(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private async assertNameAvailable(name: string, excludeId?: string) {
    const existing = await this.prisma.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        id: excludeId ? { not: excludeId } : undefined,
      },
    });
    if (existing) throw new ConflictException('Category already exists');
  }

  private async assertSlugAvailable(slug: string) {
    const existing = await this.prisma.category.findUnique({
      where: { slug },
    });
    if (existing) throw new ConflictException('Category already exists');
  }
}
