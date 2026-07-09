import { IsUUID } from 'class-validator';

export class AttachSpecialtyDto {
  @IsUUID()
  specialtyId!: string;
}
