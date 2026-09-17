"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DowngradeButton({ availableDowngrades }: { availableDowngrades: any[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(availableDowngrades[0]?.id || "");

  const handleDowngrade = async () => {
    if (!selectedPlanId) return;
    setLoading(true);
    try {
      const response = await fetch("/api/subscriptions/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPlanId: selectedPlanId }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || "Failed to schedule downgrade");
      } else {
        alert(data.message || "Downgrade scheduled successfully");
        router.refresh();
      }
    } catch (error) {
      console.error(error);
      alert("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (availableDowngrades.length === 0) return null;

  return (
    <div style={{ marginTop: "1.5rem", padding: "1.5rem", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid #333" }}>
      <h3 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>Schedule Downgrade</h3>
      <p style={{ color: "#9ca3af", fontSize: "0.875rem", marginBottom: "1rem" }}>
        Your downgrade will take effect at the end of your current billing period. No immediate charges apply.
      </p>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
        <select 
          value={selectedPlanId} 
          onChange={(e) => setSelectedPlanId(e.target.value)}
          style={{ 
            padding: "0.75rem", 
            borderRadius: "4px", 
            border: "1px solid #4b5563",
            backgroundColor: "#1f2937",
            color: "#fff",
            flexGrow: 1,
            maxWidth: "300px"
          }}
        >
          {availableDowngrades.map(plan => (
            <option key={plan.id} value={plan.id}>
              {plan.name} - {(plan.amount / 100).toLocaleString('en-NG', { style: 'currency', currency: plan.currency, minimumFractionDigits: 0 })} / {plan.interval}
            </option>
          ))}
        </select>
        <button 
          onClick={handleDowngrade} 
          disabled={loading}
          style={{ 
            background: "#f59e0b", 
            color: "#fff", 
            padding: "0.75rem 1.5rem", 
            borderRadius: "4px", 
            border: "none", 
            fontWeight: "bold", 
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? "Scheduling..." : "Downgrade Plan"}
        </button>
      </div>
    </div>
  );
}
