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

    let cancellationReason: string | null = null;
    try {
      // Parse body if present
      const body = await req.json();
      cancellationReason = body.cancellationReason || null;
    } catch (e) {
      // Body is empty or not JSON, which is fine
    }

    // 2. Find the user's active subscription
    const subscription = await prisma.subscription.findFirst({
      where: { 
        userId: user.id,
        status: "ACTIVE"
      },
      orderBy: { createdAt: "desc" },
    });

    if (!subscription) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
    }

    if (subscription.cancelAtPeriodEnd) {
      return NextResponse.json({ message: "Subscription is already scheduled to cancel", subscription }, { status: 200 });
    }

    // 3. Update the subscription to cancel at period end
    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true,
        cancellationReason: cancellationReason,
      },
    });

    return NextResponse.json({
      message: "Subscription successfully scheduled for cancellation",
      subscription: updatedSubscription,
    });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
