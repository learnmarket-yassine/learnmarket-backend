import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, ValidateNested } from 'class-validator';
import {
  AvailabilityDay,
  AvailabilitySlot,
} from '../../enums/availability.enum';

export class AvailabilitySlotDto {
  @IsEnum(AvailabilityDay)
  day!: AvailabilityDay;

  @IsEnum(AvailabilitySlot)
  slot!: AvailabilitySlot;
}

export class UpdateAvailabilityDto {
  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  slots!: AvailabilitySlotDto[];
}
