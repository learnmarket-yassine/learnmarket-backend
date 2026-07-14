import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectLearnRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
