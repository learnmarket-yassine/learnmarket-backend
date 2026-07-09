import { Controller, Get, Param, Query } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { SpecialtiesService } from './specialties.service';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { ListSpecialtiesQueryDto } from './dto/list-specialties-query.dto';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly specialties: SpecialtiesService,
  ) {}

  @Get()
  findAll(@Query() query: ListCategoriesQueryDto) {
    return this.categories.findAllPaginated(query);
  }

  @Get(':categoryId/specialties')
  findSpecialties(
    @Param('categoryId') categoryId: string,
    @Query() query: ListSpecialtiesQueryDto,
  ) {
    return this.specialties.findAllPaginated(categoryId, query);
  }
}
