import { prisma } from '@/lib/prisma';
import styles from './pricing.module.css';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  // 1. Check if user is logged in
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("sessionId") || cookieStore.get("session");
  let isLoggedIn = false;

  if (sessionCookie?.value) {
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
        user: true
      }
    });
    
    // Ensure both the session exists AND the user relation is intact
    if (session && session.user) {
      isLoggedIn = true;
    }
  }

  // 2. Fetch plans
  const plans = await prisma.plan.findMany({
    orderBy: {
      amount: 'asc',
    },
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Simple, transparent pricing</h1>
        <p className={styles.subtitle}>
          Choose the perfect plan for your needs. No hidden fees.
        </p>
      </div>

      <div className={styles.grid}>
        {plans.map((plan) => {
          // Amount is stored as integer (e.g., 200000 for 2000 NGN)
          // We divide by 100 to get the correct display price
          const displayPrice = (plan.amount / 100).toLocaleString('en-NG', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          });

          return (
            <div key={plan.id} className={styles.card}>
              <h2 className={styles.planName}>{plan.name}</h2>
              <div className={styles.priceContainer}>
                <span className={styles.currency}>₦</span>
                <span className={styles.price}>{displayPrice}</span>
                {plan.interval && plan.interval !== 'once' && (
                  <span className={styles.interval}>/{plan.interval}</span>
                )}
              </div>
              
              <ul className={styles.features}>
                {/* Placeholder features since Plan model doesn't store features list */}
                <li className={styles.featureItem}>
                  <svg className={styles.featureIcon} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Full access to platform
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.featureIcon} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Premium support
                </li>
                {plan.name.toLowerCase().includes('pro') && (
                  <li className={styles.featureItem}>
                    <svg className={styles.featureIcon} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Advanced analytics
                  </li>
                )}
              </ul>

              {/* Display conditional button based on login status */}
              {isLoggedIn ? (
                <form action="/api/subscriptions/create" method="POST" style={{ marginTop: 'auto' }}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <button type="submit" className={styles.button}>
                    Subscribe
                  </button>
                </form>
              ) : (
                <Link href="/test-login" style={{ marginTop: 'auto', textDecoration: 'none' }}>
                  <button type="button" className={styles.button}>
                    Log in to Subscribe
                  </button>
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
