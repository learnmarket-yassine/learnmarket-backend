import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../storage/upload.service';
import { UploadPurpose } from '../storage/upload-purpose.enum';

const TUTOR_PROFILE_INCLUDE = {
  languages: true,
  education: true,
  skills: { include: { skill: true } },
  portfolio: { include: { media: true, skills: { include: { skill: true } } } },
  certifications: { include: { files: true } },
  employment: { include: { certificates: true } },
} as const;

const PROFILE_SELECT = {
  id: true,
  email: true,
  firstname: true,
  lastname: true,
  avatar: true,
  headline: true,
  bio: true,
  role: true,
  country: true,
  phone: true,
  phoneCountryCode: true,
  dateOfBirth: true,
  address: true,
  city: true,
  state: true,
  postalCode: true,
  isOnlineForMsg: true,
  onboardingStep: true,
  createdAt: true,
  updatedAt: true,
  tutorProfile: { include: TUTOR_PROFILE_INCLUDE },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadService,
  ) {}
  create(createUserDto: CreateUserDto): Promise<User> {
    return this.prisma.user.create({ data: createUserDto });
  }

  findAll(): Promise<User[]> {
    return this.prisma.user.findMany();
  }

  async getProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PROFILE_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      ...user,
      avatarUrl: user.avatar ? this.uploads.getPublicUrl(user.avatar) : null,
      isProfileCompleted: this.isProfileCompleted(user),
    };
  }

  async updateAvatar(userId: string, key: string) {
    await this.uploads.finalize(userId, UploadPurpose.AVATAR, key);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const previousKey = user.avatar;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: key },
      select: { avatar: true },
    });

    if (previousKey && previousKey !== key) {
      await this.uploads.deleteIfPresent(previousKey);
    }

    return {
      avatar: updated.avatar,
      avatarUrl: this.uploads.getPublicUrl(key),
    };
  }

  async updateOnboardingStep(userId: string, step: number) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingStep: step },
      select: { onboardingStep: true },
    });
    return updated;
  }

  async removeAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.avatar) {
      await this.uploads.deleteIfPresent(user.avatar);
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatar: null },
      });
    }
  }

  private isProfileCompleted(
    user: Pick<
      User,
      'role' | 'headline' | 'bio' | 'dateOfBirth' | 'address' | 'city' | 'phone'
    > & {
      tutorProfile: {
        hourlyRate: unknown;
        skills: unknown[];
        education: unknown[];
        languages: unknown[];
      } | null;
    },
  ): boolean {
    switch (user.role) {
      case UserRole.TUTOR:
        return this.isTutorProfileCompleted(user);
      default:
        return true;
    }
  }

  private isTutorProfileCompleted(user: {
    headline: string | null;
    bio: string | null;
    dateOfBirth: Date | null;
    address: string | null;
    city: string | null;
    phone: string | null;
    tutorProfile: {
      hourlyRate: unknown;
      skills: unknown[];
      education: unknown[];
      languages: unknown[];
    } | null;
  }): boolean {
    const profile = user.tutorProfile;
    return !!(
      user.headline &&
      user.bio &&
      user.dateOfBirth &&
      user.address &&
      user.city &&
      user.phone &&
      profile &&
      profile.hourlyRate != null &&
      profile.skills.length > 0 &&
      profile.education.length > 0 &&
      profile.languages.length > 0
    );
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByIdSafe(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PROFILE_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      ...user,
      avatarUrl: user.avatar ? this.uploads.getPublicUrl(user.avatar) : null,
    };
  }

  update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: updateUserDto });
  }

  remove(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }
}
