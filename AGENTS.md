<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

# Project Rules

This project is Assessment 2: Payment and Subscription Slice.

The purpose is to build only the required subscription workflow.

Do not create unnecessary features.

---

# Development Rules

1. Keep the project focused on subscriptions only.

2. Do not build:
- Marketing pages
- Landing pages
- Unrelated dashboards

3. Reuse authentication from Assessment 1.

4. Keep payment logic on the server.

5. Never store card details.

6. Always verify payment status from the payment provider.

7. Document important technical decisions.

---

# Database Rules

1. Store money as integers.

Example:
amount: 200000
currency: NGN


2. Do not use floating point numbers for money.

3. Payment events must always be recorded.

4. Maintain clear subscription states.

---

# Code Quality Rules

- Write reusable functions.
- Separate business logic from UI.
- Validate external inputs.
- Handle errors clearly.
- Keep files organized.

---

# Evidence Requirements

Capture evidence for:

- Plans display
- Subscription creation
- Payment records
- Upgrade flow
- Downgrade flow
- Cancellation flow
- Webhook verification
- Duplicate webhook handling

---

# Documentation Rule

Update DOCUMENTATION.md throughout development.

Do not wait until the end.
