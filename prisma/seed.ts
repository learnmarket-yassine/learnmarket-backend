import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface CategorySeed {
  name: string;
  specialties: string[];
  skills: string[];
}

const CATEGORIES: CategorySeed[] = [
  {
    name: 'Programming & Web Development',
    specialties: [
      'Web Development',
      'Mobile Development',
      'Data Science',
      'DevOps',
      'Game Development',
    ],
    skills: [
      'JavaScript',
      'TypeScript',
      'Python',
      'React',
      'Node.js',
      'SQL',
      'Java',
      'HTML/CSS',
      'Git',
    ],
  },
  {
    name: 'Languages',
    specialties: ['English', 'French', 'Spanish', 'Arabic', 'German'],
    skills: [
      'English Conversation',
      'Grammar',
      'IELTS Preparation',
      'Business English',
      'Translation',
    ],
  },
  {
    name: 'Mathematics',
    specialties: ['Algebra', 'Calculus', 'Statistics', 'Geometry'],
    skills: ['Algebra', 'Calculus', 'Statistics', 'Geometry', 'Probability'],
  },
  {
    name: 'Music',
    specialties: ['Piano', 'Guitar', 'Singing', 'Music Theory'],
    skills: [
      'Piano',
      'Guitar',
      'Music Theory',
      'Vocal Training',
      'Music Production',
    ],
  },
  {
    name: 'Business & Marketing',
    specialties: [
      'Digital Marketing',
      'Entrepreneurship',
      'Accounting',
      'Project Management',
    ],
    skills: [
      'SEO',
      'Social Media Marketing',
      'Financial Analysis',
      'Public Speaking',
      'Business Strategy',
    ],
  },
  {
    name: 'Design',
    specialties: ['Graphic Design', 'UI/UX Design', 'Illustration'],
    skills: [
      'Figma',
      'Adobe Photoshop',
      'Illustration',
      'UI Design',
      'Typography',
    ],
  },
];

async function main() {
  const skillIdByName = new Map<string, string>();

  for (const categorySeed of CATEGORIES) {
    const name = categorySeed.name;
    const slug = slugify(name);

    const category = await prisma.category.upsert({
      where: { slug },
      update: { name, isActive: true },
      create: { name, slug, isActive: true },
    });
    console.log(`Category: ${category.name}`);

    for (const specialtyName of categorySeed.specialties) {
      const specialtySlug = slugify(specialtyName);
      await prisma.specialty.upsert({
        where: {
          categoryId_slug: { categoryId: category.id, slug: specialtySlug },
        },
        update: { name: specialtyName, isActive: true },
        create: {
          categoryId: category.id,
          name: specialtyName,
          slug: specialtySlug,
          isActive: true,
        },
      });
    }
    console.log(`  + ${categorySeed.specialties.length} specialties`);

    const skillIds: string[] = [];
    for (const skillName of categorySeed.skills) {
      let skillId = skillIdByName.get(skillName);
      if (!skillId) {
        const skill = await prisma.skill.upsert({
          where: { name: skillName },
          update: { isActive: true },
          create: { name: skillName, isActive: true },
        });
        skillId = skill.id;
        skillIdByName.set(skillName, skillId);
      }
      skillIds.push(skillId);
    }

    for (const skillId of skillIds) {
      await prisma.categorySkill.upsert({
        where: { categoryId_skillId: { categoryId: category.id, skillId } },
        update: {},
        create: { categoryId: category.id, skillId },
      });
    }
    console.log(`  + ${skillIds.length} linked skills`);
  }

  console.log('Seed complete.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
