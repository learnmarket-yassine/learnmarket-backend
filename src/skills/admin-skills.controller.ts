import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SkillsService } from './skills.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { ListSkillsQueryDto } from './dto/list-skills-query.dto';

@Controller('admin/skills')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSkillDto) {
    return this.skills.create(dto);
  }

  @Get()
  findAll(@Query() query: ListSkillsQueryDto) {
    return this.skills.findAllPaginated(query);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSkillDto) {
    return this.skills.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.skills.softDelete(id);
  }

  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeHard(@Param('id') id: string) {
    return this.skills.remove(id);
  }
}
