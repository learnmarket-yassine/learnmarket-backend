import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SparksService } from '../services/sparks.service';
import { CreateSparksOfferDto } from '../dto/create-sparks-offer.dto';
import { UpdateSparksOfferDto } from '../dto/update-sparks-offer.dto';
import { GetSparksOffersQueryDto } from '../dto/get-sparks-offers';

@Controller('admin/sparks-offers')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSparksOfferController {
  constructor(private readonly sparks: SparksService) {}

  @Post()
  create(@Body() dto: CreateSparksOfferDto) {
    return this.sparks.createOffer(dto);
  }

  @Get()
  listAll(@Query() query: GetSparksOffersQueryDto) {
    return this.sparks.listAllOffers(query);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSparksOfferDto) {
    return this.sparks.updateOffer(id, dto);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.sparks.setOfferActive(id, false);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.sparks.setOfferActive(id, true);
  }
}
