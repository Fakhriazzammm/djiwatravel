# Djiwa Travel lessons

This file is append-only in spirit. Add a new entry when an incident or
verification produces a reusable rule. Do not store credentials, cookies,
customer identifiers, raw payloads, or copied production logs here.

## Entry format

Use this structure for each new lesson:

```text
### YYYY-MM-DD — short context
- Symptom: what was observed.
- Evidence: source path, test, command, or safe status/error category.
- Root cause: the smallest verified explanation.
- Safe fix: the bounded change that resolved it.
- Prevention rule: what future agents must do first.
- Verification boundary: what was proven, and what remains unproven.
```

## Verified lessons

### 2026-10-30 — ownership comes from Better Auth

- Symptom: a customer-owned query or cross-app wallet flow can appear to work
  while using a browser-provided identifier.
- Evidence: `customer_auth_subject` predicates in
  `src/lib/my-trips.server.ts`, `src/lib/customer-support.server.ts`, and the
  session helpers in `src/lib/customer-session.server.ts`.
- Root cause: Travel data and the central Better Auth identity are separate
  boundaries; request fields are not proof of ownership.
- Safe fix: derive the subject from the verified HttpOnly Better Auth session,
  resolve the canonical profile/source server-side, and fail closed when the
  contract is unavailable.
- Prevention rule: never accept `userId`, owner, wallet source, or order owner
  from browser input; test both authenticated and mismatched-owner cases.
- Verification boundary: source-level ownership predicates and focused tests
  prove the application contract; they do not prove the live auth service is
  healthy without a live check.

### 2026-10-30 — OAuth redirect and verification are separate failures

- Symptom: Google Calendar can show `redirect_uri_mismatch`, or later show
  `access_denied` because the OAuth app is still in testing/unverified state.
- Evidence: callback/connect routes in `src/routes/api.google-calendar.*.ts`
  and the server configuration in `src/lib/google-calendar.server.ts`.
- Root cause: Google requires the exact callback URI to be registered, while
  OAuth consent/testing rules separately control which accounts can authorize.
- Safe fix: compare the generated callback URI character-for-character with
  the provider configuration; keep authorized test users/verification status
  correct for the selected OAuth mode. Never work around this by weakening
  redirect validation.
- Prevention rule: verify configuration and consent/testing state before
  debugging tokens or Calendar event payloads.
- Verification boundary: a successful callback proves authorization for that
  account and redirect; it does not prove every future user can authorize.

### 2026-10-30 — Calendar dates must preserve the trip timezone

- Symptom: an activity appears on the wrong day or at the wrong local time in
  Google Calendar even though it exists in the Travel itinerary.
- Evidence: Calendar adapter `src/lib/google-calendar.server.ts`, Calendar API
  routes, and migration `migrations/019_google_calendar_sync.sql`.
- Root cause: converting a date-only/local itinerary value through UTC before
  constructing the event changes its calendar day or time zone.
- Safe fix: normalize the activity date/time with the trip timezone, send
  explicit `timeZone` values, persist the provider event identity/status, and
  make retries idempotent.
- Prevention rule: add a boundary test for Asia/Jakarta and overnight
  itineraries whenever date parsing or event construction changes.
- Verification boundary: focused adapter tests prove normalization and request
  shape; only a live Calendar read-back proves the user-visible event exists.

### 2026-10-30 — Do not hide durable work behind fire-and-forget

- Symptom: the UI reports that a trip/activity was saved, but a related sync,
  notification, or provider operation fails after the response has returned.
- Evidence: async server functions and sync status handling in
  `src/lib/my-trips.server.ts`, `src/lib/google-calendar.server.ts`, and the
  Calendar status/sync routes.
- Root cause: unawaited work has no request-level error boundary and may be
  terminated with the process or leave no durable retry record.
- Safe fix: await user-critical writes; for asynchronous provider work, persist
  a pending/outbox state, expose retryable status, and log a redacted error.
- Prevention rule: every fire-and-forget operation must have a durable state,
  retry policy, and an observable failure path.
- Verification boundary: unit/route tests prove state transitions; a worker or
  production health check is needed to prove eventual delivery.

### 2026-10-30 — Trip delete must be owner-scoped and cascade deliberately

- Symptom: an existing trip detail page fails to load, or deleting a trip
  leaves activities, checklist items, bookings, budgets, or expenses behind.
- Evidence: owner predicates and delete ordering in
  `src/lib/my-trips.server.ts`, customer routes under `src/routes/my-trips*`,
  and migration `migrations/018_my_trips.sql`.
- Root cause: a trip ID alone is not authorization, and related records may not
  have database cascades or explicit application cleanup.
- Safe fix: require the authenticated subject in every read/update/delete and
  use verified foreign-key cascade or a transaction that removes dependents.
- Prevention rule: test direct URL access, wrong-owner access, successful
  deletion, and absence of dependent records after deletion.
- Verification boundary: focused route/database tests prove local behavior;
  production data deletion requires an explicit backup/rollback decision.

### 2026-10-30 — Applied migrations are additive and tracked

- Symptom: a deploy works against one database but fails on another, or a
  rollback leaves application code incompatible with the schema.
- Evidence: numbered files in `migrations/`, tracking logic in
  `scripts/apply-migrations.sh`, and deployment ordering in
  `scripts/deploy-vps.sh`.
- Root cause: schema state is environment-specific and published migrations
  cannot safely be rewritten.
- Safe fix: add a new numbered migration, apply it before code that requires
  it, keep old and new code compatible during rollout, and back up/inspect
  state before destructive work.
- Prevention rule: never edit an applied migration; use additive expand/verify/
  contract phases and record the pending migration set.
- Verification boundary: local migration application proves syntax and order;
  only the target database confirms production state.

### 2026-10-30 — Protected admin reads need explicit error states

- Symptom: an admin page remains on a skeleton or reports empty data when the
  protected read actually failed.
- Evidence: `src/lib/admin-read-model.server.ts`, admin guards, and admin route
  loaders under `src/routes/admin.*.tsx`.
- Root cause: `null`/loading state can mask a rejected protected request or an
  expired session.
- Safe fix: distinguish loading, ready, empty, and error states; keep the
  protected session/header boundary server-side and show a retryable message.
- Prevention rule: never interpret a failed protected read as an empty dataset;
  add an error-path test for each new admin read surface.
- Verification boundary: route tests prove state rendering; a live admin
  session check is required for deployed authorization behavior.

### 2026-10-30 — Source, artifact, service, and public checks are different

- Symptom: a public HTTP 200 is reported as a successful release while the
  wrong bundle, service, database, or route is active.
- Evidence: release phases and checks in `scripts/deploy-vps.sh`; Travel target
  is `/home/ubuntu/djiwatravel`, `djiwatravel.service`, and `127.0.0.1:3000`.
- Root cause: HTTP reachability does not identify the deployed revision or
  prove authenticated data and migrations.
- Safe fix: verify commit/artifact marker, active systemd service/listener,
  localhost routes, public routes/assets, and rollback backup independently.
- Prevention rule: report local, committed, pushed, deployed, internally
  healthy, and publicly reachable as separate states.
- Verification boundary: a deploy command can prove its own checks only for the
  target it reached; it does not prove the separate Djiwa Tentram VPS.

### 2026-10-30 — Server-only mocks can freeze browser hydration

- Symptom: production returns HTML and assets with HTTP 200, but the page stays
  white or becomes unresponsive after the splash disappears.
- Evidence: the served destination/order chunks contained `[import-protection
  mock]`; awaiting the mock's thenable prevented browser progress. Removing its
  thenable behavior in an isolated browser request exposed invalid mock data.
- Root cause: browser routes imported callable exports from `.server.ts` modules.
  Import protection replaced them with mocks instead of usable server RPC stubs.
- Safe fix: declare RPCs in `.fn.ts`, dynamically import validated server handlers,
  and keep provider data, credentials, and ownership checks in `.server.ts`.
  Checkout and plan RPCs return display projections only. Shared support contact
  constants belong in a client-safe module.
- Prevention rule: production import-protection violations must fail the build.
  Test hydration and client navigation against the built Node artifact; HTTP 200
  and splash animation alone cannot prove an interactive application.
- Verification boundary: local built-artifact browser checks establish the fix;
  production remains unchanged until a separately authorized release.

## Per-device data for a signed-in customer

- Symptom: the same login shows different orders, trip plan, or notification choice on laptop
  and phone.
- Root cause: QRIS/Mayar orders were bound only to a `localStorage` guest token (only `djiwa_pay`
  orders got `customer_auth_subject`), `claimGuestOrders` was never called, and the trip plan and
  notification choice lived only in `localStorage`.
- Safe fix: bind every order made by a signed-in session to the account, auto-claim the device's
  guest orders in `refreshOrdersFromServer`, and keep trip plan / notification choice in
  `customer_trip_plans` / `customer_preferences` (migration 028) with `localStorage` as cache.
- Prevention: any customer-visible state must have a server source of truth keyed by the verified
  session subject; `localStorage` is only a cache.

## Guest access window locked guests out and froze caches

- Symptom (2026-11-01): laptop, T3 browser and phone showed three different order lists for one
  customer; the phone showed an expired unpaid order as "Menunggu bayar" and ghost orders sat on
  the laptop.
- Evidence: production `customer_orders` held 6 rows, all guest (no `customer_auth_subject`), and
  every `guest_order_access.expires_at` was already in the past (TTL was one hour), including the
  paid `READY` order; `order_claim_events` was empty. The two laptop orders did not exist in the DB.
- Root cause: `GUEST_ACCESS_TTL_MS` was one hour, so after checkout the server refused the token
  and each browser kept a frozen `localStorage` copy; nothing was claimed because only the
  signed-out phone held the tokens; `refreshExpiredOrders` was never called; the merge kept cached
  orders the server no longer returned.
- Safe fix: 30-day guest window (`guest-access-policy.ts`, migration 029 extends existing rows),
  call `refreshExpiredOrders` on load, prune ghosts only when the server read succeeded
  (`order-cache.ts`), and prompt signed-out holders of guest orders to sign in so they can be claimed.
- Prevention: a bearer token's lifetime must cover the lifetime of what it protects; a cache must
  never outlive the server's ability to confirm it.

### 2026-11-01 — Route loaders must not fetch relative /api URLs

- Symptom: `/notifications` opened directly shows "Notifikasi belum dapat dimuat. Coba lagi
  sebentar." even though the customer has notifications and the API is healthy.
- Evidence: `src/routes/notifications.tsx` loader used `fetch("/api/customer-notifications?...")`;
  `node -e 'fetch("/api/x")'` fails with `ERR_INVALID_URL`, and the loader's catch turned that into
  the friendly error. Fixed by `src/lib/customer-notifications.fn.ts` (server functions).
- Root cause: during SSR there is no origin, so a relative `fetch` throws before any request is sent.
  The error was masked by a generic catch, which made it look like an API outage.
- Safe fix: loaders call `*.fn.ts` server functions directly (the pattern used by `my-trips.fn.ts`);
  relative `fetch` stays only in client event handlers.
- Prevention rule: in a route loader, never use a relative `fetch`; use a server function. Test
  the loader on a direct page load, not only on client navigation.
- Verification boundary: the Node-level failure and the contract test prove the cause and the
  source change; a direct page load against a database with notification rows is still needed.

### 2026-11-01 — A recorded migration can still have no tables

- Symptom: after the loader fix, `/notifications` still showed "belum dapat dimuat".
- Evidence: production `deploy_schema_migrations` listed `012_customer_notifications_refunds_wave4.sql`
  with a matching checksum, but `customer_notifications` and `customer_notification_states` did not
  exist; `scripts/apply-migrations.sh` skips recorded versions. The app query failed, and the loader
  turned that failure into the generic message.
- Root cause: the version was recorded without its SQL taking effect (baseline or manual record).
  The apply script trusts the record, so it never re-ran the file.
- Safe fix: run the already-tracked, additive, rerunnable (`create ... if not exists`) file once inside
  a transaction on the target database, then verify each table with `to_regclass`.
- Prevention rule: verify tables from a migration exist after a deploy, not only that its record
  exists; a baseline must never mark a file applied unless its schema is confirmed.
- Verification boundary: table existence and the unread-count query were confirmed on production;
  a signed-in browser check of the list is still needed. Other baselined migrations were not audited.

### 2026-11-01 — `--baseline` records migrations without running them

- Symptom: several production tables were missing although `deploy_schema_migrations` listed their
  migrations as applied; `esim_price_rule_events` was used by price-rule writes.
- Evidence: `scripts/apply-migrations.sh --baseline` inserts every file's checksum with no SQL run.
  A table audit across `migrations/*.sql` found five missing tables from `004_admin_operations.sql`
  and `010_catalog_pricing_rules.sql`. A column audit of `add column` statements found none missing.
- Root cause: the baseline marks files as applied on a schema that was never verified.
- Safe fix: take `pg_dump -Fc` first, then run the affected additive, idempotent files once each in a
  transaction (`-1 ON_ERROR_STOP=1`) and verify with `to_regclass`.
- Prevention rule: only run `--baseline` after verifying every recorded migration's objects; audit
  tables and columns after any baseline before trusting `--status`.
- Verification boundary: tables and columns were checked; indexes, views, and data-level effects of
  other baselined migrations were not audited.

### 2026-11-02 — Paid Mayar orders stayed `PAYMENT_PENDING`

- Symptom: a customer paid in Mayar; the member order never settled and no eSIM was provisioned.
- Evidence: the Mayar invoice was `paid` while `customer_orders.status` was `PAYMENT_PENDING`; the
  sweep logged `payment_method_mismatch`; `/api/tasks/esim-sync` answered 503; no timer called it.
- Root cause: (1) settlement inner-joined `guest_order_access`, which member orders do not have;
  (2) `ESIM_SYNC_TASK_SECRET` was unset and nothing scheduled the sweep; (3) finance settlement URL
  and secret were unset, so ledger posting queued; (4) `/var/lib/djiwatravel` was not writable by the
  service user, breaking the eSIM Access webhook receiver.
- Safe fix: left join with a `payment_provider = 'mayar'` fallback; set the secrets in
  `/etc/djiwatravel.env`; run `djiwatravel-esim-sync.timer` every 5 minutes on the Travel VPS.
- Related: the Mayar dashboard webhook pointed at a retired host, and Mayar "retry" resends to the
  URL stored on each history entry, so replay the stored payload to the current endpoint instead. The
  Tentram `pos.mayar_payment_events` queue needs `djiwa-mayar-processor.timer` to drain.
- Verification boundary: Travel finance posting was confirmed by the sweep report, not by reading
  the Pay ledger.

### 2026-11-03 — Halaman hanya skeleton setelah dua deploy bertabrakan

- Symptom: `djiwatravel.com` memuat tetapi hanya menampilkan skeleton; data tidak pernah muncul.
- Evidence: HTML merujuk `index-D_GZSaka.js` dan 4 JS lain yang dijawab **404** oleh Nitro maupun nginx,
  padahal file-nya ada di `.output/public/assets`. Dua cadangan `.output.bak-20261103-185521` dan
  `-185531` menunjukkan `.output` ditukar dua kali dalam 10 detik. Respons aset membawa
  `last-modified` yang berbeda dari manifest di `index.mjs` pada disk.
- Root cause: autodeploy dan sebuah deploy manual (`deploy-vps.sh`, tanpa `flock`) menukar `.output`
  bersamaan. Proses Node yang berjalan menyajikan aset dari daftar yang dimuat saat start (satu build)
  sementara chunk server dimuat malas dari folder yang sudah berisi build lain. Cek autodeploy lama hanya
  memastikan file ada di disk, jadi deploy rusak itu lolos.
- Safe fix: `sudo systemctl restart djiwatravel` (proses memuat build yang konsisten).
- Prevention rule: verifikasi deploy harus meminta setiap JS/CSS yang dirujuk beranda **lewat server**
  (sekarang di `autodeploy.sh` dan `djiwa verify`); `deploy-vps.sh` memegang `flock` yang sama dengan
  autodeploy; jangan menjalankan dua jalur deploy bersamaan.
- Verification boundary: pemicu deploy manual yang tepat tidak ditemukan di log.

## Customer pages shipped oversized on mobile (2026-11-03)

- Symptom: `/notifications` and `/wallet` looked like a scaled-up website on a phone: 28–38px titles and balances, 48px icons, 96px tiles, 44–48px buttons, so little content fit and the page scrolled as a whole.
- Root cause: no numeric size standard; each page picked "comfortable" values by feel, and the old design guidance said "generous breathing room".
- Safe fix: compact pass on both pages and a single scale in `DESIGN.md` ("Mobile compact scale"); notifications uses a fixed header with one inner scroll region.
- Prevention rule: build and fix customer pages to the compact scale, load the `djiwa-mobile-ui` skill, and add migrated pages to `src/test/mobile-compact-scale.test.ts`. Sheets and toasts must clear the tab bar.
- Verification boundary: sizes verified by source and tests; visual check on a 390×844 device is still manual.


## Agenda map: keep the map optional (2026-11-04)

- The map is an enhancement on top of the Agenda list. The route loader reads `itineraryMap` with a catch, the component loads MapLibre only in the browser, and a basemap or style error switches the map off while the list keeps working. Never make the Agenda depend on tile availability.
- Coordinates are stored only as a pair and only from a server-proxied place search; a typed location stays plain text. Do not put a geocoder or Google key in the browser. Exception (2026-11-08): the public Photon instance, which has no key, is called from the traveler's browser for venue suggestions because it refuses the Travel VPS address (`src/lib/browser-photon.ts`). It only adds suggestions, never blocks saving, and stays behind the Admin `placeSearch` switch. Never put a keyed provider there.
- Local `npm run build` can fail on `Rolldown failed to resolve import "canvg"` when the optional `canvg` dependency of `jspdf` is not installed; install it with `npm install --no-save canvg` before judging a build.

## Every deploy briefly showed "Halaman gagal dimuat" (2026-11-04)

- Symptom: customers, mostly logged-in ones, saw the root error screen ("Halaman gagal dimuat") right after logging in or while using the app; the site was fine a minute later.
- Evidence: nginx `error.log` had `connect() failed (111: Connection refused)` and the access log 502s only inside autodeploy restart windows (five deploys in one hour, 20-60 s each). Auth (`/api/auth/get-session` 200 in <0.3 s), the Travel database and both Helipod VPS were healthy; Google sign-in callbacks returned 302.
- Root cause: autodeploy stops the service, swaps `.output` and starts it (by design, see the swap lesson above), and `djiwatravel.service` had no `TimeoutStopSec`, so a stop took 20-30 s while the old node process drained. Logged-in pages call `/api/auth/get-session` and server functions constantly, so they hit the gap.
- Safe fix: systemd drop-in `/etc/systemd/system/djiwatravel.service.d/stop.conf` with `TimeoutStopSec=8`; nginx `error_page 502 503 504` serves `/var/www/djiwa-updating/updating.html` (an auto-refreshing "Sedang diperbarui" page, source `public/updating.html`, snippet `scripts/nginx/djiwatravel-updating.conf`); the root error component retries quietly up to 5 times per minute.
- Prevention rule: batch small commits instead of pushing one every few minutes; keep the stop timeout and the friendly 502 page when rebuilding the VPS. Status codes stay 502 so webhooks and fetch callers still retry.
- Verification boundary: the 502 page was installed and nginx reloaded cleanly, but only a real deploy proves it; the Tentram VPS disk was at 88.5% when checked and should be cleaned up separately.

### 2026-11-04 — A `date` column read as a JS Date is one day early on the Travel VPS

- Symptom: a date that is correct in the database shows or is sent one day earlier (an expense date,
  a Drive folder month, an event day in Google Calendar), but only on the VPS, not in CI.
- Evidence: the Travel VPS runs in `Asia/Shanghai` (+0800) and the Node service sets no `TZ`.
  node-postgres parses `date` into a Date at *local* midnight, so `toISOString().slice(0, 10)` gives the
  previous day: `TZ=Asia/Shanghai node -e "require('pg').types.getTypeParser(1082)('2026-11-04').toISOString()"`
  prints `2026-11-03T16:00:00.000Z`.
- Root cause: converting a date-only value through a Date and then through UTC.
- Safe fix: read date-only columns as text in SQL (`col::text`) and keep them as `YYYY-MM-DD` strings; never
  build a calendar day from `toISOString()` of a database Date.
- Prevention rule: for any new query that returns a `date`, cast it to text; run date-sensitive tests with
  `TZ=Asia/Shanghai` as well as the local zone.
- Verification boundary: the unit test for `calendarDate` uses a UTC-midnight Date, which is not what
  node-postgres returns on a +08:00 host; only a query result (or the `TZ=Asia/Shanghai` command above) shows it.

### 2026-11-07 — A public geocoder can refuse one VPS and work from every other host

- Symptom: Agenda place search showed "Pencarian lokasi sedang tidak tersedia" on production; the
  Ide tempat map check dropped every idea.
- Evidence: `scripts/djiwa logs travel --grep "itinerary-map"` showed `place search failed fetch
  failed` and `aborted due to timeout`. From the Travel VPS, `photon.komoot.io` returned
  `ECONNREFUSED` (Node and curl, IPv4 and IPv6). The same URL worked from the Tentram VPS and from a
  developer Mac. The Travel VPS had no local block (`ufw` inactive, OUTPUT ACCEPT, no hosts entry).
  `komoot.com`, Nominatim, Wikipedia and OpenFreeMap were reachable from the same VPS.
- Root cause: the public Photon instance refused this VPS's address, most likely an IP-level block
  on the provider side. This is inferred; the provider gave no reason.
- Safe fix: `place-search.ts` maps MapTiler and self-hosted Photon responses; `placeSearchTarget()`
  uses MapTiler when `MAPTILER_API_KEY` is set, Photon only when `PLACE_SEARCH_URL` is set, and
  otherwise reports unavailable. The public Photon instance is no longer a default.
- Prevention rule: before choosing a geocoder, run `curl` against its host from the production VPS
  that will call it, not from a developer machine. Check the provider's usage policy before the
  design: Nominatim's public server forbids search-as-you-type and bulk geocoding; Mapbox temporary
  geocoding forbids storing results; MapTiler's free plan is non-commercial.
- Verification boundary: the reachability tests and the handler tests (stubbed `fetch`) prove the
  code path. Whether a keyed provider answers correctly in production is unproven until a key is set
  and one live request is checked on the Travel VPS.

### 2026-11-09 — Photo upload returns 403 only on the public HTTPS origin

- Symptom: customer photo search failed with 403 on production while the same build passed tests and
  the official-link search worked; the browser console showed the failure only after a photo was picked.
- Evidence: `api.shopper-search.ts` compared the browser `Origin` header with `new URL(request.url).origin`.
  Nginx terminates TLS and forwards plain HTTP to `127.0.0.1:3000`, so the request URL is `http://…`
  while the browser sends `Origin: https://djiwatravel.com`.
- Root cause: deriving the public origin from the internal proxy request URL on a TLS-terminating host.
- Safe fix: `discoveryOriginAllowed` compares against the configured canonical `PUBLIC_APP_ORIGIN`
  (www alias allowed) and accepts the request URL only in development; the same configured origin is
  also required for payment return URLs. Production `/etc/djiwatravel.env` now sets
  `PUBLIC_APP_ORIGIN=https://djiwatravel.com`.
- Prevention rule: never build a public origin from `request.url` behind the Travel nginx; validate
  browser `Origin`/return URLs against a configured canonical origin, and set that variable before
  enabling a feature that depends on it.
- Verification boundary: verified with a real photo upload and an official-link search from the
  production customer page (HTTP 200, candidates with photos and JPY prices). A paid checkout through
  the discovery offer was not executed in production; only tests cover it.
