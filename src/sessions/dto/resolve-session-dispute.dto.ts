import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
export class ResolveSessionDisputeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note!: string;
}
