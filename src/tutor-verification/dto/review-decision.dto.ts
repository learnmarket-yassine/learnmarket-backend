import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Required on both reject and revoke -- an admin decision that blocks or
// undoes a tutor's verification must always carry a reason the tutor (and
// any other admin auditing the decision later) can read back.
export class ReviewDecisionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
