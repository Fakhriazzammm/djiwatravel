# Djiwa Travel project map

This document is the architecture and operations map for agents. It is source-
linked rather than an exhaustive duplicate of the codebase: when this file
drifts from source, source code, migrations, environment templates, and release
scripts win. Update the relevant section when a boundary changes.

## Product and runtime topology

Djiwa Travel is a TanStack Start application using Vite, React, TypeScript,
Tailwind, PostgreSQL, Drizzle metadata, and numbered SQL migrations. The app
contains two surfaces in one repository:

- Customer journeys: explore and catalog, destination/package detail, eSIM
  finder and installation, checkout/orders/receipts/refunds, profile and
  onboarding, support, notifications, wallet/top-up, and My Trips.
- Admin journeys: login, overview/dashboard, catalog, orders, provisioning,
  finance, payments/refunds, support, customers, team, settings, audit,
  analytics, and readiness/provisioning views.

The route source is [`src/routes/`](src/routes/), shared UI is in
[`src/components/`](src/components/), server integrations are in
[`src/lib/`](src/lib/), and database access is in
[`src/db/client.server.ts`](src/db/client.server.ts). The application shell is
[`src/routes/__root.tsx`](src/routes/__root.tsx); it must preserve the router
`<Outlet />` contract.

## Ownership and cross-project contracts

### Better Auth and customer identity

Travel uses the central Better Auth contract at
`https://api.djiwatentram.web.id/api/auth`, with the client setup in
[`src/lib/better-auth-client.ts`](src/lib/better-auth-client.ts) and server
session/identity code in [`src/lib/customer-session.server.ts`](src/lib/customer-session.server.ts),
[`src/lib/customer-identity.server.ts`](src/lib/customer-identity.server.ts),
and [`src/lib/customer-profile.server.ts`](src/lib/customer-profile.server.ts).

The verified HttpOnly session is the ownership source. Server code derives
`customer_auth_subject` from the authenticated Better Auth `user.id`, then
resolves canonical profile/source identity through the customer profile API.
Browser input must never choose an order owner, trip owner, wallet source, or
customer identity. A missing or mismatched session fails closed.

### Djiwa Pay boundary

The Travel wallet routes and server modules are an integration boundary, not a
second wallet system:

- [`src/routes/wallet.tsx`](src/routes/wallet.tsx) and
  [`src/routes/wallet.pay.tsx`](src/routes/wallet.pay.tsx) own the Travel
  presentation and embedded Pay handoff.
- [`src/lib/djiwa-pay-bridge.server.ts`](src/lib/djiwa-pay-bridge.server.ts),
  [`src/lib/djiwa-pay-topup.server.ts`](src/lib/djiwa-pay-topup.server.ts),
  and [`src/lib/customer-wallet.server.ts`](src/lib/customer-wallet.server.ts)
  validate the server-side bridge and scoped wallet reads.
- Djiwa Pay owns balance, ledger, settlement, and Mayar authority. Travel must
  not duplicate those records or accept payment credentials in the browser.

Djiwa Travel and Djiwa Tentram/Djiwa Pay remain separate repositories, apps,
databases, VPS hosts, domains, and release runbooks unless verified for the
specific task. Inspect the other repository's `AGENTS.md` before changing a
cross-project contract.

## Provider and integration map

| Boundary | Source locations | Ownership rule |
| --- | --- | --- |
| eSIM Access | `src/lib/esim-access*.ts`, `src/lib/esim-provisioning-refresh.server.ts`, `src/routes/api.webhooks.esim-access.$token.ts` | Credentials and webhook authentication are server-only; provisioning is retryable and idempotent. |
| Mayar | `src/lib/mayar-*.ts`, `src/lib/payment-snapshot.ts`, receipt/order routes | Mayar confirms payment; Travel records an auditable local state and keeps failed provisioning retryable. |
| Google Calendar | `src/lib/google-calendar.server.ts`, `src/routes/api.google-calendar.*.ts`, migration `019_google_calendar_sync.sql` | OAuth tokens stay server-side; redirect URI and event dates must be normalized; sync status is explicit and retryable. |
| Djiwa customer profile | `src/lib/customer-profile*.ts`, `src/routes/api.customer-profile.ts` | Profile/source identity is resolved from the authenticated subject, not request ownership fields. |
| AI gateway | `src/lib/ai/` and `.env.example` | API keys are server-only; redact customer/order data before provider calls. |
| Webhooks | `src/routes/api.webhooks.*.ts`, `src/lib/webhook-inbox.server.ts` | Authenticate, persist an idempotency key/inbox record, then process safely on retry. |

## Routes and module conventions

TanStack Start uses file-based routing. The authoritative conventions and
examples are in [`src/routes/README.md`](src/routes/README.md). Route files map
to URL paths; `$id` is a dynamic segment, `__root.tsx` is the root shell, and
[`src/routeTree.gen.ts`](src/routeTree.gen.ts) is generated and must not be
edited by hand. Use the source route directory for the current inventory.

Route groups are discoverable from these prefixes and files:

- Customer pages: `index`, `explore`, `catalog`, `destination.*`, `plan.*`,
  `finder`, `esim.*`, `checkout.*`, `order.*`, `receipt.*`, `profile`,
  `support`, `notifications`, `wallet*`, and `my-trips*`.
- Admin pages: `admin.*` and `admin.orders.*`.
- API/action routes: `api.*`, including auth, customer profile/support,
  wallet, Calendar, tasks, recovery, waitlist, and provider webhooks.

Use `.server.ts`/`.server.tsx` for modules that access PostgreSQL, secrets,
provider APIs, filesystem state, or privileged authorization. Server functions
and loaders/actions should call those modules; do not import credentials or
database clients into browser code. Shared presentational logic belongs in
`src/components/`, `src/hooks/`, and non-server `src/lib/` modules.

Tests are under [`src/test/`](src/test/), with server, route-auth, wallet,
Calendar, profile, and UI coverage. `routeTree.gen.ts` and build output are
generated artifacts. Do not hand-edit them to fix a route.

## Data model and migrations

PostgreSQL access is server-only. The current schema shape is represented by
[`drizzle/schema.ts`](drizzle/schema.ts) and the deployment migration history
is in [`migrations/`](migrations/). Migrations are numbered SQL files; the
inventory currently reaches `020_allow_overnight_itinerary.sql`, with some
parallel historical numbers. Inspect the migration tracking table and
`scripts/apply-migrations.sh` before deciding what is pending.

Use additive, reviewable migrations: add nullable columns/tables/indexes first,
backfill safely, deploy compatible code, then remove obsolete structures only
after all consumers are migrated. Never rewrite an applied migration or make
ownership queries broader to accommodate a UI shortcut. Trip, activity,
checklist, booking, budget, and expense records must remain scoped through the
authenticated trip owner; see [`src/lib/my-trips.server.ts`](src/lib/my-trips.server.ts).

## Local development and verification

The commands are defined in [`package.json`](package.json):

```bash
npm install
npm run dev       # local Vite/TanStack Start server
npm test          # full Vitest suite
npm run build     # production artifact
npm run lint      # ESLint
```

For focused work, run the smallest relevant test file first, then the full
suite and build. If the full suite has a pre-existing failure, record the
exact command, failing tests, and whether the focused checks are green.
`.env.example` documents variable names only; copy values into an ignored local
environment and never commit them. AI, eSIM, Mayar, Calendar, database, and
auth credentials must not use a `VITE_` prefix.

## VPS and release topology

The Travel production target documented by the deploy script is:

- checkout: `/home/ubuntu/djiwatravel`
- service: `djiwatravel.service`
- local listener: `127.0.0.1:3000`
- public origin: `https://djiwatravel.com`
- deploy entrypoint: [`scripts/deploy-vps.sh`](scripts/deploy-vps.sh)

The release flow builds locally, syncs migrations/scripts/source as configured,
applies pending SQL, uploads `.output` to staging, atomically swaps a
timestamped backup, restarts systemd, checks localhost routes, checks public
routes/assets, and rolls back the artifact if health checks fail. Read the
script before using flags such as `--no-migrate`, `--skip-source`, or
`--allow-unpushed`. Auto-deploy configuration is in
[`scripts/autodeploy.sh`](scripts/autodeploy.sh) and its systemd units.

The separate Tentram/Pay target is conventionally documented at
`/opt/djiwatentramapp` on its own `djiwa-vps` infrastructure. Never run a
Travel deploy script against that checkout or infer its database/service from
Travel's values.

## Release reporting contract

Use these distinct states in handoff notes:

1. local source changed;
2. commit created;
3. revision pushed to the intended branch;
4. artifact deployed to the intended VPS;
5. service/listener healthy internally;
6. public origin and user-visible route verified.

An HTTP 200 alone does not prove the expected source revision, authenticated
data, database migration, or deployed artifact. Verify the relevant marker,
route, service, and environment at each boundary.
