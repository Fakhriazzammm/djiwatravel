# Travel Checkout: QRIS and Djiwa Pay

## Intent

Offer only QRIS and Djiwa Pay for new eSIM purchases. QRIS continues to create a Mayar invoice and send the customer to its hosted payment page. Djiwa Pay pays the same Travel order from the customer's wallet balance.

## Goals

- Keep QRIS available to guests and members; redirect to the exact Mayar `paymentUrl` returned for that order.
- Offer Djiwa Pay as a direct wallet payment for authenticated members with a complete profile.
- Keep wallet identity, balance, debit, and ledger authority inside Djiwa Pay.
- Make order creation and wallet settlement retry-safe, including a lost response after a successful debit.
- Retain historical Virtual Account order data for display while removing VA from new checkout choices and validation.

## Non-goals and known limit

- Do not change the Mayar invoice's enabled payment channels or the Djiwa Pay top-up flow.
- Do not create a wallet ledger or accept customer identity, owner, amount, or wallet credentials from browser input.
- Do not create a mirror eSIM order in the Pay POS database.
- Refund execution is outside this change. Travel's current refund workflow records an admin decision but does not call a provider; no order may be marked refunded until an actual refund is recorded.
- Do not deploy or set production secret values as part of this code change.

## Approaches

1. **Chosen: QRIS through Mayar plus a Pay-owned Travel wallet debit.** Travel keeps its eSIM order and invoice path. A narrowly scoped authenticated API in `djiwatentramapp/apps/auth-server` accepts a signed server request, verifies the Better Auth customer session, and calls a Pay-owned atomic wallet RPC. This uses the existing wallet ledger without pretending a Travel order is a POS order.
2. **Mirror the Travel order into Pay POS and reuse `wallet_settle_order`.** Rejected because the existing hold/settle path requires a matching `pos.orders` row; creating one would pollute Pay's POS order, fulfillment, and finance model with Travel eSIM data.
3. **Send the customer to a Djiwa Pay hosted checkout.** Rejected for this change because there is no existing Travel eSIM checkout contract there; it would require a second hosted checkout and callback lifecycle when the customer already chose direct wallet balance.

## Design decisions

### QRIS path

- The checkout presents QRIS and Djiwa Pay only; QRIS is the default.
- QRIS creates the existing Mayar invoice. When an invoice URL is returned, the browser navigates to that URL with `window.location.assign`.
- Do not create a Mayar invoice for a Djiwa Pay order. The hosted Mayar page remains responsible for the payment channels it currently exposes.
- Existing `va` rows remain readable. New checkout input accepts only `qris` and `djiwa_pay`.

### Djiwa Pay path

- The option is visible but unavailable to guests, with a sign-in prompt. A complete, authenticated member profile is required.
- Travel binds the order to the verified Better Auth subject on the server. It reads the amount and payment status back from its own database before requesting a wallet debit.
- Travel calls a new endpoint under `api.djiwatentram.web.id` with the Better Auth cookie and an HMAC-signed request. The shared signing secret is server-only in Travel and the auth server; the endpoint independently verifies the session and derives the canonical customer from it. Browser-supplied `sourceId`, email, amount, or owner fields are never trusted.
- The auth server calls a new Pay-owned `pos.wallet_charge_travel_order` RPC. In one database transaction it locks the wallet, checks active status and available balance, rejects mismatched replays, debits the balance, increments total debited, and writes one completed `order_debit` ledger row with `source_app = 'djiwa-travel'` and a Travel-order reference. The RPC uses a stable order-specific idempotency key and prevents a second completed debit for that Travel order.
- Travel records a `djiwa_pay` payment intent. After Pay confirms the debit, Travel atomically records `PAYMENT_CONFIRMED`, `payment_provider = 'djiwa_pay'`, the ledger transaction reference, and `paid_at`. A retry after a timeout reuses the same intent and idempotency key; Pay returns the original debit rather than charging twice.
- An insufficient balance creates no debit and leaves the Travel order payable. The order surface offers a Djiwa Pay top-up route and a retry action. An ambiguous upstream result stays pending/reconcilable; it must not be represented as either paid or unpaid until the same idempotent request is resolved.
- Payment-method reads, member order views, receipt labels, and offline snapshots recognize `djiwa_pay`; existing `va` data remains displayable.

## Constraints

- Travel and Djiwa Pay have separate databases and release runbooks. Changes stay within the Travel checkout/order modules and the Pay auth-server/wallet migration surfaces.
- Pay already permits `djiwa-travel` ledger provenance and `order_debit`; the new RPC must preserve those contracts and grant execution only to the server-side runtime role.
- Store only environment variable names in templates and documentation. Never log signatures, session cookies, customer identity payloads, or secret values.
- Use additive migrations. Preserve the current unrelated worktree changes in both repositories.

## Acceptance criteria

- Checkout shows exactly QRIS and Djiwa Pay; no new VA order can be created.
- QRIS creates one Mayar invoice and redirects to its returned payment URL.
- Djiwa Pay creates no Mayar invoice and completes payment only after Pay confirms the wallet ledger debit.
- Guests cannot use Djiwa Pay; the server rejects forged customer identity and amount fields.
- Insufficient balance leaves the order unpaid and retryable. Retrying a successful or response-lost payment cannot debit twice.
- Existing VA orders remain readable and correctly labeled.
- The shared secret is required in both server environments before Djiwa Pay can be enabled in a deployment.
