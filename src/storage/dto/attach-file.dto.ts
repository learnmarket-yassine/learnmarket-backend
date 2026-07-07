import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AttachFileDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;
}
