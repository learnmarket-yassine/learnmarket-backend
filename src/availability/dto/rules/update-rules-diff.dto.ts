import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateRuleDto } from './create-rule.dto';
import { UpdateRuleDto } from './update-rule.dto';

export class RuleUpdateEntryDto {
  @IsString()
  id!: string;

  @ValidateNested()
  @Type(() => UpdateRuleDto)
  input!: UpdateRuleDto;
}

export class UpdateRulesDiffDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRuleDto)
  toCreate!: CreateRuleDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleUpdateEntryDto)
  toUpdate!: RuleUpdateEntryDto[];

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  toDelete!: string[];
}
