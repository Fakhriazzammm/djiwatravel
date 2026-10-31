# Travel Checkout: QRIS and Djiwa Pay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for implementation. Follow TDD for each behavior and use `safe-database-migrations` for the Pay wallet RPC migration.

## Goal

Offer QRIS through Mayar and direct Djiwa Pay wallet balance for Travel eSIM checkout. Keep Mayar's returned `paymentUrl` as the exact browser redirect target. Keep wallet identity, balance, debit, and ledger ownership in Djiwa Pay.

## Architecture

- Travel accepts `qris` and `djiwa_pay` for new orders; historical `va` orders stay readable.
- QRIS keeps the existing Mayar invoice flow and redirects to the returned invoice URL.
- A verified Travel member may request a wallet charge for a server-owned Travel order. Travel forwards the verified Better Auth cookie and signs the server-derived order ID and amount with a shared server-only HMAC secret.
- Djiwa Pay verifies the Better Auth session, derives its canonical customer, validates the signature and timestamp, and calls an atomic Pay-owned RPC. The RPC debits once per Travel order and returns the original result on retries.
- Travel records the provider result in its payment intent and order. An insufficient balance remains retryable; an ambiguous result remains pending and is reconciled by repeating the same idempotent request.

## Tech Stack

- Travel: TypeScript, TanStack Start server functions, Drizzle/PostgreSQL, Vitest.
- Djiwa Pay: Hono/Better Auth, PostgreSQL via `pg`, Supabase migrations, Bun tests.
- The implementation was first completed locally. The follow-up user request on 2026-10-31 authorizes committing, pushing, merging to `main`, applying the migrations, and deploying only this checkout/payment change.

## Spec

`docs/superpowers/specs/2026-10-31-travel-checkout-qris-djiwa-pay-design.md` is authoritative. In particular, do not create a Mayar invoice for Djiwa Pay, do not accept browser-supplied owner/amount/customer fields, do not mirror a Travel order into Pay POS, and do not mark Travel paid before Pay confirms the ledger debit.

## Global Constraints

- Preserve all pre-existing changes in both repositories; limit edits to the checkout/payment modules, the auth-server route/helper, new tests, additive migrations, and relevant environment/docs.
- Use Travel migration `025` and a new Pay migration timestamp after the current checked-in migration history.
- Keep shared secret values and HMAC/session data out of client code, logs, tests, and docs. Only document the environment variable name.
- The authorized release scope is only the current QRIS/Djiwa Pay checkout change in the two affected repositories; do not include any other worktree changes.
- Keep historical VA read/display compatibility while blocking VA for newly submitted checkout orders.

## Surface matrix for release

| Surface | Entry and result | Source of truth and permissions | Empty/loading/error behavior | Proof |
| --- | --- | --- | --- | --- |
| Customer | `/checkout/$id` offers QRIS and Djiwa Pay. QRIS creates a Mayar invoice and redirects to its returned URL; Djiwa Pay charges the authenticated member's wallet, then `/order/$id` and `/receipt/$id` show the result. | Travel owns the eSIM order and payment intent. Better Auth supplies the verified member session; the Pay auth-server derives wallet ownership and Pay owns the wallet/ledger. Guest QRIS remains available; wallet charges require an authenticated, eligible member. | Checkout and order surfaces retain loading, insufficient-balance retry/top-up, pending/retry, and provider-error states. A Mayar invoice failure keeps the order recoverable. | Focused Travel tests for allowed methods, exact Mayar redirect, provider labels, ownership/charge contract; focused Pay endpoint tests and SQL migration contract. |
| Admin operations | `/admin/orders`, `/admin/orders/$id`, and `/admin/payments` let staff inspect order/payment status and the `Djiwa Pay` provider label. | Protected Admin reads the Travel order/payment record; the wallet ledger remains Pay-owned. Wallet enablement is a server-only shared-secret deployment setting. No Admin toggle is added because exposing or storing the signing secret in Admin would violate the server-only credential boundary; `/admin/settings` was checked and already keeps secrets/provider payloads out of the surface. | Existing pending, failed, and provider-error records remain visible in order/payment operations; raw signatures, cookies, and secrets are not shown. | Admin payment/order read-model and provider-label tests; production route/service and server-only secret checks. |
| Shared contract | Travel server action → signed auth-server endpoint → atomic Pay wallet RPC → Travel payment intent/order state. | Travel derives order ID and amount from its database. Auth-server verifies the session and HMAC. Only server roles may execute the RPC; browser roles are revoked. | Stable order idempotency makes retries safe; insufficient balance does not debit; ambiguous responses remain retryable. | Travel focused tests, Pay Bun tests, additive migration contract, migration history and runtime verification. |

Admin enablement is intentionally not an Admin UI setting: the signing key must be present in both server environments before the wallet option is enabled. Staff monitor outcomes through the checked Admin order/payment routes and change enablement through the protected server environment. This keeps the admin journey operational without adding a second wallet or secret source of truth.

Repository guidance drift: Djiwa Pay `AGENTS.md` points schema work to `packages/backend/supabase/migrations`, while the checked auth-server contract tests resolve `../../supabase/migrations`, the root Supabase configuration owns the active project, and the production `supabase_migrations.schema_migrations` history records root migration versions. This additive wallet RPC therefore stays in root `supabase/migrations`; duplicating the same version under both paths would create an ambiguous migration source.

## Task 1 — Pay-owned idempotent wallet charge

**Scope:** Add `pos.wallet_charge_travel_order`, an authenticated auth-server endpoint, request-signature validation, canonical customer lookup, and focused tests.

**Interfaces:** Endpoint accepts the Travel order ID and amount only as signed server input, with the customer session cookie forwarded separately. It returns a stable transaction reference and a result code (`charged`, `already_charged`, or `insufficient_balance`). Pay derives the customer ID from the verified session. The SQL function locks the wallet and enforces one completed debit per `(source_app, reference_type, reference_id)`.

**Steps (RED → GREEN):**

1. Add Bun tests for HMAC/timestamp validation, session-derived ownership, rejected forged fields, and safe result mapping; run the focused test and confirm the expected missing-behavior failures.
2. Add a database contract test for the RPC's ledger provenance, locking/idempotency guard, insufficient-balance behavior, and restricted execute grant; run it and confirm it fails before the migration exists.
3. Add the additive SQL migration and minimal auth-server route/helper; rerun the focused Bun and SQL contract tests.
4. Review the route for cookie/signature/amount logging and verify the existing runtime DB role can call the RPC only through the server route.

**Expected:** Focused Pay tests pass; migration is additive and grants no browser role direct RPC execution. No Pay POS order is created.

## Task 2 — Travel payment intent and server payment action

**Scope:** Extend new-order method validation and persistence, preserve legacy VA reads, and add a server-only wallet charge operation bound to the authenticated member and stored order amount.

**Interfaces:** The checkout sends only the selected method and ordinary order inputs. Travel derives the authenticated subject from Better Auth, loads the persisted order/amount, creates or reuses the `djiwa_pay` payment intent, then calls the Pay endpoint with a stable order idempotency key. Only a confirmed Pay transaction updates the Travel order to paid.

**Steps (RED → GREEN):**

1. Add focused Travel tests for accepting `qris`/`djiwa_pay`, rejecting new `va`, preserving legacy VA mapping, and preventing wallet payment for a guest or an order owned by another member; run to see the expected failures.
2. Add payment-intent/idempotency tests for insufficient balance, a response-lost retry, and confirmed payment persistence; run to see the expected failures.
3. Add migration `025` and the server-only action/provider client. Do not create a Mayar invoice for `djiwa_pay`; retain existing Mayar recovery for QRIS.
4. Rerun focused tests and inspect SQL constraints, transaction boundaries, and retry behavior.

**Expected:** Repeating a charge after an ambiguous response cannot debit twice; insufficient balance leaves the order unpaid and retryable; guest/forged ownership cannot reach the wallet endpoint.

## Task 3 — Checkout, order recovery, and payment labels

**Scope:** Update checkout controls, order retry/top-up behavior, receipts/admin labels, and all read/offline types that map payment methods.

**Steps (RED → GREEN):**

1. Add focused UI/helper tests for exactly two new checkout choices, QRIS default, the direct-wallet label, guest gating, and retry/top-up states; run to observe expected failures.
2. Add a redirect regression test proving QRIS navigates to the exact `paymentUrl` returned by Mayar.
3. Update the checkout and order/receipt/admin read surfaces. Keep the exact `window.location.assign(paymentUrl)` Mayar redirect behavior and add no VA choice to new checkout.
4. Rerun focused tests and review the member journey from checkout through pending/retry/receipt.

**Expected:** A successful QRIS order redirects to Mayar's returned URL verbatim. A successful Djiwa Pay order never creates a Mayar invoice; guests see the sign-in requirement, and low balance presents the existing top-up route plus retry.

## Task 4 — Environment contract and final verification

**Scope:** Document the shared secret name and endpoint contract without values; review both repositories' diffs and run the focused verification commands.

**Steps:**

1. Add `DJIWA_TRAVEL_WALLET_PAYMENT_SECRET` to the relevant server environment templates and document that both Travel and auth-server must configure the same value before enabling wallet payment.
2. Run the focused Travel and Pay tests plus the relevant type/build checks, read every result, and compare against existing baseline where applicable.
3. Review changed-file lists and diffs in both repositories; confirm unrelated worktree changes remain untouched and no secret value is present.

**Expected:** Focused verification passes or each unrelated baseline failure is reported precisely. For the separately authorized release, report source revision, migration state, deployed artifact, service health, and public reachability independently.

## Review Focus

- HMAC covers a bounded timestamp and the exact request body; use constant-time signature comparison and reject stale timestamps. Replayed valid requests rely on the order-level ledger idempotency guard so recovery retries remain safe.
- The endpoint independently checks the Better Auth session and derives the Pay customer; browser payload cannot choose the wallet owner or amount.
- The RPC's lock, balance update, ledger insert, and idempotency check are atomic. A conflicting replay cannot debit again.
- Travel's `PAYMENT_CONFIRMED`/`paid_at` transition occurs only after a confirmed Pay response; timeout/unknown results remain recoverable.
- QRIS preserves Mayar invoice creation and redirects to the exact returned URL. Historical VA orders remain readable.
