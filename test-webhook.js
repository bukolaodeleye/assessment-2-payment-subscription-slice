const crypto = require("crypto");

async function testWebhook() {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || "test-secret";
  
  // A dummy payload targeting a specific provider reference
  const payload = JSON.stringify({
    providerReference: "test-ref-1234",
    status: "successful"
  });

  // 1. Generate Valid Signature
  const validSignature = crypto
    .createHmac("sha512", secret)
    .update(payload)
    .digest("hex");

  console.log("=== TESTING INVALID WEBHOOK ===");
  const invalidRes = await fetch("http://localhost:3000/api/webhooks/payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-payment-signature": "fake-malicious-signature"
    },
    body: payload
  });
  console.log("Status:", invalidRes.status);
  console.log("Response:", await invalidRes.text());
  
  console.log("\n=== TESTING VALID WEBHOOK ===");
  const validRes = await fetch("http://localhost:3000/api/webhooks/payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-payment-signature": validSignature
    },
    body: payload
  });
  console.log("Status:", validRes.status);
  console.log("Response:", await validRes.text());
}

// Make sure to set the env var if testing locally
process.env.PAYMENT_WEBHOOK_SECRET = "test-secret";
testWebhook();
