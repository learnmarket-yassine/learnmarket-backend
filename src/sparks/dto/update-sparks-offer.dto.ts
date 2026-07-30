import { PartialType } from '@nestjs/mapped-types';
import { CreateSparksOfferDto } from './create-sparks-offer.dto';

export class UpdateSparksOfferDto extends PartialType(
  CreateSparksOfferDto,
) {}
