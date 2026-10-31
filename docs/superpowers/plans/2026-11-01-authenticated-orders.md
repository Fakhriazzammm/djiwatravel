# Authenticated Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a verified Better Auth account for all customer account and transaction journeys, remove guest order access, preserve old orders, and show each user their own safe auth/profile data.

**Architecture:** Better Auth's verified HttpOnly session remains the identity source. Travel writes every new order with a server-derived `customer_auth_subject`, stores payment contacts in a neutral Travel table, and serves orders only by session ownership. A signed-in legacy import attaches only old unowned orders after code/contact verification; public catalog routes stay public.

**Tech Stack:** TanStack Start, React, TypeScript, Drizzle ORM, PostgreSQL numbered SQL migrations, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-authenticated-orders-design.md`

## Global Constraints

- Verify customer sessions through the Better Auth HttpOnly session at `https://api.djiwatentram.web.id/api/auth`.
- Derive `customer_auth_subject` from the verified session; never accept an owner from browser input.
- Keep browsing public; require auth for checkout, payment, account and private order data.
- Do not expose session IDs/tokens/cookies, passwords/hashes, DB credentials, central auth DB contents, or other users' records.
- Djiwa Travel and Djiwa Tentram remain separate apps, databases, VPS hosts, and release runbooks.
- Use an additive numbered migration; preserve legacy order, eSIM, token and audit records.
- Preserve the unrelated uncommitted edits already present in the shared checkout; do not stage or commit them with this work.

## Review Focus

- Missing, expired, or unverifiable session at order creation → create no order (`customer-orders-auth.test.ts`).
- Browser submits another account's order id for read/payment → return not-found and make no payment call (`member-order-auth.test.ts`).
- Retry uses the same idempotency key under the original account → return the same order; a different account cannot reuse it (`customer-orders-auth.test.ts`).
- Legacy order is already owned or its email/WhatsApp does not match → never reassign it (`member-order-legacy-claim.test.ts`).
- Repeated concurrent legacy claim → exactly one owner is written and the audit outcome is stable (`member-order-legacy-claim.test.ts`).

---

### Task 1: Move order payment contacts into a neutral Travel table

**Files:**
- Create: `migrations/030_customer_order_payment_details.sql`
- Modify: `drizzle/schema.ts`
- Test: `src/test/customer-order-payment-details-migration.test.ts`

**Interfaces:**
- Add Drizzle table `customerOrderPaymentDetails` with `orderId`, `email`, `whatsapp`, `paymentMethod`, and `createdAt`.
- Backfill one row per existing `guest_order_access` row. Retain the legacy table and grants during this compatible release.

- [ ] Write a failing migration contract test asserting the new table is created, historical contact/payment fields are copied idempotently, and no order/guest/audit rows are deleted.
- [ ] Run `npx vitest run src/test/customer-order-payment-details-migration.test.ts`; confirm it fails because migration 030 is absent.
- [ ] Add the additive SQL and Drizzle table definition; use the current payment-method constraint values from the schema.
- [ ] Re-run the focused test and `npx tsc --noEmit`.

### Task 2: Create orders only from a verified account

**Files:**
- Create: `src/lib/customer-orders.server.ts`
- Create: `src/lib/customer-orders.fn.ts`
- Modify: `src/lib/orders.ts`
- Test: `src/test/customer-orders-auth.test.ts`

**Interfaces:**
- Export `createAuthenticatedOrderDraftInput` and `createAuthenticatedOrderDraftHandler` from the server module.
- Accept `{ packageCode, paymentMethod, idempotencyKey }`; do not accept email, WhatsApp, owner, or access token.
- Resolve the authenticated user and complete `customer_profiles` server-side, write the subject and payment details atomically, and return the order id/code/status/amount/timestamps without a bearer token.
- Keep `createOrder` as the browser-facing order function, deriving contacts from the authenticated server profile.

- [ ] Write failing tests for missing session, incomplete profile, server-derived subject/contact, same-owner idempotent retry, and cross-owner idempotency rejection.
- [ ] Run `npx vitest run src/test/customer-orders-auth.test.ts`; verify expected failures.
- [ ] Implement the new server handler and `.fn.ts` RPC boundary, then replace guest-token order creation in `orders.ts`.
- [ ] Re-run the focused test and relevant existing order/profile tests.

### Task 3: Enforce session ownership for reads, payments, and old-order import

**Files:**
- Modify: `src/lib/member-orders.server.ts`, `src/lib/member-orders.fn.ts`
- Modify: `src/lib/mayar-gateway.ts`, `src/lib/mayar-settlement.server.ts`, `src/lib/djiwa-pay-payment.server.ts`
- Modify: `src/lib/travel-order-identity.ts`
- Test: `src/test/member-order-auth.test.ts`, `src/test/member-order-legacy-claim.test.ts`, focused Mayar/Djiwa Pay tests

**Interfaces:**
- Keep member order reads scoped by `customer_orders.customer_auth_subject = verified user.id`.
- Replace token-based Mayar create/rebuild/verify inputs with `{ orderId, ...paymentFields }`; derive contacts from `customer_order_payment_details`, verify session ownership before provider calls.
- Add `claimLegacyOrderForMemberInput` and `claimLegacyOrderForMemberHandler`; accept `{ publicOrderCode, whatsapp }`, derive email and owner from session, and atomically claim only an unowned matching legacy order.
- Keep webhook, settlement worker, and admin paths authenticated by their existing provider/admin credentials.

- [ ] Write failing owner-isolation tests for order reads and payment actions, plus legacy claim success, mismatch, already-owned, and repeat/race cases.
- [ ] Run the focused auth, identity, Mayar, and Djiwa Pay tests; confirm they fail for the missing ownership behavior.
- [ ] Replace customer token checks with verified session and owner predicates; add atomic legacy claim and audit recording.
- [ ] Re-run focused tests and existing payment/settlement tests.

### Task 4: Gate private routes and display safe account/database data

**Files:**
- Modify: `src/routes/checkout.$id.tsx`, `src/routes/order.$id.tsx`, `src/routes/receipt.$id.tsx`
- Modify: `src/routes/my-esim.index.tsx`, `src/routes/my-esim.$id.tsx`, `src/routes/profile.tsx`
- Modify as needed: `src/routes/wallet.tsx`, `src/routes/notifications.tsx`, `src/routes/support.tsx`, `src/routes/my-trips.index.tsx`, `src/lib/trip-actions.ts`
- Modify: `src/lib/customer-profile.server.ts`, `src/lib/customer-profile-client.ts`
- Test: `src/test/customer-account-auth-ui.test.tsx`, profile tests, focused route tests

**Interfaces:**
- Use the existing Better Auth session and profile endpoint to show the signed-in user's provider, account id/email, profile-record status, and updated timestamp on `/profile`.
- Keep `/profile` as the sign-in entry; preserve safe return paths to checkout/order destinations.
- Unauthenticated private routes show a sign-in state and return destination; no private order/profile/payment data renders before auth.
- Order, eSIM, receipt and payment controls consume only the authenticated member read path.

- [ ] Write failing UI tests for checkout's no-guest sign-in gate, private-route signed-out state, safe return path, account identity/profile DB summary, and absence of session secrets.
- [ ] Run the focused UI/profile tests and confirm the expected failures.
- [ ] Add the gates and profile summary while retaining the current loading-component edits in shared route files.
- [ ] Re-run focused route/profile tests and admin customer/order tests.

### Task 5: Remove guest recovery and browser bearer-token paths

**Files:**
- Delete: `src/routes/order-status.tsx`, `src/routes/api.order-recovery.ts`
- Delete or retire: `src/lib/guest-orders.fn.ts`, `src/lib/guest-orders.server.ts`, `src/lib/guest-order-access.server.ts`, `src/lib/guest-access-policy.ts`
- Modify: `src/lib/orders.ts`, `src/lib/order-cache.ts`, `src/lib/travel-order-identity.ts`, `src/routes/profile.tsx`, `src/routes/receipt.$id.tsx`, `src/routes/order.$id.tsx`, relevant server call sites
- Update generated route tree only through the project route/build generator.
- Test: focused order/receipt/route tests and `rg` audit for live guest token consumers.

**Interfaces:**
- `refreshOrdersFromServer` and `useOrders` read only member orders; no local guest access token is read, saved, or sent.
- Profile exposes the signed-in legacy import form; there is no anonymous order recovery endpoint or guest checkout UI.
- Retain historical DB tables/rows for rollback and audit; keep admin visibility for unowned legacy orders.

- [ ] Write failing route/order tests proving guest creation and anonymous recovery are unavailable while a signed-in legacy claim remains available.
- [ ] Run focused tests and confirm they fail against current guest routes.
- [ ] Remove client/server guest-token paths and replace the `/order-status` account link with the signed-in legacy import surface.
- [ ] Re-run focused tests and search source for token-based customer access.

### Task 6: Verify the end-to-end contract

**Files:**
- No source changes unless a verification failure exposes a defect; fix with a new failing test first.

- [ ] Run `bash scripts/apply-migrations.sh --status` where the configured Travel database is reachable; do not apply production migrations in this step.
- [ ] Run focused server, UI, migration, payment, checkout, admin-customer and admin-order tests.
- [ ] Run `npm test` and `npm run build`; record baseline failures by exact test/output.
- [ ] Run `git diff --check`, inspect browser bundles for guest token creation, and verify public browsing routes plus private authenticated routes.
- [ ] Before production release, verify Better Auth and target Travel VPS/DB via Helipod with appropriate read scope; keep Tentram/Pay deployment separate.

---

## Self-review

- Spec coverage: public browsing, mandatory customer auth, server-owned order ownership, neutral payment metadata, old-order import, safe Profile data, Admin operation, additive migration, and payment boundary are all assigned above.
- Shared checkout already has uncommitted loading/auth UI changes; route tasks preserve them, and final commits must exclude unrelated hunks.
- Implementation method: native execution in this session; no subagents or additional checkout are needed for the shared working state.
