import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const firstname = process.env.ADMIN_FIRSTNAME ?? 'Admin';
  const lastname = process.env.ADMIN_LASTNAME ?? 'User';

  if (!email || !password) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD env vars are required to seed the admin user.',
    );
  }

  const passwordHash = await argon2.hash(password);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password: passwordHash,
      firstname,
      lastname,
      role: UserRole.ADMIN,
    },
  });

  console.log(`Admin user ready: ${admin.email} (${admin.id})`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
