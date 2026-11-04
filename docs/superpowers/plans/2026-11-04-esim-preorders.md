# eSIM Access Pre-orders Implementation Plan

**Goal:** Let members and guests pay for a package that is temporarily unaffordable at eSIM Access, queue the paid order for safe automatic fulfillment after top-up, and send the customer clear status updates.

**Architecture:** Persist preorder mode and the three-day deadline on `customer_orders`; the customer never controls the mode by itself. The server rechecks live package identity and known provider balance, the scheduled worker serializes preorder fulfillment and expiry, and the existing provisioning, customer notification, admin refund, and order-access contracts remain authoritative. Preorders can proceed at the live provider cost even if that cost rises above the original margin, per the user's choice.

**Tech Stack:** TanStack Start, PostgreSQL, Drizzle schema, eSIM Access, existing Mayar/Djiwa Pay payment paths, existing notification and admin authorization patterns, Helipod Email HTTP API when configured.

## Surface matrix

| Surface | Entry and result | Source of truth | Permissions | Empty/loading/error states | Contract test |
| --- | --- | --- | --- | --- | --- |
| Customer catalog, destination, finder, recommendation, home cards/sheets, plan and checkout | A known unaffordable package remains discoverable and is marked Pre-order; unknown balance does not promise stock. Checkout creates the paid order and shows its deadline/status. | Live eSIM Access catalog/balance plus `customer_orders.fulfillment_mode` and `preorder_deadline_at` | Members use verified Better Auth ownership; guests use the existing hashed order-access token. QRIS supports both; Djiwa Pay remains member-only. | Catalog unavailable stays neutral; checkout errors do not create an invoice/order; pending preorder shows the deadline; READY opens the eSIM; expired order shows admin refund review. | Shared catalog view rules, server-owned preorder classification, member/guest ownership and checkout tests. |
| Admin preorder operations | `/admin/preorders` shows paid pending/expired orders, provider balance, deadlines and cost; Admin can refresh balance and run the queue. | `customer_orders`, order items, provider balance and provisioning records | `requireAdmin`, server-derived actor, audited manual action | Empty queue, stale/unavailable balance, failed attempt, expired refund-review queue. | Auth, queue ordering/locking, idempotent retry, expiry-to-refund-review tests. |
| Scheduled fulfillment | The existing protected `/api/tasks/esim-sync` retries oldest eligible orders after top-up, then marks overdue orders for admin refund review. | Database order state and a fresh provider balance | Task secret only; serialized with an advisory lock | Provider failure leaves a retryable pending order; retries preserve the existing deterministic transaction id. | Task authorization, balance reservation, retry/expiry idempotency tests. |
| Notifications | Members receive in-app/push and email; guests receive email and see status on their token-protected order page. | Durable notification and email outboxes keyed by order/event | Recipient derived from member order or verified guest access record; server-only Helipod key | Email stays queued on provider failure; notification does not roll back a paid order. | Outbox idempotency and failure/retry tests. |
| SEO | Only actually sellable packages remain indexable. | Existing sellability state | Public read | No preorder is advertised as in-stock. | SEO source/route regression test. |

## Execution tasks

1. Add a pure preorder state model and failing tests for known-unaffordable vs unknown balance and deadline states.
2. Add migration `046_esim_preorders.sql` and Drizzle fields/indexes for preorder mode, state, deadline and durable email delivery.
3. Update authenticated and guest order creation, payment settlement and customer order views; server-side checks decide preorder eligibility.
4. Preserve known-unaffordable packages through every customer catalog surface with a shared Pre-order status/CTA; keep the existing compact mobile scale and leave SEO availability-only.
5. Add a serialized scheduled/manual queue that retries oldest preorders after a fresh balance check, and moves overdue orders into Admin refund review without executing refunds.
6. Add protected Admin read/action UI, audit events, customer in-app/push events and a retryable Helipod Email outbox sender.
7. Run focused tests, the project gate/build and migration/source checks; report local/commit/push/deploy/health separately. Do not push or deploy as part of this local implementation.

## External setup boundary

The Helipod Email skill is available, but no Helipod account tools are connected in this session. The sender will use server-only `HELIPOD_EMAIL_API_KEY` (or `HELIPOD_API_KEY`) and `HELIPOD_EMAIL_FROM`; production email delivery requires the account plan, verified sending domain/DNS, and secret to be configured on the Travel runtime.

## Local handoff (2026-11-05)

Implemented catalog/checkout/order/receipt states, migration 046, serialized provider purchasing with fresh balance reads and a decreasing sweep budget, 72-hour Admin review, `/admin/preorders`, and an idempotent Helipod email outbox plus member notifications. Quick preorder highlights require an Admin pin.

Verification: 100 focused tests across 11 files passed; 3 queue tests passed separately. Production build generated `.output/server/index.mjs`. Full suite initially had 12 failures; affected catalog/navigation/view contracts were corrected and rerun successfully. The unchanged auth-hook suite still reproduces 4 failures due to an incomplete Better Auth mock; the trip overview suite passes alone. `tsc --noEmit` reports 28 errors in unchanged files and no preorder errors after fixes. `git diff --check` passed.

Release remains pending: migration has not been executed against a database, Helipod verified sender/secret is not configured or delivery tested, and no real payment/provider purchase was made. No commit, push, deploy, service or public runtime check was performed. These runtime checks are required before calling the feature live end-to-end.
