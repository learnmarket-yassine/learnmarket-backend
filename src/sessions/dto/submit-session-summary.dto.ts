import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SubmitSessionSummaryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  summary!: string;
}
