import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PACKAGES = [
  { name: 'Starter Pack', amount: 10, priceCents: 999, currency: 'usd' },
  { name: 'Popular Pack', amount: 40, priceCents: 3499, currency: 'usd' },
  { name: 'Pro Pack', amount: 100, priceCents: 7999, currency: 'usd' },
];

async function main() {
  for (const pkg of PACKAGES) {
    const existing = await prisma.connectsPackage.findFirst({
      where: { name: pkg.name },
    });
    if (existing) {
      console.log(`Skipping "${pkg.name}" — already exists`);
      continue;
    }

    const created = await prisma.connectsPackage.create({ data: pkg });
    console.log(
      `Created package "${created.name}" (${created.amount} connects, $${(
        created.priceCents / 100
      ).toFixed(2)})`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
