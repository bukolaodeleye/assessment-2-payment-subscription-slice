const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const sub = await prisma.subscription.findFirst({
    where: { userId: '61a720a6-4e95-464f-9834-6e2c4be5f4f2', status: 'ACTIVE' },
    include: { plan: true }
  });
  console.log('Current Active Plan ID:', sub.plan.id, 'Name:', sub.plan.name);
}
main().finally(() => prisma.$disconnect());
