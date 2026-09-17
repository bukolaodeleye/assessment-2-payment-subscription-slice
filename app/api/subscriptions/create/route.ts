import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { cookies } from "next/headers";

// Simple in-memory rate limiting map
// Note: In serverless environments, this state is isolated per instance.
// It is highly effective against burst attacks on a single lambda.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 3;

export async function POST(req: NextRequest) {
  try {
    // --- 1. Authentication & Session Validation ---
    const cookieStore = await cookies();
    // Check for common session cookie names
    const sessionCookie = cookieStore.get("sessionId") || cookieStore.get("session");
    
    if (!sessionCookie?.value) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionValue = sessionCookie.value;

    // Based on the schema having `tokenHash`, we hash the cookie value to find the session
    // (Common practice for secure session storage)
    const tokenHash = crypto.createHash("sha256").update(sessionValue).digest("hex");

    // Look up the session in the database
    // We also fallback to checking by ID in case the cookie stores the direct Session ID
    const session = await prisma.session.findFirst({
      where: {
        OR: [
          { tokenHash: tokenHash },
          { id: sessionValue }
        ],
        expiresAt: {
          gt: new Date() // Ensure session is not expired
        }
      },
      include: {
        user: true,
      },
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user;

    // --- 1.5 Rate Limiting ---
    const now = Date.now();
    const userRateData = rateLimitMap.get(user.id);

    if (userRateData) {
      if (now > userRateData.resetTime) {
        // Time window expired, reset their counter
        rateLimitMap.set(user.id, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
      } else {
        if (userRateData.count >= MAX_REQUESTS_PER_WINDOW) {
          console.warn(`Rate limit exceeded for user ${user.id}`);
          return NextResponse.json(
            { error: "Too many checkout attempts. Please wait a moment before trying again." }, 
            { status: 429 }
          );
        }
        // Increment their counter
        userRateData.count += 1;
        rateLimitMap.set(user.id, userRateData);
      }
    } else {
      // First request from this user in the current window
      rateLimitMap.set(user.id, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    }

    // --- 2. Request Parsing ---
    let planId: string | null = null;
    const contentType = req.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      const body = await req.json();
      planId = body.planId;
    } else {
      const formData = await req.formData();
      planId = formData.get("planId") as string;
    }

    if (!planId) {
      return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    }

    // --- 3. Plan Validation ---
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // --- 4. Subscription & Payment Creation ---
    const startDate = new Date();
    const endDate = new Date(startDate);
    if (plan.interval === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const result = await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: "PENDING",
          currentPeriodStart: startDate,
          currentPeriodEnd: endDate,
        },
      });

      const paymentLog = await tx.paymentLog.create({
        data: {
          userId: user.id,
          subscriptionId: subscription.id,
          providerReference: `ref_${crypto.randomUUID()}`,
          eventType: "PAYMENT_INITIATED",
          amount: plan.amount,
          currency: "NGN",
          status: "PENDING",
        },
      });

      return { subscription, paymentLog };
    });

    // --- 5. Initialize Paystack Transaction ---
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) {
      console.error("PAYSTACK_SECRET_KEY is missing in environment");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const paystackPayload = {
      email: user.email,
      amount: plan.amount, // already in kobo (minor units)
      reference: result.paymentLog.providerReference,
      currency: "NGN",
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/billing`,
    };

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paystackPayload),
    });

    if (!paystackRes.ok) {
      const errorData = await paystackRes.text();
      console.error("Paystack initialization failed:", errorData);
      return NextResponse.json({ error: "Failed to initialize payment gateway" }, { status: 500 });
    }

    const paystackData = await paystackRes.json();
    
    // --- 6. Redirect the browser to Paystack checkout ---
    // HTTP 303 See Other is ideal for redirecting after a successful POST
    return NextResponse.redirect(paystackData.data.authorization_url, 303);
  } catch (error) {
    console.error("Error creating subscription:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
