import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReviewDecisionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
