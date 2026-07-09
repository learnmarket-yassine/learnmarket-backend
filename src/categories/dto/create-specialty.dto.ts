import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSpecialtyDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
