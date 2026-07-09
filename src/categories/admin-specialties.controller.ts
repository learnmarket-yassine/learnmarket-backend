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
import { SpecialtiesService } from './specialties.service';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';
import { UpdateSpecialtyDto } from './dto/update-specialty.dto';
import { ListSpecialtiesQueryDto } from './dto/list-specialties-query.dto';

@Controller('admin/specialties')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSpecialtiesController {
  constructor(private readonly specialties: SpecialtiesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSpecialtyDto) {
    return this.specialties.create(dto);
  }

  @Get()
  findAll(@Query() query: ListSpecialtiesQueryDto) {
    return this.specialties.findAll(query);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSpecialtyDto) {
    return this.specialties.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.specialties.softDelete(id);
  }
}
