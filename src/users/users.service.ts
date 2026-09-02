import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../storage/upload.service';
import { UploadPurpose } from '../storage/upload-purpose.enum';
import { GetUsersQueryDto } from './dto/get-users-dto';
import * as argon2 from 'argon2';

const TUTOR_PROFILE_INCLUDE = {
  skills: { include: { skill: true } },
  specialties: { include: { specialty: { include: { category: true } } } },
  portfolio: { include: { media: true, skills: { include: { skill: true } } } },
  certifications: { include: { files: true } },
  employment: { include: { certificates: true } },
} as const;

const LEARNER_PROFILE_INCLUDE = {
  interests: { include: { specialty: { include: { category: true } } } },
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
  isBlocked: true,
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
  education: true,
  languages: true,
  tutorProfile: { include: TUTOR_PROFILE_INCLUDE },
  learnerProfile: { include: LEARNER_PROFILE_INCLUDE },
  tutorAvailabilityRules: true,
} as const;

enum LearnerOnboardingStep {
  Interests = 1,
  Availability = 2,
  Headline = 3,
  Education = 4,
  Languages = 5,
  Bio = 6,
  ContactInfo = 7,
}

enum TutorOnboardingStep {
  ImportData = 1,
  Specialties = 2,
  Skills = 3,
  Headline = 4,
  // Experience = 5 — intentionally NOT a tracked step below (see comment).
  Education = 6,
  Languages = 7,
  Availability = 8,
  Bio = 9,
  ContactInfo = 10,
}

type ProfileUser = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

type OnboardingStepDef = {
  step: number;
  isComplete: (user: ProfileUser) => boolean;
};

const LEARNER_ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    step: LearnerOnboardingStep.Interests,
    isComplete: (u) => (u.learnerProfile?.interests.length ?? 0) > 0,
  },
  {
    step: LearnerOnboardingStep.Availability,
    isComplete: (u) =>
      Array.isArray(u.learnerProfile?.availability) &&
      (u.learnerProfile?.availability as unknown[]).length > 0,
  },
  { step: LearnerOnboardingStep.Headline, isComplete: (u) => !!u.headline },
  {
    step: LearnerOnboardingStep.Education,
    isComplete: (u) => u.education.length > 0,
  },
  {
    step: LearnerOnboardingStep.Languages,
    isComplete: (u) => u.languages.length > 0,
  },
  { step: LearnerOnboardingStep.Bio, isComplete: (u) => !!u.bio },
  {
    step: LearnerOnboardingStep.ContactInfo,
    isComplete: (u) =>
      !!u.country && !!u.city && !!u.phone && !!u.dateOfBirth && !!u.address,
  },
];

const TUTOR_ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    step: TutorOnboardingStep.Specialties,
    isComplete: (u) => (u.tutorProfile?.specialties.length ?? 0) > 0,
  },
  {
    step: TutorOnboardingStep.Skills,
    isComplete: (u) => (u.tutorProfile?.skills.length ?? 0) > 0,
  },
  { step: TutorOnboardingStep.Headline, isComplete: (u) => !!u.headline },
  {
    step: TutorOnboardingStep.Education,
    isComplete: (u) => u.education.length > 0,
  },
  {
    step: TutorOnboardingStep.Languages,
    isComplete: (u) => u.languages.length > 0,
  },
  {
    step: TutorOnboardingStep.Availability,
    isComplete: (u) => u.tutorAvailabilityRules.length > 0,
  },
  { step: TutorOnboardingStep.Bio, isComplete: (u) => !!u.bio },
  {
    step: TutorOnboardingStep.ContactInfo,
    isComplete: (u) =>
      !!u.country && !!u.city && !!u.phone && !!u.dateOfBirth && !!u.address,
  },
];

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

  async getUsers(query: GetUsersQueryDto) {
    const where: Prisma.UserWhereInput = {
      role: {
        not: UserRole.ADMIN,
      },
    };

    if (query.username?.trim()) {
      where.OR = [
        {
          firstname: {
            contains: query.username.trim(),
            mode: 'insensitive',
          },
        },
        {
          lastname: {
            contains: query.username.trim(),
            mode: 'insensitive',
          },
        },
      ];
    }

    if (query.role) {
      where.role = query.role;
    }

    if (query.country) {
      where.country = query.country;
    }

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: {
          createdAt: query.sortDir ?? 'desc',
        },
        skip: query.page * query.take,
        take: query.take,

        select: {
          id: true,
          firstname: true,
          lastname: true,
          email: true,
          avatar: true,
          country: true,
          createdAt: true,
          isBlocked: true,
          role: true,
        },
      }),

      this.prisma.user.count({
        where,
      }),
    ]);

    return {
      paginatedResult: items,
      totalCount,
    };
  }

  async getProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PROFILE_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');

    return this.buildOwnProfileResponse(user);
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

  async updateMyProfile(userId: string, dto: UpdateMyProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        password: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { oldPassword, newPassword, ...profileData } = dto;

    // Password change requested
    if (newPassword) {
      if (!oldPassword) {
        throw new ConflictException(
          'Old password is required to change your password',
        );
      }

      if (!user.password) {
        throw new ConflictException('This account does not have a password');
      }

      // Verify current password
      const isPasswordValid = await argon2.verify(user.password, oldPassword);

      if (!isPasswordValid) {
        throw new UnauthorizedException('Old password is incorrect');
      }

      // Hash the new password
      const passwordHash = await argon2.hash(newPassword);

      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...profileData,
          password: passwordHash,
        },
        select: PROFILE_SELECT,
      });

      return this.buildOwnProfileResponse(updatedUser);
    }

    // No password change
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: profileData,
      select: PROFILE_SELECT,
    });

    return this.buildOwnProfileResponse(updatedUser);
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

  private buildOwnProfileResponse(user: ProfileUser) {
    return {
      ...user,
      onboardingStep: this.computeOnboardingStep(user),
      avatarUrl: user.avatar ? this.uploads.getPublicUrl(user.avatar) : null,
      isProfileCompleted: this.isProfileCompleted(user),
    };
  }

  private computeOnboardingStep(user: ProfileUser): number {
    switch (user.role) {
      case UserRole.TUTOR:
        return this.computeTutorOnboardingStep(user);
      case UserRole.LEARNER:
        return (
          this.nextIncompleteStep(LEARNER_ONBOARDING_STEPS, user) ??
          user.onboardingStep
        );
      default:
        return user.onboardingStep;
    }
  }
  private computeTutorOnboardingStep(user: ProfileUser): number {
    const hasAnyProgress = TUTOR_ONBOARDING_STEPS.some((s) =>
      s.isComplete(user),
    );
    if (!hasAnyProgress) return TutorOnboardingStep.ImportData;

    const next = this.nextIncompleteStep(TUTOR_ONBOARDING_STEPS, user);
    return (
      next ?? TUTOR_ONBOARDING_STEPS[TUTOR_ONBOARDING_STEPS.length - 1].step + 1
    );
  }

  private nextIncompleteStep(
    steps: OnboardingStepDef[],
    user: ProfileUser,
  ): number | undefined {
    return steps.find((s) => !s.isComplete(user))?.step;
  }

  private isProfileCompleted(user: ProfileUser): boolean {
    switch (user.role) {
      case UserRole.TUTOR:
        return (
          this.nextIncompleteStep(TUTOR_ONBOARDING_STEPS, user) === undefined
        );
      case UserRole.LEARNER:
        return (
          this.nextIncompleteStep(LEARNER_ONBOARDING_STEPS, user) === undefined
        );
      default:
        return true;
    }
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

  async blockUser(userId: string) {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, isBlocked: false },
      data: { isBlocked: true },
    });
    if (result.count === 0) {
      const exists = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('User not found');
      throw new ConflictException('This user is already blocked');
    }
    return this.findByIdSafe(userId);
  }

  async unblockUser(userId: string) {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, isBlocked: true },
      data: { isBlocked: false },
    });
    if (result.count === 0) {
      const exists = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('User not found');
      throw new ConflictException('This user is not blocked');
    }
    return this.findByIdSafe(userId);
  }
}
