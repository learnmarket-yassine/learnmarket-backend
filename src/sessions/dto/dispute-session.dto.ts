import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DisputeSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
