"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelButton() {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const router = useRouter();

  const handleCancel = async () => {
    setLoading(true);
    try {
      const finalReason = reason === "Other" ? customReason : reason;
      
      const res = await fetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ cancellationReason: finalReason || null }),
      });
      
      if (res.ok) {
        setShowModal(false);
        router.refresh();
      } else {
        const data = await res.json();
        alert(`Failed to cancel: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred while canceling.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setShowModal(true)} 
        disabled={loading}
        style={{
          marginTop: "1.5rem",
          padding: "0.75rem 1.5rem",
          backgroundColor: "#dc2626",
          color: "white",
          border: "none",
          borderRadius: "6px",
          fontWeight: "600",
          cursor: "pointer",
        }}
      >
        Cancel Subscription
      </button>

      {showModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.7)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: "#171717",
            padding: "2rem",
            borderRadius: "12px",
            border: "1px solid #333",
            width: "100%",
            maxWidth: "400px"
          }}>
            <h3 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Cancel Subscription?</h3>
            <p style={{ color: "#9ca3af", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
              Your subscription will remain active until the end of your current billing period. Please let us know why you are leaving (optional):
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {["Too expensive", "No longer need it", "Missing features", "Other"].map(opt => (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input 
                    type="radio" 
                    name="reason" 
                    value={opt}
                    checked={reason === opt}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  {opt}
                </label>
              ))}
              
              {reason === "Other" && (
                <textarea 
                  placeholder="Please specify..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    backgroundColor: "#262626",
                    border: "1px solid #404040",
                    borderRadius: "4px",
                    color: "white",
                    marginTop: "0.5rem",
                    minHeight: "60px",
                    fontFamily: "inherit"
                  }}
                />
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
              <button 
                onClick={() => setShowModal(false)}
                style={{ padding: "0.5rem 1rem", backgroundColor: "transparent", border: "1px solid #52525b", color: "#d4d4d8", borderRadius: "4px", cursor: "pointer" }}
              >
                Keep Subscription
              </button>
              <button 
                onClick={handleCancel}
                disabled={loading}
                style={{ padding: "0.5rem 1rem", backgroundColor: "#dc2626", border: "none", color: "white", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "Canceling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
