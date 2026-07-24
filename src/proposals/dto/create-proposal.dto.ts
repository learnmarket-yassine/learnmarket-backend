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

// Sanity cap on the tutor's asking price, well below what Decimal(10,2)
// can hold -- keeps garbage/overflow-adjacent input out before it ever
// reaches fee math or, eventually, a real payment processor.
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
