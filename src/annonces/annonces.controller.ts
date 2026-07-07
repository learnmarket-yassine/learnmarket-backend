import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AnnoncesService } from './annonces.service';
import { CreateAnnonceDto } from './dto/create-annonce.dto';

@Controller('annonces')
@UseGuards(RolesGuard)
export class AnnoncesController {
  constructor(private readonly annonces: AnnoncesService) {}

  @Roles(UserRole.LEARNER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('id') userId: string, @Body() dto: CreateAnnonceDto) {
    return this.annonces.create(userId, dto);
  }

  @Get()
  findOpen() {
    return this.annonces.findOpen();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.annonces.findById(id);
  }
}
