import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * BACKGROUND CRON PROCESSOR:
 * 
 * This endpoint is explicitly designed for background execution (Cron).
 * 
 * WHY BACKGROUND PROCESSING IS REQUIRED:
 * When a user schedules a downgrade, the system does not alter their current ACTIVE 
 * subscription to ensure they retain premium access until the exact millisecond their 
 * paid billing cycle lapses. Instead, a new SCHEDULED subscription is created.
 * Because Next.js serverless functions cannot run persistent daemons, this endpoint 
 * must be hit periodically (e.g., daily at midnight via Vercel Cron) to safely 
 * sweep the database and execute the transition when the time arrives.
 */

async function processScheduledSubscriptions(req: NextRequest) {
  try {
    // 1. Cron Protection (Basic Authorization)
    // In production, this would be triggered by Vercel Cron with a secure CRON_SECRET.
    const authHeader = req.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET || "development-cron-secret";
    
    if (authHeader !== `Bearer ${expectedSecret}` && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
    }

    const now = new Date();

    // 2. Find all subscriptions that are SCHEDULED and ready to activate
    const readyToActivate = await prisma.subscription.findMany({
      where: {
        status: "SCHEDULED",
        currentPeriodStart: {
          lte: now, // The scheduled start date is in the past or exactly now
        },
      },
    });

    if (readyToActivate.length === 0) {
      return NextResponse.json({ message: "No scheduled subscriptions require processing at this time.", processedCount: 0 });
    }

    const processedIds: string[] = [];

    // 3. Process each transition safely inside isolated transactions
    for (const scheduledSub of readyToActivate) {
      await prisma.$transaction(async (tx) => {
        // Find the user's previously active subscription that was marked to cancel
        const expiringSubscription = await tx.subscription.findFirst({
          where: {
            userId: scheduledSub.userId,
            status: "ACTIVE",
            cancelAtPeriodEnd: true,
          },
        });

        // Deactivate the old subscription safely
        if (expiringSubscription) {
          await tx.subscription.update({
            where: { id: expiringSubscription.id },
            data: { status: "CANCELED" },
          });
        }

        // Activate the new scheduled subscription (Idempotent: Only targets SCHEDULED status)
        await tx.subscription.update({
          where: { id: scheduledSub.id },
          data: { status: "ACTIVE" },
        });

        processedIds.push(scheduledSub.id);
      });
    }

    return NextResponse.json({
      message: "Successfully processed scheduled subscriptions.",
      processedCount: processedIds.length,
      processedIds,
    });

  } catch (error) {
    console.error("Cron Processing Error:", error);
    return NextResponse.json(
      { error: "Internal server error during cron processing" },
      { status: 500 }
    );
  }
}

// Export both GET and POST for maximum compatibility with different cron schedulers
export const GET = processScheduledSubscriptions;
export const POST = processScheduledSubscriptions;
