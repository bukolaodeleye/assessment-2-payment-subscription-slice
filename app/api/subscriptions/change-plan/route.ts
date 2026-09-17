import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication & Session Validation
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("sessionId") || cookieStore.get("session");
    
    if (!sessionCookie?.value) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionValue = sessionCookie.value;
    const tokenHash = crypto.createHash("sha256").update(sessionValue).digest("hex");

    const session = await prisma.session.findFirst({
      where: {
        OR: [
          { tokenHash: tokenHash },
          { id: sessionValue }
        ],
        expiresAt: { gt: new Date() }
      },
      include: {
        user: true,
      },
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user;

    // 2. Parse Request
    let newPlanId: string | null = null;
    const contentType = req.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      const body = await req.json();
      newPlanId = body.newPlanId;
    } else {
      const formData = await req.formData();
      newPlanId = formData.get("newPlanId") as string;
    }

    if (!newPlanId) {
      return NextResponse.json({ error: "Missing newPlanId" }, { status: 400 });
    }

    // 3. Fetch Plans and Current Subscription
    const newPlan = await prisma.plan.findUnique({
      where: { id: newPlanId }
    });

    if (!newPlan) {
      return NextResponse.json({ error: "New plan not found" }, { status: 404 });
    }

    const activeSubscription = await prisma.subscription.findFirst({
      where: { 
        userId: user.id,
        status: "ACTIVE" 
      },
      orderBy: { createdAt: "desc" },
      include: { plan: true }
    });

    if (!activeSubscription) {
      return NextResponse.json({ error: "No active subscription found to change" }, { status: 400 });
    }

    const oldPlan = activeSubscription.plan;

    if (oldPlan.id === newPlan.id) {
      return NextResponse.json({ error: "User is already on this plan" }, { status: 400 });
    }

    const now = new Date();

    // 4. Determine UPGRADE or DOWNGRADE based on plan amount
    if (newPlan.amount > oldPlan.amount) {
      // --- UPGRADE BEHAVIOUR ---
      
      const currentStart = activeSubscription.currentPeriodStart.getTime();
      const currentEnd = activeSubscription.currentPeriodEnd.getTime();
      const totalPeriodMs = currentEnd - currentStart;
      const remainingMs = currentEnd - now.getTime();
      
      // Ensure we don't have negative remaining time
      const validRemainingMs = Math.max(0, remainingMs);
      
      // Calculate unused value safely using floor division for integer money handling
      const unusedValue = Math.floor((validRemainingMs / totalPeriodMs) * oldPlan.amount);
      const finalAmountPayable = Math.max(0, newPlan.amount - unusedValue);

      // Determine new period dates
      const newStartDate = now;
      const newEndDate = new Date(newStartDate);
      if (newPlan.interval === "yearly") {
        newEndDate.setFullYear(newEndDate.getFullYear() + 1);
      } else {
        newEndDate.setMonth(newEndDate.getMonth() + 1);
      }

      const result = await prisma.$transaction(async (tx) => {
        const pendingSubscription = await tx.subscription.create({
          data: {
            userId: user.id,
            planId: newPlan.id,
            status: "PENDING_UPGRADE",
            currentPeriodStart: newStartDate,
            currentPeriodEnd: newEndDate,
            cancelAtPeriodEnd: false,
          }
        });

        const paymentLog = await tx.paymentLog.create({
          data: {
            userId: user.id,
            subscriptionId: pendingSubscription.id,
            providerReference: `ref_upgrade_${crypto.randomUUID()}`,
            eventType: "PLAN_UPGRADE_INITIATED",
            amount: finalAmountPayable,
            currency: "NGN",
            status: "PENDING", 
          }
        });

        return { pendingSubscription, paymentLog };
      });

      return NextResponse.json({
        message: "Successfully upgraded subscription",
        oldPlan: oldPlan.name,
        newPlan: newPlan.name,
        calculation: {
          totalPeriodDays: Math.round(totalPeriodMs / (1000 * 60 * 60 * 24)),
          remainingDays: Math.round(validRemainingMs / (1000 * 60 * 60 * 24)),
          unusedValue,
          newPlanCharge: newPlan.amount,
          finalAmountPayable
        },
        pendingSubscription: result.pendingSubscription,
        paymentLog: result.paymentLog
      });

    } else {
      // --- DOWNGRADE BEHAVIOUR ---

      // Determine the start/end dates for the upcoming scheduled subscription
      const scheduledStartDate = activeSubscription.currentPeriodEnd;
      const scheduledEndDate = new Date(scheduledStartDate);
      if (newPlan.interval === "yearly") {
        scheduledEndDate.setFullYear(scheduledEndDate.getFullYear() + 1);
      } else {
        scheduledEndDate.setMonth(scheduledEndDate.getMonth() + 1);
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1. Cancel the current subscription at period end
        const cancelledSubscription = await tx.subscription.update({
          where: { id: activeSubscription.id },
          data: {
            cancelAtPeriodEnd: true,
          }
        });

        // 2. Create the scheduled subscription for the downgrade
        const scheduledSubscription = await tx.subscription.create({
          data: {
            userId: user.id,
            planId: newPlan.id,
            status: "SCHEDULED", // A custom status indicating it's waiting for period end
            currentPeriodStart: scheduledStartDate,
            currentPeriodEnd: scheduledEndDate,
            cancelAtPeriodEnd: false,
          }
        });

        // 3. (Removed PaymentLog creation for scheduled intent as it is not a financial event)

        return { cancelledSubscription, scheduledSubscription };
      });

      return NextResponse.json({
        message: "Successfully scheduled subscription downgrade",
        oldPlan: oldPlan.name,
        newPlan: newPlan.name,
        calculation: {
          unusedValue: 0,
          finalAmountPayable: 0,
          note: "Downgrade is scheduled for the end of the current billing cycle. No immediate charges apply."
        },
        updatedSubscription: result.cancelledSubscription,
        scheduledSubscription: result.scheduledSubscription
      });
    }

  } catch (error) {
    console.error("Error changing subscription plan:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
