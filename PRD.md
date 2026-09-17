# Product Requirements Document (PRD)

# Assessment 2: Payment and Subscription Slice

## 1. Project Overview

This project implements a subscription management system where authenticated users can select a subscription plan, complete a test payment process, and manage their subscription lifecycle.

The system focuses only on subscription behaviour.

Users should be able to:

- View available plans
- Subscribe to a paid plan
- Upgrade their subscription
- Downgrade their subscription
- Cancel their subscription
- View billing information
- View payment history

Authentication will be reused from Assessment 1.

---

# 2. Project Goal

The goal is to build a reliable payment and subscription flow that demonstrates:

- Subscription management
- Payment processing
- Payment verification
- Subscription state management
- Billing history tracking

---

# 3. User Stories

## View Subscription Plans

As a user, I want to view available plans so that I can choose the subscription that suits me.

---

## Subscribe to a Plan

As a user, I want to subscribe to a paid plan so that my account becomes active under that plan.

---

## Upgrade Subscription

As a user, I want to upgrade my subscription so that I can move to a higher plan while paying the correct amount.

---

## Downgrade Subscription

As a user, I want to downgrade my subscription so that the change takes effect after my current billing period ends.

---

## Cancel Subscription

As a user, I want to cancel my subscription while keeping access until my paid period expires.

---

# 4. Required Screens

The application will contain:

## Plans Page

Displays available subscription options.

Example:

- Free Plan
- Pro Monthly Plan
- Pro Yearly Plan


## Checkout Page

Allows users to start payment.

## Payment Return Page

Displays payment result after returning from payment provider.

## Billing Page

Allows users to view:

- Current subscription
- Billing dates
- Payment history
- Cancel options


# 5. Currency and Money Handling

The application will use Nigerian Naira.

Currency:

NGN

Symbol:

₦


Money will never be stored as decimal values.

Incorrect:
1999.99


Correct:
199999


The amount will be stored as an integer in minor units with the currency stored separately.

Example:
amount: 200000
currency: NGN

---

# 6. Subscription Plans

The system will support:

## Free Plan

Amount:

₦0


## Pro Monthly

Amount:

₦2,000 per month


## Pro Yearly

Amount:

₦20,000 per year


---

# 7. Database Requirements

The system will store:

## Users

Existing authentication users from Assessment 1.


## Plans

Stores available subscription plans.


## Subscriptions

Stores the user's active subscription information.


## Payment Logs

Stores every payment event:

- Payment initiated
- Payment successful
- Payment failed
- Payment verified

---

# 8. Security Requirements

The system must:

- Verify payments on the server
- Validate webhook signatures
- Prevent duplicate payment processing
- Never store card information
- Protect subscription routes
- Validate user actions


---

# 9. Out of Scope

The project will not include:

- Marketing website
- Landing page
- Product features behind subscription
- Card storage
- Full SaaS dashboard
