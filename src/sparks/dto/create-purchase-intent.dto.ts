import { IsString, MinLength } from 'class-validator';

export class CreatePurchaseIntentDto {
  @IsString()
  @MinLength(1)
  offerId!: string;
}
