# Shopper discovery implementation plan

Goal: deliver design A link/photo discovery plus customer requests and versioned Admin offers through the existing shopping payment/fulfillment flow.
Architecture: separate private discovery requests from public catalog. Supported store URLs resolve by product code through fixed official API hosts. Other URLs are stored as references, never fetched. Vision extracts search terms only; provider/catalog or Admin owns prices.

| Surface | Entry/result | Control/source | Permissions and states | Proof |
|---|---|---|---|---|
| Customer search | two buttons below search; candidates or manual request | catalog and vision terms | verified session, daily quota, loading/error/manual fallback | URL/image validation, browser result |
| Customer requests | Pesanan list; clarification, decline or accept quote | versioned request/offer | owner only; stale/expired/retry safe | ownership/version/idempotency tests |
| Admin | Permintaan tab; triage, clarification, reject, offer | private request and event tables | existing admin guard; expected version | admin/owner checks and browser |
| Checkout | accept offer + address -> existing shopping order | fixed quoted IDR values | row lock; one order per request | concurrency/retry invariants |

- [x] Add migration 051, pure validation/types and fixed-host catalog discovery.
- [x] Add private upload/search, owner request actions, Admin quote controls and notifications.
- [x] Add design A sheet, customer request panel, Admin request/settings panel.
- [x] Focused tests, lint/typecheck/build; baseline comparison; release and live browser verification.

Migration: PostgreSQL/pg numbered SQL; new tables plus shopping_orders.domestic_shipping_idr (default 0), no existing-row rewrite. Existing app remains compatible. Use lock_timeout 5s; stop on migration errors. Roll back app only, preserve additive schema/new data. Verify runtime grants and objects after apply. Tables initially empty; exact production PostgreSQL version verified before migration. Photos max 5MB, private bytea, expire after 7 days for drafts and 90 days for submitted requests; scheduled purge removes expired bytes. Request/quote audit retained. No photo copied to public catalog.

Default limits: 10 searches/day/customer, 5 photo analyses/day/customer, 20 daily global photo AI calls, model glm-5.3-flash; Admin can disable discovery or photo processing. AI unavailable -> manual request, never guessed price. Currency JP/JPY only. Quote contains item, condition, variant, seller link, goods/domestic delivery/service/international shipping in IDR, expiry and version. Customer acceptance creates a single normal shopping order atomically; Mayar creation/retry uses existing payment handler. Payments/Finance remain Travel/Pay owned contracts.

## Live verification (2026-11-09, production `6ef2f76` + note fix)

- Official Uniqlo product URL resolved by code with candidates, sizes/colors, photos and JPY prices.
- Outside-brand URL (Mercari-shaped) stayed a private reference, reached the Admin Permintaan queue as
  `Dikirim`, and no outbound fetch was made; the customer cancelled it from Pesanan and both sides showed
  `Dibatalkan` with an audit event.
- Photo upload from the customer page returned HTTP 200 after the origin fix, vision produced a
  description, and catalog candidates rendered with CDN photos (no 403).
- Test-marked requests/photos were removed after verification. A real paid checkout was not run;
  order creation, versioning, ownership and invoice-retry invariants are covered by tests.
