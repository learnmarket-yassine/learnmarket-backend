import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AttachAvatarDto } from './dto/attach-avatar.dto';
import { UpdateOnboardingStepDto } from './dto/update-onboarding-step.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get('me')
  getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch('me/avatar')
  updateAvatar(
    @CurrentUser('id') userId: string,
    @Body() dto: AttachAvatarDto,
  ) {
    return this.usersService.updateAvatar(userId, dto.key);
  }

  @Delete('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAvatar(@CurrentUser('id') userId: string) {
    return this.usersService.removeAvatar(userId);
  }

  @Patch('me/onboarding-step')
  updateOnboardingStep(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateOnboardingStepDto,
  ) {
    return this.usersService.updateOnboardingStep(userId, dto.step);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.usersService.findByIdSafe(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
