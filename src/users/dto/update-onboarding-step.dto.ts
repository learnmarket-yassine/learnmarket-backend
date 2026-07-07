import { IsInt, Min } from 'class-validator';

export class UpdateOnboardingStepDto {
  @IsInt()
  @Min(1)
  step!: number;
}
