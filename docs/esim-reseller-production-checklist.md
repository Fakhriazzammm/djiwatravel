# Djiwa Travel eSIM Reseller — Production Checklist

## Temporary defaults already implemented

- **Catalog:** eSIM Access Partner API, server-side only, live catalog cache with stale fallback.
- **Markup:** global percentage markup, currently 25%; pricing logic supports country/package overrides later.
- **FX:** temporary fixed `1 USD = Rp17.000`; replace with a signed daily FX source before financial launch.
- **Rounding:** IDR rounded to the nearest configured rupiah unit by the pricing engine.
- **Customer auth:** short-lived HMAC session (15 minutes default, one hour maximum); replace or wrap with Supabase Auth when selected.
- **Profile protection:** AES-256-GCM for QR/LPA and activation code; encryption key stays server-side.
- **Payment:** provider-neutral HMAC webhook boundary; provisioning is gated by `PAYMENT_CONFIRMED`.
- **Database:** additive Postgres/Supabase migrations prepared but not executed against production.

## Required before production launch

1. Select Supabase or another managed Postgres and set `DATABASE_URL` or the equivalent server-side connection.
2. Select a payment provider and configure `PAYMENT_WEBHOOK_SECRET`; implement its adapter against `PaymentGateway`.
3. Select customer auth provider; map its stable user ID to `customer_orders.customer_auth_id`.
4. Select an FX source and record the quote timestamp/source with each order; remove the temporary fixed FX default.
5. Fund the eSIM Access account and run one controlled provider order with a small package.
6. Apply migrations `001_esim_reseller.sql` and `002_reseller_payment_auth.sql` after backup and verify RLS/service-role behavior.
7. Verify payment webhook replay, amount mismatch, provider timeout, refund, and encrypted profile readback.

## Safety gates

- Never call eSIM Access order before a verified `PAID` event.
- Never put API credentials, QR payloads, activation codes, or encryption keys in browser bundles or logs.
- Do not run provider order tests while the provider balance is zero.
