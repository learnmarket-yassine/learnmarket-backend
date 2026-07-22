import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PayoutMethod } from '@prisma/client';
import { CreateSessionPlanDto } from './create-session-plan.dto';

export class CreateProposalDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsInt()
  @IsPositive()
  sessionDurationMinutes!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  totalPrice!: number;

  @IsOptional()
  @IsEnum(PayoutMethod)
  payoutMethod?: PayoutMethod;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSessionPlanDto)
  sessionPlans!: CreateSessionPlanDto[];
}
