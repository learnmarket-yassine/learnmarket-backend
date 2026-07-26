import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';

// Attachments are intentionally not editable here -- reference materials are
// only set at creation time; re-uploading/removing them is out of scope.
export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAt?: Date;
}
