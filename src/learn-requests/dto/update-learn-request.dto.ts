import { PartialType } from '@nestjs/mapped-types';
import { CreateLearnRequestDto } from './create-learn-request.dto';

export class UpdateLearnRequestDto extends PartialType(CreateLearnRequestDto) {}
