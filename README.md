# Implementing Delight

implementasi

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2b192783-a802-45e0-bf2f-60ac1fd4bb56).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Djiwa Pay top-up boundary

The authenticated profile page exposes Djiwa Pay saldo top-up only after the central Better Auth session is verified server-side. Travel does not create or store a wallet, balance, ledger, Mayar key, or webhook settlement.

Before enabling this in a runtime, configure these server-only variables:

- `DJIWA_PAY_CUSTOMER_WALLET_URL`: the verified HTTPS URL for the canonical `customer-wallet` Edge Function boundary.
- `DJIWA_TRAVEL_PUBLIC_ORIGIN` (optional): HTTPS origin used for the canonical `/saldo` return URL; defaults to `https://djiwatravel.com`.

The server resolves each user's canonical `customerSourceId` by forwarding the incoming Better Auth session cookie to `GET https://api.djiwatentram.web.id/api/customer/profile`. It requires a non-empty `customer.source_id` and case-insensitive email ownership matching the authenticated Better Auth user. Unavailable, malformed, or mismatched profiles fail closed before `customer-wallet` is called. It must never pass `user.id` as `sourceId`, use email as identity, or read a shared browser/server value as every user's source id.

`DJIWA_PAY_CUSTOMER_SOURCE_ID` is not used: canonical identity is a per-request server-side exchange result, never a static environment value or browser input.

Invoice creation is pending only; Travel never marks saldo credited. The canonical Mayar webhook remains the only settlement authority.
