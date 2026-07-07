import { IsNotEmpty, IsString } from 'class-validator';

export class PurchaseConnectsDto {
  @IsString()
  @IsNotEmpty()
  packageId!: string;
}
