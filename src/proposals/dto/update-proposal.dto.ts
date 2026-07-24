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
import { MAX_PROPOSAL_PRICE } from './create-proposal.dto';

export class UpdateProposalDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  sessionDurationMinutes?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_PROPOSAL_PRICE)
  totalPrice?: number;

  @IsOptional()
  @IsEnum(PayoutMethod)
  payoutMethod?: PayoutMethod;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSessionPlanDto)
  sessionPlans?: CreateSessionPlanDto[];
}
