import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    await prisma.plan.createMany({
        data: [
            {
                name: "Free",
                interval: "monthly",
                amount: 0,
                currency: "NGN",
            },
            {
                name: "Pro Monthly",
                interval: "monthly",
                amount: 200000,
                currency: "NGN",
            },
            {
                name: "Pro Yearly",
                interval: "yearly",
                amount: 2000000,
                currency: "NGN",
            },
        ],
    });

    console.log("Plans created successfully");
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });