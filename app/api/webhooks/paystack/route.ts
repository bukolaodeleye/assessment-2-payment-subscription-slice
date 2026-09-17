import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    // 1. Read raw body and header for Paystack signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature header" }, { status: 401 });
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      console.error("PAYSTACK_SECRET_KEY is not configured in environment variables");
      return NextResponse.json({ error: "Internal server configuration error" }, { status: 500 });
    }

    // 2. Compute HMAC SHA-512 expected signature
    const expectedSignature = crypto
      .createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex");

    // 3. Compare signatures securely
    if (signature !== expectedSignature) {
      console.error("Paystack webhook signature mismatch - potential spoofing attempt");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 4. Parse verified payload
    const payload = JSON.parse(rawBody);

    // 5. Process charge.success events
    if (payload.event === "charge.success") {
      const data = payload.data;
      const providerReference = data.reference; // Paystack's reference matches our providerReference

      if (!providerReference) {
        return NextResponse.json({ error: "Missing reference in payload data" }, { status: 400 });
      }

      // Reuse existing payment verification logic with strong idempotency check
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

      // Execute atomic activation transaction
      await prisma.$transaction(async (tx) => {
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
      });
      
      console.log(`Successfully processed Paystack charge.success for ${providerReference}`);
    }

    // 6. Return 200 OK so Paystack knows we successfully received it
    return NextResponse.json({ status: "success" }, { status: 200 });

  } catch (error) {
    console.error("Error processing Paystack webhook:", error);
    return NextResponse.json(
      { error: "Internal server error during webhook processing" },
      { status: 500 }
    );
  }
}
