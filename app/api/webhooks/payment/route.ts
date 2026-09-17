import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    // 1. Read raw body and header for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-payment-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature header" }, { status: 401 });
    }

    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) {
      console.error("PAYMENT_WEBHOOK_SECRET is not configured in environment variables");
      return NextResponse.json({ error: "Internal server configuration error" }, { status: 500 });
    }

    // 2. Compute HMAC SHA-512 expected signature
    const expectedSignature = crypto
      .createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex");

    // 3. Compare signatures securely
    // This prevents malicious actors from sending fake webhooks
    if (signature !== expectedSignature) {
      console.error("Webhook signature mismatch - potential spoofing attempt");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 4. Parse verified payload
    const payload = JSON.parse(rawBody);
    const providerReference = payload.providerReference;

    if (!providerReference) {
      return NextResponse.json({ error: "Missing providerReference in payload" }, { status: 400 });
    }

    // 5. Reuse existing payment verification logic with strong idempotency check
    const paymentLog = await prisma.paymentLog.findUnique({
      where: { providerReference },
    });

    if (!paymentLog) {
      return NextResponse.json({ error: "PaymentLog not found" }, { status: 404 });
    }

    if (!paymentLog.subscriptionId) {
      return NextResponse.json({ error: "PaymentLog is not linked to any subscription" }, { status: 400 });
    }

    // IDEMPOTENCY GUARD: Prevent duplicate processing if the webhook fires multiple times
    if (paymentLog.status === "SUCCESS") {
      return NextResponse.json({ message: "Webhook already processed successfully" }, { status: 200 });
    }

    // 6. Execute atomic activation transaction
    const result = await prisma.$transaction(async (tx) => {
      // Mark the PaymentLog as successful
      const updatedPaymentLog = await tx.paymentLog.update({
        where: { id: paymentLog.id },
        data: {
          status: "SUCCESS",
          eventType: "PAYMENT_VERIFIED", 
        },
      });

      // Activate the linked Subscription
      const updatedSubscription = await tx.subscription.update({
        where: { id: paymentLog.subscriptionId! },
        data: {
          status: "ACTIVE",
        },
      });

      // If this was an upgrade payment, seamlessly retire the old active plan
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

    // 7. Return 200 OK so the payment provider knows we successfully received it
    return NextResponse.json({
      message: "Webhook processed successfully",
      paymentLog: result.updatedPaymentLog,
    });

  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Internal server error during webhook processing" },
      { status: 500 }
    );
  }
}
