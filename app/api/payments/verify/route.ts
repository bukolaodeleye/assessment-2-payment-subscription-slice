import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    // 1. Parse providerReference from JSON or FormData
    let providerReference: string | null = null;
    const contentType = req.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      const body = await req.json();
      providerReference = body.providerReference;
    } else {
      const formData = await req.formData();
      providerReference = formData.get("providerReference") as string;
    }

    if (!providerReference) {
      return NextResponse.json({ error: "Missing providerReference" }, { status: 400 });
    }

    // 2. Find the PaymentLog record
    const paymentLog = await prisma.paymentLog.findUnique({
      where: { providerReference },
    });

    if (!paymentLog) {
      return NextResponse.json({ error: "PaymentLog not found" }, { status: 404 });
    }

    if (!paymentLog.subscriptionId) {
      return NextResponse.json({ error: "PaymentLog is not linked to any subscription" }, { status: 400 });
    }

    if (paymentLog.status === "SUCCESS") {
      return NextResponse.json({ message: "Payment already verified" }, { status: 200 });
    }

    // 3. Update PaymentLog and Subscription within a Prisma transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update the PaymentLog
      const updatedPaymentLog = await tx.paymentLog.update({
        where: { id: paymentLog.id },
        data: {
          status: "SUCCESS",
          eventType: "PAYMENT_VERIFIED",
        },
      });

      // Update the linked Subscription
      const updatedSubscription = await tx.subscription.update({
        where: { id: paymentLog.subscriptionId! },
        data: {
          status: "ACTIVE",
        },
      });

      // If this was an upgrade, we must safely retire the previous active subscription
      if (paymentLog.eventType === "PLAN_UPGRADE_INITIATED") {
        await tx.subscription.updateMany({
          where: {
            userId: paymentLog.userId,
            status: "ACTIVE",
            id: { not: updatedSubscription.id }
          },
          data: {
            status: "CANCELED",
          }
        });
      }

      return { updatedPaymentLog, updatedSubscription };
    });

    // 4. Return the JSON response
    return NextResponse.json({
      message: "Payment verification successful",
      paymentLog: result.updatedPaymentLog,
      subscription: result.updatedSubscription,
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
