import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const TUTOR_PROFILE_INCLUDE = {
  languages: true,
  education: true,
  skills: true,
  portfolio: true,
  certifications: true,
  employment: true,
} as const;

const PROFILE_SELECT = {
  id: true,
  email: true,
  firstname: true,
  lastname: true,
  avatar: true,
  location: true,
  phone: true,
  role: true,
  isOnlineForMsg: true,
  createdAt: true,
  updatedAt: true,
  tutorProfile: { include: TUTOR_PROFILE_INCLUDE },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
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

    return { ...user, isProfileCompleted: this.isProfileCompleted(user) };
  }

  private isProfileCompleted(
    user: Pick<User, 'role'> & {
      tutorProfile: {
        headline: string | null;
        hourlyRate: unknown;
        bio: string | null;
        skills: unknown[];
        education: unknown[];
        languages: unknown[];
      } | null;
    },
  ): boolean {
    switch (user.role) {
      case UserRole.TUTOR:
        return this.isTutorProfileCompleted(user.tutorProfile);
      default:
        return true;
    }
  }

  private isTutorProfileCompleted(
    profile: {
      headline: string | null;
      hourlyRate: unknown;
      bio: string | null;
      skills: unknown[];
      education: unknown[];
      languages: unknown[];
    } | null,
  ): boolean {
    return !!(
      profile &&
      profile.headline &&
      profile.hourlyRate != null &&
      profile.bio &&
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

  update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: updateUserDto });
  }

  remove(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }
}
