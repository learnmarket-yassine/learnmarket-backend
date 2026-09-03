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
  Max,
  ValidateNested,
} from 'class-validator';
import { PayoutMethod } from '@prisma/client';
import { CreateSessionPlanDto } from './create-session-plan.dto';

export const MAX_PROPOSAL_PRICE = 100_000;

export class CreateProposalDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsInt()
  @IsPositive()
  sessionDurationMinutes!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_PROPOSAL_PRICE)
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
