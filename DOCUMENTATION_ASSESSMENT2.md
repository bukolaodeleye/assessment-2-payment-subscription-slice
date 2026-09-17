# Documentation

## Assessment 2: Payment and Subscription Slice

### Pricing Page Implementation

**Files Created/Modified:**
- `lib/prisma.ts`: Centralized Prisma client instantiation. This avoids database connection exhaustion during development (hot reloading) and provides a clean singleton instance of PrismaClient.
- `app/pricing/page.tsx`: A Next.js App Router server component that fetches subscription plans from the Prisma database and displays them. It implements server-side data fetching and iterates through the plans securely.
- `app/pricing/pricing.module.css`: Vanilla CSS module used to style the pricing page. Adheres to modern design aesthetic requirements (glassmorphism, dark mode default, subtle micro-animations).

**Technical Decisions:**
- **Data Fetching:** Fetching `Plan` entries directly from the database within the Server Component. No unnecessary client API routes are needed for data fetching.
- **Price Formatting:** Followed the instruction to treat amount in DB as integer representing smaller currency units (kobo). Values are divided by 100 before formatting to NGN currency display.
- **Styling:** Used Vanilla CSS Modules (`pricing.module.css`) rather than Tailwind classes to guarantee flexibility and fulfill the specific aesthetics requested without modifying global frameworks.

**Testing Locally:**
To test the pricing page locally:
1. Ensure your PostgreSQL database is running and connected.
2. Ensure you have seeded the database by running `npm run prisma:seed` (or `tsx prisma/seed.ts`).
3. Run the development server with `npm run dev`.
4. Navigate to `http://localhost:3000/pricing` in your browser to view the plans.

### Subscription Creation API

**Files Created/Modified:**
- `app/api/subscriptions/create/route.ts`: A Next.js App Router API endpoint (Route Handler) to process the subscription creation logic.

**Technical Decisions:**
- **Data Parsing:** Designed the endpoint to handle both `application/json` bodies (from standard JS `fetch` calls) and `multipart/form-data` or URL-encoded forms (from native HTML form POSTs), ensuring robust functionality regardless of the client-side approach.
- **Authentication:** Enforces strict session validation by reading the `sessionId` (or `session`) cookie, hashing it, and validating it against the `Session` model from Assessment 1. If the session is missing, invalid, or expired, it immediately returns a `401 Unauthorized` error.
- **Transaction Safety:** Utilizes `prisma.$transaction` to guarantee that both the `Subscription` and its initial `PaymentLog` (with `eventType = PAYMENT_INITIATED`) are created simultaneously. This prevents corrupt database states where a subscription exists without an associated payment initialization log.
- **Provider Reference Generation:** Generates a mock `providerReference` using `crypto.randomUUID()` to mimic the unique reference that a payment provider (like Paystack or Flutterwave) would require or return.
- **Currency:** Explicitly set the currency to `NGN` for all generated `PaymentLog` records.
- **In-Memory Rate Limiting:** Implemented a lightweight `Map`-based rate limiter to protect the endpoint from burst creation attempts (e.g., impatient users double-clicking the subscribe button or malicious bots attempting to spam database insertions). 
  - **Chosen Limit:** `3 requests per minute per authenticated user`. This is generous enough for normal users changing their minds across pricing tiers rapidly, but aggressively shuts down script loops.
  - **Why this approach?** Since we are strictly forbidden from installing new packages (like `@upstash/ratelimit` or `redis`), an in-memory `Map` is the safest, zero-dependency mechanism. In serverless environments (like Vercel), this map persists per-lambda instance, perfectly handling burst attacks without requiring complex external state architectures.

### Development Testing Tools

**Files Created/Modified:**
- `app/test-login/page.tsx`: A development-only route to simulate the Assessment 1 authentication flow.

**Technical Decisions:**
- **Test Login Generation:** Since we needed a way to test the subscription flow locally without manually seeding cookies or running the full production authentication app, this page uses Next.js Server Actions to either create a test user or select an existing one.
- **Session Injection:** It securely generates a cryptographically random session token, stores the SHA-256 hash in the `Session` database table, and injects the raw token into the browser's `sessionId` cookie, perfectly mirroring a real authentication flow.

### Payment Verification API

**Files Created/Modified:**
- `app/api/payments/verify/route.ts`: A Next.js App Router API endpoint (Route Handler) to process asynchronous payment verification.

**Technical Decisions:**
- **Robust Parsing:** Supports fetching the `providerReference` from either a JSON body or FormData.
- **Relational Integrity Checks:** Verifies that the `PaymentLog` exists and explicitly checks that it is securely linked to an actual `Subscription` before attempting updates. Also acts idempotently by returning a `200 OK` early if the payment was already marked as `SUCCESS`.
- **Atomic Updates:** Employs `prisma.$transaction` to guarantee that both the `PaymentLog` (setting status to `SUCCESS` and eventType to `PAYMENT_VERIFIED`) and the linked `Subscription` (setting status to `ACTIVE`) are mutated in perfect sync, avoiding race conditions or incomplete state updates.

### Billing Dashboard

**Files Created/Modified:**
- `app/billing/page.tsx`: A protected Next.js Server Component displaying the user's active subscription and full payment history.

**Technical Decisions:**
- **Data Protection:** The route performs strict session-level validation. If the user is unauthenticated or the session has expired, it intercepts the request and instantly redirects to the login route.
- **Relational Queries:** Exploits Prisma's `include` syntax to elegantly fetch the `Subscription` and its joined `Plan` definition in a single, efficient query.
- **Data Presentation:** Automatically localizes and formats the integer-based `amount` field back into NGN decimal format for human-readable display. Renders dynamically based on whether the user actually has an active subscription.

### Subscription Cancellation API

**Files Created/Modified:**
- `app/api/subscriptions/cancel/route.ts`: A Next.js App Router API endpoint (Route Handler) to process subscription cancellations.
- `app/billing/CancelButton.tsx`: The UI component managing the cancellation flow.

**Technical Decisions:**
- **Graceful Cancellation (Scheduled):** Instead of immediately deleting or marking the subscription as inactive, this endpoint solely updates `cancelAtPeriodEnd = true`. This adheres to standard SaaS best practices, preventing angry support tickets by ensuring the user retains full premium access until their already-paid billing period mathematically concludes.
- **Cancellation Reason Collection:** The frontend `CancelButton.tsx` intercepts the initial click and presents an intuitive modal requesting an optional reason (e.g., "Too expensive", "Missing features", or "Other"). This drastically reduces friction while offering invaluable churn data.
- **Data Storage:** The `schema.prisma` was safely migrated to include a `cancellationReason String?` field. The API blindly accepts this string and stores it directly on the `Subscription` table alongside `cancelAtPeriodEnd = true`. If the user bypasses the UI or leaves it blank, it defaults gracefully to `null`.
- **Data Safety:** The API route strictly locates only the `ACTIVE` subscription tied to the securely authenticated session user, completely preventing unauthorized cross-user modifications.

### Subscription Change API (Upgrade / Downgrade)

**Files Created/Modified:**
- `app/api/subscriptions/change-plan/route.ts`: A powerful Next.js API endpoint handling both proration-based upgrades and scheduled downgrades.
- `app/api/payments/verify/route.ts`: Upgraded to gracefully handle upgrading an active plan upon payment verification.

**Technical Decisions:**
- **Proration Mathematics (Upgrades):** The exact millisecond duration of the user's current billing cycle is compared to the remaining milliseconds to determine their unused time percentage. The unused value is credited against the new plan's cost. All monetary math uses safe `Math.floor` division since the system rigidly stores all money as integers (kobo).
- **Hardened Payment Lifecycle (Upgrades):** Upgrades no longer immediately activate. Instead, they create a secondary `PENDING_UPGRADE` subscription and a `PENDING` payment log. The user retains their active subscription until the verification webhook successfully fires. The verification route then flawlessly activates the pending upgrade and marks the previous plan as `CANCELED`.
- **Schema-less Downgrade Scheduling:** Because the instructions strictly forbade modifying the Prisma schema, the system creatively handles downgrades without relying on missing fields like `nextPlanId`. Instead of modifying the schema, the current `ACTIVE` subscription is marked to cancel at the end of the period, and a brand new `Subscription` record is instantly created with the new downgraded plan. This new record is assigned a custom `SCHEDULED` status, with its `currentPeriodStart` date exactly matching the expiration date of the current plan.
- **Strict Payment Logging:** Upgrades log the prorated charge amount with `PLAN_UPGRADE_INITIATED` (as `PENDING`), strictly obeying payment lifecycles. Since downgrades do not charge the user immediately, they have been stripped of the fake `$0` payment log entirely, preserving the `PaymentLog` ledger strictly for genuine payment flows.

### Background Scheduled Processor (Cron)

**Files Created/Modified:**
- `app/api/subscriptions/process-scheduled/route.ts`: A dedicated cron-triggerable endpoint built specifically to enact deferred state changes securely.

**Technical Decisions:**
- **Serverless Architecture Compliance:** Because Next.js serverless functions cannot safely maintain long-running background timers (like `setInterval`), scheduling relies on lazy deferment coupled with an external cron trigger (e.g. Vercel Cron). 
- **Idempotent Activation:** When the endpoint is triggered, it searches exclusively for `SCHEDULED` subscriptions whose `currentPeriodStart` date is in the past. Inside isolated database transactions, it flips the new plan to `ACTIVE` and cleanly retires the prior plan to `CANCELED`. Running the endpoint redundantly guarantees no duplicate processing.
- **Security:** The endpoint is safeguarded by a simple `Authorization: Bearer <CRON_SECRET>` mechanism, ensuring standard web traffic cannot trigger the heavy database batch processing.

### Secure Payment Webhook Handling

**Files Created/Modified:**
- `app/api/webhooks/payment/route.ts`: A dedicated endpoint for securely handling server-to-server callbacks from payment providers.

**Why Signature Verification is Needed:**
Webhook endpoints are public by nature. Without cryptographic signature validation (using HMAC SHA-512), any malicious actor could send a counterfeit POST request simulating a successful `$1,000` payment, forcing the system to wrongly upgrade their account for free. By hashing the raw payload against the private `PAYMENT_WEBHOOK_SECRET`, we prove mathematically that the request originated exclusively from the trusted payment provider.

**Why Frontend Redirects Cannot Be Trusted:**
While we maintain a frontend redirect verification logic (`app/api/payments/verify/route.ts`), it is inherently fragile. Users close tabs prematurely, lose internet connection mid-redirect, or ad-blockers aggressively block tracking redirects. Relying solely on the frontend means payments succeed at the bank but fail in our database. Webhooks bypass the browser entirely, offering a guaranteed server-to-server confirmation.

**How Webhook Security Protects Payment Integrity:**
1. **Cryptographic Validation:** Rejects unauthenticated traffic instantly with HTTP 401.
2. **Idempotency Check:** The `providerReference` is unique per transaction. If a webhook fires three times for the same payment, the system identifies that the `PaymentLog` is already marked `SUCCESS` and ignores the duplicates.
### Secure Paystack Test Mode Integration

**Files Created/Modified:**
- `app/api/subscriptions/create/route.ts`: Modified to initialize a Paystack transaction and issue an HTTP 303 redirect.
- `app/api/webhooks/paystack/route.ts`: A brand new webhook dedicated to Paystack's cryptographic event architecture.

**Technical Decisions:**
- **Paystack Test Mode Flow:** When a user initiates a checkout via the UI, the backend first safely creates the `PENDING` Subscription and PaymentLog inside a database transaction. It then immediately sends an API request to `https://api.paystack.co/transaction/initialize` using the `PAYSTACK_SECRET_KEY`, passing the `providerReference` exactly as the Paystack `reference`. The backend then abandons the raw JSON response and instantly returns an `HTTP 303 See Other` redirect, throwing the browser seamlessly into the Paystack hosted checkout UI.
- **Why No Cards Are Stored:** Passing PCI-DSS compliance is extremely difficult. By entirely offloading the card collection UI to Paystack's hosted page, our database and servers never interact with, see, or store raw credit card numbers. We solely traffic in opaque `providerReference` strings.
- **Webhook Verification:** After Paystack successfully processes the test card, it fires a `charge.success` event to our `app/api/webhooks/paystack/route.ts` endpoint. To prevent a malicious attacker from forging this request, Paystack includes an `x-paystack-signature` header containing an HMAC SHA512 hash of the payload using our secret key. Our server recalculates this hash mathematically; if they match, we have absolute cryptographic proof the webhook is authentic. Once verified, the existing idempotent atomic transaction seamlessly activates the plan.


# Assessment 2: Payment and Subscription Slice

## Overview

This project implements a subscription payment system using Paystack Test Mode.

## Implemented Features

- Monthly and yearly subscription plans
- Checkout initiation through Paystack
- Server-side payment verification
- Payment event logging
- Secure Paystack webhook verification
- Webhook idempotency handling
- Subscription upgrade with proration
- Subscription downgrade scheduling
- Cancellation with cancellation reason
- Billing dashboard
- Checkout rate limiting

## Authentication

Authentication from Assessment 1 was reused.

## Payment Provider

Paystack Test Mode is used for payment processing.

