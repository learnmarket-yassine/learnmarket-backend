import { IsUUID } from 'class-validator';

export class AttachInterestDto {
  @IsUUID()
  specialtyId!: string;
}
