import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import Link from "next/link";
import CancelButton from "./CancelButton";
import DowngradeButton from "./DowngradeButton";
export default async function BillingPage() {
  // 1. Authentication & Session Validation
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("sessionId") || cookieStore.get("session");
  
  if (!sessionCookie?.value) {
    redirect("/test-login");
  }

  const sessionValue = sessionCookie.value;
  const tokenHash = crypto.createHash("sha256").update(sessionValue).digest("hex");

  const session = await prisma.session.findFirst({
    where: {
      OR: [
        { tokenHash: tokenHash },
        { id: sessionValue }
      ],
      expiresAt: {
        gt: new Date()
      }
    },
    include: {
      user: true,
    },
  });

  if (!session || !session.user) {
    redirect("/test-login");
  }

  const user = session.user;

  // 2. Fetch User's Subscriptions and Plans
  const activeSubscription = await prisma.subscription.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { plan: true },
  });

  const scheduledSubscription = await prisma.subscription.findFirst({
    where: { userId: user.id, status: "SCHEDULED" },
    include: { plan: true },
  });

  const allPlans = await prisma.plan.findMany({ orderBy: { amount: "asc" } });

  let availableDowngrades = [];
  if (activeSubscription && !activeSubscription.cancelAtPeriodEnd) {
    availableDowngrades = allPlans.filter(p => p.amount < activeSubscription.plan.amount);
  }

  // 3. Fetch User's Payment History
  const payments = await prisma.paymentLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#f3f4f6", padding: "4rem 2rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3rem" }}>
          <h1 style={{ fontSize: "2.5rem", fontWeight: "bold" }}>Billing Dashboard</h1>
          <p style={{ color: "#9ca3af" }}>Logged in as <strong style={{ color: "#fff" }}>{user.name}</strong></p>
        </header>

        {/* Current Subscription Section */}
        <section style={{ backgroundColor: "#171717", padding: "2rem", borderRadius: "12px", border: "1px solid #262626", marginBottom: "3rem" }}>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "1.5rem", borderBottom: "1px solid #333", paddingBottom: "0.5rem" }}>
            Current Subscription
          </h2>
          
          {activeSubscription ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
                <div>
                  <p style={{ color: "#9ca3af", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Plan Name</p>
                  <p style={{ fontSize: "1.125rem", fontWeight: "600", textTransform: "capitalize" }}>{activeSubscription.plan.name}</p>
                </div>
                <div>
                  <p style={{ color: "#9ca3af", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Status</p>
                  <span style={{ 
                    background: activeSubscription.status === "ACTIVE" ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)", 
                    color: activeSubscription.status === "ACTIVE" ? "#34d399" : "#fbbf24", 
                    padding: "0.25rem 0.75rem", 
                    borderRadius: "9999px", 
                    fontSize: "0.875rem", 
                    fontWeight: "600" 
                  }}>
                    {activeSubscription.status}
                  </span>
                </div>
                <div>
                  <p style={{ color: "#9ca3af", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Period Start</p>
                  <p>{new Date(activeSubscription.currentPeriodStart).toLocaleDateString()}</p>
                </div>
                <div>
                  <p style={{ color: "#9ca3af", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Period End</p>
                  <p>{new Date(activeSubscription.currentPeriodEnd).toLocaleDateString()}</p>
                </div>
                <div>
                  <p style={{ color: "#9ca3af", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Renews Automatically</p>
                  <p>{activeSubscription.cancelAtPeriodEnd ? "No (Cancels at period end)" : "Yes"}</p>
                </div>
              </div>
              
              {/* Conditional Cancel Button */}
              {activeSubscription.status === "ACTIVE" && !activeSubscription.cancelAtPeriodEnd && (
                <CancelButton />
              )}

              {/* Conditional Downgrade Button */}
              {activeSubscription.status === "ACTIVE" && !activeSubscription.cancelAtPeriodEnd && availableDowngrades.length > 0 && (
                <DowngradeButton availableDowngrades={availableDowngrades} />
              )}

              {/* Scheduled Downgrade Info */}
              {scheduledSubscription && (
                <div style={{ marginTop: "1.5rem", padding: "1.5rem", backgroundColor: "rgba(59, 130, 246, 0.1)", borderRadius: "8px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                  <h3 style={{ fontSize: "1.125rem", marginBottom: "0.5rem", color: "#60a5fa" }}>Downgrade Scheduled</h3>
                  <p style={{ color: "#9ca3af", fontSize: "0.875rem" }}>
                    You are scheduled to downgrade to the <strong>{scheduledSubscription.plan.name}</strong> plan on {new Date(scheduledSubscription.currentPeriodStart).toLocaleDateString()}.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div>
              <p style={{ color: "#9ca3af", marginBottom: "1rem" }}>You do not have an active subscription.</p>
              <Link href="/pricing" style={{ color: "#3b82f6", textDecoration: "none", fontWeight: "600" }}>
                View Plans &rarr;
              </Link>
            </div>
          )}
        </section>

        {/* Payment History Section */}
        <section style={{ backgroundColor: "#171717", padding: "2rem", borderRadius: "12px", border: "1px solid #262626" }}>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "1.5rem", borderBottom: "1px solid #333", paddingBottom: "0.5rem" }}>
            Payment History
          </h2>

          {payments.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#9ca3af", fontSize: "0.875rem", borderBottom: "1px solid #333" }}>
                    <th style={{ padding: "1rem 0" }}>Date</th>
                    <th style={{ padding: "1rem 0" }}>Reference</th>
                    <th style={{ padding: "1rem 0" }}>Amount</th>
                    <th style={{ padding: "1rem 0" }}>Event</th>
                    <th style={{ padding: "1rem 0" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(payment => (
                    <tr key={payment.id} style={{ borderBottom: "1px solid #262626" }}>
                      <td style={{ padding: "1rem 0" }}>{new Date(payment.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: "1rem 0", fontFamily: "monospace", color: "#9ca3af" }}>{payment.providerReference}</td>
                      <td style={{ padding: "1rem 0" }}>
                        {(payment.amount / 100).toLocaleString('en-NG', { style: 'currency', currency: payment.currency, minimumFractionDigits: 0 })}
                      </td>
                      <td style={{ padding: "1rem 0" }}>{payment.eventType}</td>
                      <td style={{ padding: "1rem 0" }}>
                        <span style={{ 
                          color: payment.status === "SUCCESS" ? "#34d399" : (payment.status === "FAILED" ? "#ef4444" : "#fbbf24")
                        }}>
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: "#9ca3af" }}>No payment history found.</p>
          )}
        </section>

      </div>
    </div>
  );
}
