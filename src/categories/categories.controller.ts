import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CategoriesService } from './categories.service';
import { CategorySkillsService } from './category-skills.service';
import { SpecialtiesService } from './specialties.service';
import { AddCategorySkillDto } from './dto/add-category-skill.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { ListSpecialtiesQueryDto } from './dto/list-specialties-query.dto';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly specialties: SpecialtiesService,
    private readonly categorySkills: CategorySkillsService,
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

  @Get(':categoryId/skills')
  findSkills(@Param('categoryId') categoryId: string) {
    return this.categorySkills.findByCategory(categoryId);
  }

  @Post(':categoryId/skills')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  addSkill(
    @Param('categoryId') categoryId: string,
    @Body() dto: AddCategorySkillDto,
  ) {
    return this.categorySkills.add(categoryId, dto.skillId);
  }

  @Delete(':categoryId/skills/:skillId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSkill(
    @Param('categoryId') categoryId: string,
    @Param('skillId') skillId: string,
  ) {
    return this.categorySkills.remove(categoryId, skillId);
  }
}
