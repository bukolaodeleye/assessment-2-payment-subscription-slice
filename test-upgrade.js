const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const sessionId = 'c8afd72b-bef6-43ec-8249-6ac7142a7c69';
  const yearlyPlan = await prisma.plan.findFirst({ where: { name: 'Pro Yearly' } });
  
  if (!yearlyPlan) return console.log('Pro Yearly plan not found');
  const newPlanId = yearlyPlan.id; 

  const response = await fetch('http://localhost:3000/api/subscriptions/change-plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': 'sessionId=' + sessionId
    },
    body: JSON.stringify({ newPlanId })
  });

  const text = await response.text();
  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
  } catch (e) {
    console.log('Status:', response.status);
    console.log(text);
  }
}
run().finally(() => prisma.$disconnect());
