import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreatePortfolioDto } from '../dto/portfolio/create-portfolio.dto';
import { PortfolioService } from '../services/portfolio.service';
import { UpdatePortfolioDto } from '../dto/portfolio/update-portfolio.dto';

@Controller('tutor/portfolio')
@UseGuards(RolesGuard)
@Roles(UserRole.TUTOR)
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  add(@CurrentUser('id') userId: string, @Body() dto: CreatePortfolioDto) {
    return this.portfolio.add(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') itemId: string,
    @Body() dto: UpdatePortfolioDto,
  ) {
    return this.portfolio.update(userId, itemId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') userId: string, @Param('id') itemId: string) {
    return this.portfolio.remove(userId, itemId);
  }
}
