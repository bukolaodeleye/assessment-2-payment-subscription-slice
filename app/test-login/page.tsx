import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import crypto from "crypto";

// Server action to handle the dummy login
async function handleLogin(formData: FormData) {
  "use server";
  
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  
  const email = formData.get("email") as string;
  const name = formData.get("name") as string;
  
  if (!email || !name) {
    return;
  }

  // 1. Find or create the user
  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: "dummy-password-hash-for-testing", // fake password
        emailVerified: new Date(),
      },
    });
  }

  // 2. Create a session token and hash
  // Using a random token that we'll store in the cookie, and storing its SHA-256 hash in the database
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
  
  // Set expiration to 30 days from now
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  // 3. Create the session in the database
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: tokenHash,
      expiresAt: expiresAt,
    },
  });

  // 4. Set the session cookie
  const cookieStore = await cookies();
  cookieStore.set("sessionId", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });

  // 5. Redirect to the pricing page to test the subscription flow
  redirect("/pricing");
}

export default async function TestLoginPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  // Fetch existing users to display as quick-login options
  const existingUsers = await prisma.user.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
  });

  return (
    <div style={{ padding: "4rem 2rem", fontFamily: "system-ui, sans-serif", maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Development Test Login</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        This page allows you to bypass the Assessment 1 authentication flow to easily test the Assessment 2 subscription logic.
      </p>

      <div style={{ background: "#f4f4f5", padding: "2rem", borderRadius: "8px", border: "1px solid #e4e4e7" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Create or Select User</h2>
        <form action={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label htmlFor="name" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Name</label>
            <input 
              type="text" 
              id="name" 
              name="name" 
              defaultValue="Test User" 
              required 
              style={{ width: "100%", padding: "0.75rem", borderRadius: "4px", border: "1px solid #ccc" }}
            />
          </div>
          <div>
            <label htmlFor="email" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Email</label>
            <input 
              type="email" 
              id="email" 
              name="email" 
              defaultValue="test@example.com" 
              required 
              style={{ width: "100%", padding: "0.75rem", borderRadius: "4px", border: "1px solid #ccc" }}
            />
          </div>
          <button 
            type="submit" 
            style={{ 
              background: "#000", 
              color: "#fff", 
              padding: "1rem", 
              borderRadius: "4px", 
              border: "none", 
              fontWeight: "bold", 
              cursor: "pointer",
              marginTop: "0.5rem"
            }}
          >
            Login & Redirect to Pricing
          </button>
        </form>
      </div>

      {existingUsers.length > 0 && (
        <div style={{ marginTop: "3rem" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Existing Test Users</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {existingUsers.map(user => (
              <li key={user.id} style={{ marginBottom: "1rem", padding: "1rem", background: "#f9fafb", borderRadius: "4px", border: "1px solid #e5e7eb" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{user.name}</strong> <br/>
                    <small style={{ color: "#6b7280" }}>{user.email}</small>
                  </div>
                  <form action={handleLogin}>
                    <input type="hidden" name="name" value={user.name} />
                    <input type="hidden" name="email" value={user.email} />
                    <button type="submit" style={{ background: "#3b82f6", color: "white", padding: "0.5rem 1rem", borderRadius: "4px", border: "none", cursor: "pointer" }}>
                      Login as this User
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
