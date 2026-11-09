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

## End-to-end feature contract

Every new feature or feature repair is delivered as one complete capability
across the two product surfaces:

| Surface | Required question | Typical implementation |
| --- | --- | --- |
| Customer | How does a customer discover, use, complete, and recover from it? | Customer route/component, session-aware loader/action, visible loading/empty/error/success states, and accessible next action. |
| Admin | How does the team enable, configure, monitor, moderate, fulfill, or troubleshoot it for customers? | `admin.*` route or an existing admin settings/operations surface, protected reads/actions, audit/freshness state, and safe retry or correction control. |
| Shared contract | What makes the two surfaces agree? | Server-owned source of truth, authorization/ownership, migration/provider contract, idempotency, and tests covering the customer result after an admin change. |

Before implementation, record a surface matrix with the customer entry/result,
admin entry/control, source of truth, permissions, loading/empty/error states,
and proof command. A customer-only implementation is not complete when the
team cannot operate or support the capability. An admin-only control is not
complete when its effect is not observable in the customer journey. If a side
is genuinely not applicable, document the reason and the checked routes and
modules instead of silently omitting it.

The minimum trace is:

`customer route → customer state/action → shared server contract → database/provider → admin control/read model → customer-visible result`

For cross-surface changes, verify both route groups and both authorization
paths. Do not create a second source of truth in Admin for wallet, ledger,
settlement, Mayar, Better Auth identity, or other owned integrations.

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
- Direct eSIM wallet checkout uses the signed
  `POST /api/customer/travel-wallet-payment` contract. Configure the same
  server-only `DJIWA_TRAVEL_WALLET_PAYMENT_SECRET` in Travel and the Djiwa Pay
  auth-server before enabling it; never expose or commit its value.

Djiwa Travel and Djiwa Tentram/Djiwa Pay remain separate repositories, apps,
databases, VPS hosts, domains, and release runbooks unless verified for the
specific task. Inspect the other repository's `AGENTS.md` before changing a
cross-project contract.

## Provider and integration map

| Boundary | Source locations | Ownership rule |
| --- | --- | --- |
| eSIM Access + paid preorder | `src/lib/sellability*.ts`, `src/lib/esim-preorder*.ts`, `src/lib/mayar-provisioning.server.ts`, `src/lib/esim-preorder-queue.server.ts`, `src/lib/preorder-notifications.server.ts`, `/admin/preorders`, `src/routes/api.tasks.esim-sync.ts`, migration `046_esim_preorders.sql` | Known balance shortages can be paid as preorder; a serialized worker rechecks live provider price and balance before buying. A three-day deadline starts at verified payment; overdue orders enter Admin review and are never auto-refunded. Member/push and guest/member email notices are idempotent. Helipod Email uses server-only `HELIPOD_EMAIL_API_KEY` (or `HELIPOD_API_KEY`) and verified `HELIPOD_EMAIL_FROM`; delivery remains queued until configured. SEO indexes only sellable packages. |
| Mayar | `src/lib/mayar-*.ts`, `src/lib/payment-snapshot.ts`, receipt/order routes | Mayar confirms payment; Travel records an auditable local state and keeps failed provisioning retryable. |
| Google Calendar | `src/lib/google-calendar.server.ts`, `src/routes/api.google-calendar.*.ts`, migration `019_google_calendar_sync.sql` | OAuth tokens stay server-side; redirect URI and event dates must be normalized; sync status is explicit and retryable. |
| Google Drive + Sheets | `src/lib/google-account.server.ts` (one encrypted Google connection per traveler: tokens, scopes, revoke), `google-drive.server.ts` (receipt photos to the traveler's Drive, durable queue), `google-sheets.server.ts` (two-way sync of a trip's budget and expenses with a spreadsheet: orchestration), `google-sheets-model.ts` (pure: layout, reading cells, fingerprints, who-changed-what planner), `google-sheets-pull.server.ts` (applies the traveler's sheet edits to the database), `google-admin.server.ts` + `src/components/admin-google-panel.tsx` (Admin Settings), `src/routes/api.google-drive.ts`, `api.google-sheets.ts`, migrations `040_google_drive_sheets.sql`, `044_sheet_two_way.sql` | Same token table as Calendar (`customer_google_calendar_connections`, AES-256-GCM, key from env). Only the file-level `drive.file` scope; never full Drive. Our database stays the source of truth: a receipt photo leaves Postgres only after a confirmed Drive upload, failures stay `failed`/`revoked` and retryable, and Sheets is two-way: each sync first pulls the sheet's edits into the database (rows matched by ID; a row changed on both sides keeps the app version; invalid rows are skipped and reported; mass deletions are held), then rewrites the managed columns (Pengeluaran A:I, Rincian A:G, Anggaran A:F) so formulas always tie budget and expenses together. Column J onward is the traveler's. Apply migration 040 before deploying this code. |
| Rincian item pengeluaran | `src/lib/expense-items.ts` (pure total rules), `expense-items.server.ts` (read, add/change/delete one item, change name/date/category; owner-only), `expense-items.fn.ts`, `src/components/expense-detail-sheet.tsx`, migration `043_expense_items.sql` | Items live in `travel_expense_items` (original currency, minor units). Changing or deleting an item moves the expense total by exactly that amount (tax/service kept) and re-queues the Sheets export. Scan and manual saves store the receipt lines; older expenses only have the text note. Admin sees item counts in Settings → Scan struk. |
| Scan struk | `src/lib/receipt-scan.ts` (pure: Admin config, AI answer cleaning, sum-vs-total validation, cost/quota math), `receipt-scan.server.ts` (AI call to the Helipod AI Gateway, ECB rate via Frankfurter, scan log/quota, saving expenses, photos, Admin stats), `receipt-scan.fn.ts`, API routes `api.receipt-scan.ts` (multipart photo) and `api.receipt-photo.$id.ts`, client `receipt-scanner*.tsx`, `receipt-scan-entry.tsx`, `receipt-scan-client.ts`, `receipt-image.ts`, `receipt-queue-store.ts` (IndexedDB), Admin panel `admin-receipt-scan-panel.tsx` in `/admin/settings`, migration `039_receipt_scans.sql` | Server-only `HELIPOD_AI_KEY` (optional `HELIPOD_AI_BASE_URL`); without it the Scan button is hidden. Admin setting `receiptScan` (kill switch, save photo, strong-model retry, 30 scans/day, 10 photos/scan, 6 MB, models) is versioned and audit logged. A read is cross-checked (items must add up to the total) and doubtful ones are marked "Perlu dicek"; photos are kept only when the traveler keeps them (unsaved ones are purged after a day). nginx needs `client_max_body_size 8m`. |
| Ide tempat (Agenda) | `src/lib/place-ideas.ts` (pure: Admin config, categories, what the AI may return, cache keys, suggested time slot), `place-ideas.server.ts` (TinyFish search + fetch, Helipod AI Gateway summary, map check via the place geocoder (`placeSearchTarget`), Wikimedia photo via `lookupPlaceImage`, shared cache, daily quota, Admin stats/hide/clear cache), `place-ideas.fn.ts`, customer `src/components/place-ideas.tsx` (small carousel at the top of the Agenda, "Ke mana lagi ya?" sheet from the mascot bubble or "Lainnya", detail with day and time, undo toast), Admin panel `admin-place-ideas-panel.tsx` in `/admin/settings`, migration `045_place_ideas.sql` | Server-only `TINYFISH_API_KEY` and `HELIPOD_AI_KEY`; without both the feature is hidden. The AI only picks places named in fetched pages, each must be found on the map within 60 km of the trip destination or it is dropped. Fresh searches are limited per traveler per day; answers are cached per city and category (default 7 days, shared, free). TinyFish free tier is about 5 searches/minute for the whole key, so the server allows 4 and answers "busy". Admin setting `placeIdeas` (kill switch, carousel on/off, daily limit, cache days, ideas per search, model) is versioned and audit logged; Admin can hide an idea for everyone. Photos are Wikimedia only when they clearly match the place, otherwise a category illustration. Apply migration 045 before deploying. |
| Travo, asisten perjalanan (obrolan AI di Ringkas; nama dari `ASSISTANT_NAME` di `trip-assistant.ts`) | `src/lib/trip-assistant.ts` (pure: Admin setting `tripAssistant`, intents, the flat JSON schema the model must answer, `cleanAssistantReply` which validates a proposal against the trip, money rounding, local nudges, context and prompt builders), `trip-assistant.server.ts` (config, daily quota per traveler or guest, Helipod AI Gateway call, history, proposals apply/undo/dismiss, Admin stats/save/clear, retention purge), `trip-assistant.fn.ts`, customer `src/components/trip-assistant.tsx` + `trip-assistant-cards.tsx` (conversation under the Ringkas map; the Agenda, Perlu perhatian and Sisa anggaran cards live inside it; quick replies, typed input, proposal cards with Terapkan / Urungkan), wired in `trip-overview.tsx` (`staticCards` + `assistantOn` fallback to the old layout), Admin panel `admin-trip-assistant-panel.tsx` in `/admin/settings#assistant`, migration `058_trip_assistant.sql` (`travel_assistant_messages`, `_proposals`, `_runs`) | Server-only `HELIPOD_AI_KEY` (no new variable); without it, or with the switch off, the chat is hidden and Ringkas looks as before. **The AI only proposes.** One JSON answer per turn (`reply`, `chips`, `kind` agenda/budget/checklist/expense + payload); the server cleans it (ids must belong to the trip, dates inside the trip, times valid, money rounded to whole units and stored as minor units, budget split scaled to its total, Admin `allowAgenda`/`allowBudget`) and stores the proposal. The browser only ever sends a proposal id: `Terapkan` claims it (`proposed` -> `applied`, so a double tap or second device cannot apply twice), writes through the existing `addItineraryItem` / `updateItineraryItem` / `deleteItineraryItem` / `addBudgetCategory` / `patchBudgetCategory` / `updateTrip` / `addChecklistItem` / `addExpense` (so Calendar and Sheets sync keep working), records what it changed, and rolls back on a partial failure; `Urungkan` restores from that record. Owner comes from `resolveTripOwner()`, so **guests (HttpOnly guest cookie) can use it** under Admin `guestEnabled` and their own daily limit. Models: `glm-5.3-flash` for talking, `glm-5.3-flashx` for building (itinerary, budget, tidy), both chosen in Admin (about Rp 12 and Rp 30 per call at the 2026-11 prices; the cost is logged per call). Places come from the model plus verified ideas in the shared `travel_place_idea_cache`; hours are marked `cek jam buka` when unknown, nothing is verified live. Admin sees counts, guest share, failure rate, proposals applied/undone, cost, and recent calls **without message text**; "Hapus semua riwayat" is audited; conversations are purged after `historyDays` by the minute task (hourly throttle). Receipt photos still go through Biaya (the chat links to it). **Streaming:** the server function `streamTripAssistantMessage` (an async generator, `X-Accel-Buffering: no` so nginx does not hold chunks) forwards the model's SSE stream; `extractReplyPrefix` decodes the `reply` field while the JSON is still arriving, `done` carries the stored messages, and the client falls back to the plain request if streaming fails. **Place check** (`trip-assistant-places.server.ts`, Admin `verifyHours`): each new place is looked up in Nominatim (one request a second, bounded around the trip's city, or around the first place's area when the trip has no city) and, when OpenStreetMap has `opening_hours`, `opening-hours.ts` decides open/closed for that weekday and time; the card shows "Buka ... (OpenStreetMap)" or a warning, the activity gets a map point (pin), and no data or seasonal hours stay "cek jam buka". Nothing is verified against the venue itself. **Reminders** (`trip-assistant-reminders.server.ts`, Admin `reminders`, on the `/api/tasks/esim-sync` timer every 30 minutes, 08:00-20:00 Jakarta): members only, at most one per traveler per day, each reminder once (event key), through `createCustomerNotification` (inbox + web push). **Receipts:** the camera chip opens the existing `ReceiptScanner` for members when the scanner is on. Apply migration 058 before deploying. |
| Agenda map | `src/lib/itinerary-map.ts` (pure config, pin model, Google Maps links), `itinerary-map.server.ts` (config, place-search proxy, Admin save + usage), `itinerary-map.fn.ts`, `src/components/itinerary-map.tsx` (MapLibre + OpenStreetMap, browser only), `place-search-field.tsx`, Admin panel `admin-itinerary-map-panel.tsx` in `/admin/settings`, migrations `037_itinerary_map_points.sql` and `038_itinerary_place_image.sql`, `place-image.ts` (Wikipedia thumbnails), `patchItinerary` edit action | Optional `latitude`/`longitude`/`place_label` on `travel_itinerary_items`; items without a point keep working. Place search goes through the server (`place-search.ts` for URLs and mapping; `itinerary-map.server.ts` picks the provider in order: MapTiler when `MAPTILER_API_KEY` is set, a self-hosted Photon when `PLACE_SEARCH_URL` is set, otherwise the offline GeoNames gazetteer: `place-gazetteer.server.ts` queries `geo_places` (migration 047, loaded by `scripts/import-geonames.mjs`, CC BY 4.0 attribution shown under suggestions) for towns and districts only; the public Photon instance is not used because it refuses connections from the Travel VPS), is per-customer rate limited, and needs no browser key. Admin `admin_settings.itineraryMap` is the kill switch (`enabled`, `placeSearch`, allow-listed `styleUrl`) and is audit logged. Admin also switches the Ringkas map (`summaryMap`: the map-first trip overview in `src/components/trip-overview.tsx`, which also carries the former Mode perjalanan (now/next activity with a route link, open checklist, remaining budget and quick expense; `/my-trips/:id/travel` redirects to the overview), and the Home trip card (`home-my-trips-widget.tsx`: schematic route preview from `trip-mini-route.tsx`, today's weather chip, next activity, four numbers and a "Buka Ringkas" button; it follows the same `summaryMap` and `weather` switches), with the Agenda map's expand, focus and "Lokasi saya" buttons and a per-day weather strip (`trip-weather*.ts`: Open-Meteo through a server proxy, `WEATHER_API_URL` to self-host or use a paid endpoint, Admin `weather` switch, forecast only for today through 16 days and only for days with a map point), with pins per day, "Lokasi saya", the day's agenda and add/edit/delete via `?add` / `?edit` on the section routes), the category helper, "Lokasi saya" (browser GPS, never stored) and place photos (Wikimedia only, cached on the item). Other days stay on the map in grey; focus mode frames only the selected day. Navigation is a plain "Buka di Google Maps" link; the Calendar event description carries a map link. Trip cities (migration `048_trip_cities.sql`, table `travel_trip_cities`, `src/lib/trip-cities.ts`, `trip-cities-sheet.tsx`, `postTripCities`): Ringkas asks "Mau ke kota mana saja di <negara>?" once for a trip without cities (popular chips per country, search for others, "Lewati dulu" remembered per trip on the device); the chosen cities frame the Ringkas/Agenda maps and scope place search (`searchPlaces` takes `near`, results beyond 60 km are dropped, Photon/MapTiler get it as proximity). "Tambah aktivitas" now starts with "Cari tempat" (city chips, no map zoom needed); picking a place fills the title and category. Admin `itineraryMap.cityOnboarding` switches the question and the scoping, and the panel shows how many trips chose cities. Place search for restaurants and attractions still needs MapTiler or a self-hosted Photon; the GeoNames fallback finds towns only. Before any activity has a point, the Ringkas and Agenda maps open on the trip's destination country: `src/lib/trip-country-bounds.ts` maps the ISO code chosen in the country picker (new trip or edit sheet) to a static box, so no geocoder is needed. |
| Lalu lintas Admin (IS the `/admin/dashboard` page, `?range=24j|7h|30h|all`; `/admin/traffic` and `/admin/analytics` redirect there; the old KPI dashboard and Home eSIM funnel panel were removed from it) | `src/lib/traffic-census.ts` (pure: user-agent classes, channels, countable-request rules), `traffic-hits.server.ts` (called from `src/server.ts`), `traffic-dashboard.ts/.server.ts/.fn.ts`, `src/components/admin-traffic-panel.tsx`, `admin-traffic-parts.tsx`, migration `057_traffic_census.sql`, client `trackOrderStart` in `analytics.ts` | People come from the browser beacon (`site_events` page_view); crawlers do not run it, so `server.ts` logs automated HTML requests (bot name, class and path only, no IP or user agent) into `traffic_bot_hits`: AI answer fetchers (ChatGPT-User, Claude-User, Perplexity-User), AI search/training crawlers, search engines; unidentified automation is shown as "tidak dihitung". Bot names are claims, not verified by network address. Sales (eSIM, preorder, Titip Belanja paid orders) come from `customer_orders`/`shopping_orders`; attribution to a visit source uses the `order_start` site event (target = order id) sent after checkout creates the order, otherwise "Tidak terlacak". Apply migration 057 before deploying; without it the page says unavailable. |
| Tiket pesawat (`/tiket`) | `src/lib/flights.ts` (pure: Admin config, search validation, provider-row normalizing, Aviasales booking link, formatting, `flightsPathFor`), `flights.server.ts` (config read cached 60 s, Admin save with version check + audit log, place autocomplete, price search, caches, rate limit, in-process counters), `flights.fn.ts`, route `src/routes/tiket.tsx`, `src/components/flight-search.tsx` (form + results switch), `flight-results.tsx` (results screen: price calendar, White Label embed or recorded-fare list, detail sheet), `flight-place-field.tsx`, `src/hooks/use-flights-config.ts`, entry points: Home hero tab (`home-hero.tsx`, eSIM stays default), "Tiket" tile (`travel-services.ts` id `flights`, replaces the old Transportasi tile; `explore/service-category-grid.tsx` hides it when off) and the Ringkas card (`trip-overview.tsx`, fed by `my-trips.$tripId.tsx`); script loader `travelpayouts-loader.tsx` + root loader in `__root.tsx`; Admin panel `admin-flights-panel.tsx` in `/admin/settings` | Djiwa never sells or takes payment for flights: it searches cheapest fares from the Travelpayouts/Aviasales Data API (`prices_for_dates`, cached by Aviasales, not real time; city/airport autocomplete is a public endpoint) and opens Aviasales in a new tab with our marker (`marker=<partnerId>` added to the API's relative `/search/...` link; any other link is dropped). Server-only `TRAVELPAYOUTS_TOKEN` (header `X-Access-Token`, never in a URL or `VITE_`); without it, or with the switch off, `/tiket` says "belum tersedia" and every entry point is hidden. **Results screen (design B):** our header, then a price calendar (one call per route and month: the provider keeps only the cheapest fare per departure day, so a day search returns one row and a round trip often none), then the full real-time results from Djiwa's Travelpayouts **White Label of type Widget** (`wl_id` 24328, default of `flights.whiteLabelId`), shown in a **same-origin frame**: `TravelpayoutsWidget` renders `<iframe src="/tiket-widget.html?flightSearch=<code>#<wl_id>">` and `public/tiket-widget.html` loads the partner script (`https://tpwdgt.com/wl_web/main.js?wl_id=<id>`; the docs say `tpwgts.com`, the dashboard code says `tpwdgt.com`) into a bare `<div id="tpwl-tickets">`, themes it with CSS variables (Djiwa red, system font) and posts its height to the parent (`djiwa-tpwl-height`, checked by origin and source). **Never run the widget script in the app page**: its stylesheet carries a global reset (margin, padding, font-family on html, body, div, p, a, h1 ... in its own cascade layer) that beats Tailwind, turned the whole app into Times with no spacing, and stayed after leaving /tiket. The widget reads `?flightSearch=<ORIGIN><DDMM><DEST>[<DDMM>]<adults>` (`whiteLabelSearchCode`, e.g. `CGK0812TYO1`; verified in a real browser on production: it fills and searches by itself); changing the day in the calendar opens a new frame. Only the form of the widget is left out (our own form and the "Ubah" button replace it). The Widget type needs no subdomain, CNAME or DNS (the Page type would need a CNAME to `whitelabel.travelpayouts.com`, a subdomain and about 48 h for SSL; not used). The frame loads only after the visitor presses "Setuju dan buka" or accepted cookies. Empty `whiteLabelId` turns it off (the results screen then lists the recorded fares and booking goes through the API link). Appearance beyond what the frame page overrides (colors, font, radius) and language are set in the Travelpayouts dashboard (WL Web > the Widget). The provider's search API answers 403 to headless Chrome with the default user agent (bot protection); a normal browser user agent works. White Label pays 30% of Travelpayouts' reward and does not offer Booking.com fares. Guests may search (Admin `guestSearch`), limited per member or per `X-Real-IP` (nginx sets it) to `searchesPerHour` (default 20); identical searches share a 30 minute cache that is not counted. Admin setting `flights` (master switch, hero tab, tile, guest search, hourly limit, partner script, ids, consent wait) is versioned and audit logged and shows token present/missing, searches since restart and clicks to the partner and opens of the full results in the last 7 days (`site_events` click targets `flights_aviasales`, `flights_embed_open`). The Travelpayouts script (`emrldtp.cc/<scriptId>.js?t=<marker>`, ids public) never loads in Admin and by default waits for "Setuju"; Admin can lift the wait for site verification.  **Results extras (migration `049_flight_features.sql`; `flight-features.server.ts`, `flight-actions.tsx`, route `bagikan-tiket.$token.tsx`; each has an Admin switch in the `flights` setting and its numbers in Admin › Tiket):** (1) *Pantau harga* (`priceAlerts`, `alertsPerMember`): bell in the results header, `travel_flight_alerts`, checked every 6 h by `sweepFlightAlerts()` which rides the existing `/api/tasks/esim-sync` timer (no new systemd unit), notifies once per new low through `createCustomerNotification` (type `trip_flight_price`, event key `flight-alert:<id>:<price>`) with a `/tiket?dari&ke&berangkat` link; (2) *Simpan ke perjalanan* (`saveToTrip`): the detail sheet of the chosen day's recorded fare adds one Agenda item per leg (category `flight`) through `addItineraryItem`, trip ownership checked server-side; (3) *Saran tanggal hemat* (`dateInsight`, `insightMinPercent`): banner from the price calendar, pure client; (4) *eSIM tujuan* (`esimOffer`): card in the detail sheet linking `/destination/<ISO2>` when the destination country is not Indonesia (needs `FlightPlace.countryCode`); (5) *Bagikan & voting* (`share`, `shareDays`): up to 3 validated fare snapshots in `travel_flight_shares` (token only, no personal data, no booking link), public page `/bagikan-tiket/<token>`, one vote per member in `travel_flight_votes`, Admin can close all open links (audit logged). The widget frame (`public/tiket-widget.html`) is versioned with `FRAME_VERSION` in `flights.ts`: bump it when that file changes. The cards inside the frame come from the partner and cannot be wired to these features; the "Termurah tercatat" card above them is ours. No migration. |
| Titip Belanja (`/titip-belanja`) | `src/lib/personal-shopper.ts` (pure: config, countries and brands, price rule, search/filter/sort, store-item mapping, order statuses), `personal-shopper.server.ts` (catalog cache refresh, order + Mayar invoice, settlement, Admin actions), `personal-shopper.fn.ts`, `src/hooks/use-shopper-status.ts`, customer routes `titip-belanja.index.tsx` (home: country segment, search, brand stories, Trending/Terlaris rails, filter/sort sheets, cart, address, pay), `titip-belanja.pesanan.index.tsx` and `titip-belanja.pesanan.$id.tsx` (orders, timeline, pay/verify), UI in `src/components/shopper/`, Admin route `admin.shopping.tsx` (Pesanan, Katalog, Pengaturan), Home tile in `explore/service-category-grid.tsx`, migration `050_personal_shopper.sql` | Djiwa buys from the official store on the customer's behalf. The catalog is read from the stores' own public JSON (`<store>/jp/api/commerce/v5/ja/products?q=`: Uniqlo and GU share one adapter) with a plain bot-free request, cached in `shopping_catalog_items` (refreshed by the `/api/tasks/esim-sync` timer, fire and forget, every `catalogRefreshHours`; a changed format drops items, never wipes the cache) and never copied wholesale to the browser's origin: images stay on the store CDN and every product links back to the store. Treat the endpoint as undocumented: Admin › Titip Belanja › Katalog shows the last runs and errors. Names are Japanese; when `HELIPOD_AI_KEY` is set the refresh also stores a short English name (`name_id`). **Trending** is the store's own ordering across seed searches; **Terlaris** is Djiwa paid units in the last 90 days, falling back to the store review count (labelled "ulasan", never presented as sales). Orders are independent from `customer_orders`: own Mayar invoice (`shopping_orders.invoice_id/transaction_id`), created once (a timeout adopts an existing invoice instead of creating another), and settled only when Mayar reports `paid` for the exact total (customer return, the minute sweep and the Tentram forward hint all call `settleShoppingOrder`; unpaid orders expire after `paymentWindowMinutes`). Finance posting reuses `postTravelFinanceSettlement`; a failure is stored in `finance_error` and Admin can resend. Admin moves an order PAID → PURCHASED → SHIPPED (tracking number required) → ARRIVED → DELIVERED, can cancel before shipping (a paid cancel sets `refund_needed`; the refund itself is made in Mayar by the team), and every status change notifies the customer (`shopping_order`). The price is quoted by `quoteShopperOrder` (goods x rate + fee rounded up to Rp 100 + one shipping charge) in the cart and billed from the same function on the server; the store price is the cached one, so Admin checks the store link before buying and cancels if it changed. Admin setting `personalShopper` (master switch, countries, brands, fee %, shipping, rates, payment window, limits, rails) is versioned and audit logged; it ships **off**. Only Japan is live; other countries show "Segera hadir" with the waitlist. **Marketplace links (Mercari, Rakuten; migration `052_shopper_market.sql`, `src/lib/shopper-market.ts` pure rules, `shopper-market.server.ts`, `MarketSheet` in `shopper-sheets.tsx`):** pasting a single item link in "Tempel link" reads the page through the TinyFish Fetch API (`api.fetch.tinyfish.ai`, live read with `ttl: 0`, free tier shared with Ide tempat, in-process limit of 24 reads a minute) and prices it by the same rule as the catalog. The price is read only from the page's own metadata (Mercari `product:price:amount`, Rakuten `itemprop=price`; a missing price, non-JPY currency or a value outside ¥100-2.000.000 means no sale, never an AI guess); stock comes from the Mercari buy button / Rakuten `availability`. Only `jp.mercari.com/item/m…` and `item.rakuten.co.jp/<shop>/<item>/` over HTTPS are fetched, images only from their CDNs. Each member has `market.lookupsPerDay` live reads (fresh cached copies within `market.cacheMinutes` are free). Mercari items are single; Rakuten needs the customer to name the size/color because the page cannot give it. A flat `market.domesticIdr` per marketplace line (estimate for delivery inside Japan, stored in `shopping_orders.domestic_shipping_idr`) is added outside the service fee. At checkout the server reads the page **again**: sold out, a changed price (`expectedUnitMinor`) or a missing variant refuses the order. Admin › Titip Belanja › Pesanan shows the source link and the customer's variant, and "Cek ulang harga & stok" re-reads every marketplace line before buying (sold / price changed are shown; a paid cancel sets `refund_needed`). The whole group ships **off** (`market.enabled`) and has its own per-site switches. Marketplace pages are third-party and may change: a failed read tells the customer to ask the team and never blocks the catalog. **Bag brands (migration `053_shopper_bags.sql`, `src/lib/shopper-bags.ts`):** Legato Largo and anello are read from Carrot Online's public search pages (`/p/search?keyword=…&page=n`, Future Shop markup, up to 3 pages) and Longchamp from its Japan search pages (`/jp/ja/search?q=`, one tile per colour and product id). Both are server-rendered HTML parsed by pure functions; a tile without a code, JPY price or name, a brand mismatch, or a Carrot product with every colour out of stock is dropped, and colour stock is read per colour so sold-out colours are not offered. They use the same category (`Tas`), cache table, refresh task, quote and checkout as Uniqlo and GU; bags have no sizes (order lines store `-`). Admin › Pengaturan › Brand switches them; Katalog shows each brand's last run. The catalog price is the cached one, so Admin still checks the store link before buying. **Explanation for customers:** `shopper-about.tsx` shows a collapsed "Apa saja yang bisa dititip?" card under the search (what can be sent, four steps, and "Tidak bisa dititip") and a "Biaya ini untuk apa?" note in the cart. Titip Belanja is for physical goods from Japan; flights, eSIM and hotels stay in their own services. The not-allowed list is the Admin setting `personalShopper.prohibited` (up to 12 lines of 2-80 characters, edited in Pengaturan, versioned and audit logged). **Photo viewer (migration `054_shopper_gallery.sql`, `shopper-viewer.tsx`):** tapping a product photo in a rail, the list, the product sheet or the marketplace sheet opens a full-screen viewer (swipe between photos, pinch or double-tap to zoom, thumbnails, one footer action). Photos are the colour photos plus `shopping_catalog_items.gallery` (Uniqlo/GU `images.sub`, Carrot carousel, Longchamp second shot); `productGallery` orders and dedupes them. `imageVariant` asks the Uniqlo and Longchamp image servers for the right width (`?width=` / `sw`+`sh`), so lists load small files and the viewer a large one. A NULL `gallery` means "not read yet": the sweep refreshes until none are left, then marks rows the stores no longer list as read. Needs `MAYAR_API_KEY`; apply migrations 050, 053 and 054 before deploying. |
| Pencarian barang Jepang (link/foto) | `src/lib/shopper-discovery.ts`, `shopper-discovery.server.ts`, `shopper-discovery.fn.ts`, API `api.shopper-search.ts` + `api.shopper-photo.$id.ts`, customer `shopper-discovery.tsx` (search sheet), Admin Titip Belanja → Pesan (`admin-shopper-chat.tsx`), migration `051_shopper_discovery.sql` | Design A buttons below search. Official Uniqlo/GU Japan product codes resolve against cached catalog or fixed official API hosts. Other HTTPS URLs (including Mercari) are private references for manual verification; never fetched. Vision extracts terms/codes only and returns catalog candidates, never authoritative prices. Verified customer session owns every request/photo; Admin guard controls triage and versioned offers. `shopperDiscovery` setting controls kill switch, photo AI, per-customer daily limits and global daily photo AI call cap. Photos expire in 7 days for drafts or 90 days for submitted requests; the minute sweep purges bytes. Admin verifies seller/condition/variant/availability in Japan, then quotes JPY goods, a frozen JPY rate, domestic shipping/service/international shipping in IDR. A row-locked, version-checked acceptance creates one existing `shopping_orders` order and reuses Mayar/Finance/fulfillment; payment failures preserve the order and retry uses the same invoice. New schema is additive; rollback app only, retain data. |
| Pesan Titip Belanja (chat) | `src/lib/shopper-chat.ts` (pure: stage, quick replies, offer state, opening hours and reply target, message cleaning), `shopper-chat.server.ts`, `shopper-chat.fn.ts`, API `api.shopper-chat.ts` (send with optional photo) + `api.shopper-chat-photo.$id.ts`, customer `shopper-chat.tsx` + `shopper-chat-parts.tsx` (routes `/titip-belanja/pesan` and `/titip-belanja/pesan/$id`), Admin `admin-shopper-chat.tsx` (tab Pesan), hook `use-chat-unread.ts`, migration `055_shopper_chat.sql` | Replaces the old request form and the "Permintaan pencarian" list in Pesanan. A thread is one discovery request (kind `REQUEST`) or one order (kind `ORDER`, "Tanya soal pesanan ini"); messages live in `shopping_chat_messages` (sender CUSTOMER/ADMIN/SYSTEM, `internal` notes only the team sees, JSON `card`), photos in `shopping_chat_attachments` (5 MB, 90 days, owner or Admin only). The request tables keep the state machine: team actions (Mulai cari, Minta info, Tidak ditemukan, Kirim penawaran) still call `adminDiscoveryAction` and customer actions (decline, cancel, new offer, accept) still call `customerDiscoveryAction` / `acceptDiscoveryOffer`; each writes into the thread through `chatRequestEvent`, order status changes through `chatOrderEvent` (from `notifyOrder`). Prices are never typed in chat: an offer is a card built from the versioned `DiscoveryOffer`; only the latest card is live, older ones show "Diganti", and its state (Menunggu, Kedaluwarsa, Ditolak, Menunggu bayar, Dibayar) is derived from the request and the order. A customer reply while the request is NEEDS_INFO moves it back to SUBMITTED. The tracker (Dikirim, Dicari, Penawaran, Bayar) comes from `chatStage`. Opening hours are WIB (`openHour`/`closeHour`), `replyTargetMinutes` sets `response_due_at` (clock starts at the next opening when closed) and drives the Admin queue timer and the customer promise line. Limits: 10 messages a minute, `dailyMessages` a day, 2000 characters, max 3 https links, 30 photos per thread. Threads idle for `idleCloseDays` are closed by the minute task and reopen on a new message. Customers are notified with the existing push (one alert per thread per 5 minutes); Admin has no push yet, only the unread/late count on the tab and a 15 s refresh. Requests made before chat existed get a thread built from their events on first view. Settings live in the `shopperDiscovery` setting (chat fields have defaults, so older saved values stay valid). Apply migration 055 before deploying. |
| Djiwa customer profile | `src/lib/customer-profile*.ts`, `src/routes/api.customer-profile.ts` | Profile/source identity is resolved from the authenticated subject, not request ownership fields. |
| AI gateway | `src/lib/ai/` and `.env.example` | API keys are server-only; redact customer/order data before provider calls. |
| Webhooks | `src/routes/api.webhooks.*.ts`, `src/lib/webhook-inbox.server.ts` | Authenticate, persist an idempotency key/inbox record, then process safely on retry. |

### Mayar webhook ownership

Mayar allows one webhook URL per account, and that account also serves Djiwa Tentram. Tentram owns
the slot (`supabase/functions/mayar-webhook` on `vps-djiwa-tentram`); after enqueuing an event it
sends an HMAC-signed, identifiers-only hint to `POST /api/webhooks/mayar-forward` here. Travel never
trusts the hint: it re-reads the transaction from Mayar and settles only when Mayar reports it
`paid` for the exact order amount, and the one-minute task sweep (`/api/tasks/esim-sync`) covers a
lost hint. `DJIWA_TRAVEL_CALLBACK_SECRET` must equal the Tentram edge-runtime value, and
`DJIWA_TRAVEL_CALLBACK_URL` on Tentram points at `/api/webhooks/mayar-forward`.

## Routes and module conventions

TanStack Start uses file-based routing. The authoritative conventions and
examples are in [`src/routes/README.md`](src/routes/README.md). Route files map
to URL paths; `$id` is a dynamic segment, `__root.tsx` is the root shell, and
[`src/routeTree.gen.ts`](src/routeTree.gen.ts) is generated and must not be
edited by hand. Use the source route directory for the current inventory.

Route groups are discoverable from these prefixes and files:

- Customer pages: `index`, `explore`, `catalog`, `destination.*`, `plan.*`,
  `finder`, `esim.*`, `checkout.*`, `order.*`, `receipt.*`, `profile`,
  `support`, `notifications`, `wallet*`, and `my-trips*`. Shared itineraries
  are public read-only pages at `share.$token`; shared eSIM gifts are
  claim-once public pages at `e.$token`.
- Admin pages: `admin.*` and `admin.orders.*`.
- API/action routes: `api.*`, including auth, customer profile/support,
  wallet, Calendar, tasks, recovery, waitlist, and provider webhooks.

Use `.server.ts`/`.server.tsx` for modules that access PostgreSQL, secrets,
provider APIs, filesystem state, or privileged authorization. Server functions
and loaders/actions should call those modules; do not import credentials or
database clients into browser code. Browser-callable `createServerFn` declarations belong in `.fn.ts` modules, which
dynamically import validated handlers from `.server.ts`; browser code must not
import callable exports directly from `.server.ts`. Production import-protection
violations fail the build instead of shipping mocks. Shared presentational logic belongs in
`src/components/`, `src/hooks/`, and non-server `src/lib/` modules.

Home quick-buy contract: `esim-home-summary-card.tsx` renders the card;
`esim-home-wallet.ts` builds the eSIM rail; `home-quick-packages.ts` (pure rule),
`.server.ts` (paid-order counts over 90 days + Admin pins from
`admin_settings.homeEsim.packageHighlights`) and `.fn.ts` choose the Terlaris and
Best Deal picks. Checkout is one `checkout-form.tsx` used by `/checkout/$id` and
the Home bottom sheet (`esim-checkout-sheet.tsx`), both loading through
`checkout-load.fn.ts`; pricing, sellability, member/profile and wallet rules are
therefore identical. No migration: the pins live in the existing JSON setting.

eSIM sharing contract: a signed-in owner creates a link from `/my-esim/$id`
through `esim-share.fn.ts`; `esim_share_links` stores only the SHA-256 token
hash plus an encrypted copy for re-copy. `/e/$token` shows a package preview
until the recipient presses **Buka eSIM**, which binds the link to an HttpOnly
claim cookie (`claim_hash`). Eligibility is READY/INSTALLED until the profile or
package expires; refunded, cancelled, failed, exhausted and disabled profiles
end the link. `admin_settings.esimSharing` is the admin kill switch and admin
order detail can revoke a link. Never expose the owner, order code, price, token,
or QR before a claim.

Tests are under [`src/test/`](src/test/), with server, route-auth, wallet,
Calendar, profile, and UI coverage. `routeTree.gen.ts` and build output are
generated artifacts. Do not hand-edit them to fix a route.

## Data model and migrations

PostgreSQL access is server-only. The current schema shape is represented by
[`drizzle/schema.ts`](drizzle/schema.ts) and the deployment migration history
is in [`migrations/`](migrations/). Migrations are numbered SQL files; the
inventory currently reaches `034_esim_share_links.sql`, with some
parallel historical numbers. Inspect the migration tracking table and
`scripts/apply-migrations.sh` before deciding what is pending.

Use additive, reviewable migrations: add nullable columns/tables/indexes first,
backfill safely, deploy compatible code, then remove obsolete structures only
after all consumers are migrated. Never rewrite an applied migration or make
ownership queries broader to accommodate a UI shortcut. Trip, activity,
checklist, booking, budget, and expense records must remain scoped through the
authenticated trip owner; see [`src/lib/my-trips.server.ts`](src/lib/my-trips.server.ts).

Freemium My Trips without login (`src/lib/guest-trips*.ts`, Admin `guestTrips` setting in `/admin/settings`):
a guest without a session owns trips through an HttpOnly `djiwa_guest_trips` cookie, stored as
`customer_auth_subject = guest:<sha256(token)>` (no new table). The default allows one trip per guest
browser; the create transaction checks the limit under an advisory lock. Member-only functions stay
on `getAuthenticatedUser` (share links, duplicate, Google Calendar/Sheets, receipt scan, place ideas).
On login, `claimGuestTrips` moves the guest's trips to the member id and clears the cookie.
Limitation: clearing cookies gives a new guest browser a new allowance.

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

Alur kerja harian, peta aliran lintas VPS, runbook Tentram, dan CLI `scripts/djiwa`
(`status`, `verify`, `gate`, `ship`, `db`, `env`, `drift`, `logs`, `new`) ada di
[`docs/DEV-WORKFLOW.md`](docs/DEV-WORKFLOW.md).

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

## GEO / AI discoverability

- `/robots.txt` and `/llms.txt` are dynamic routes (`src/routes/robots[.]txt.ts`, `llms[.]txt.ts`);
  `public/robots.txt` no longer exists. Both read `admin_settings.aiSearch` (Admin → Settings →
  "Visibilitas AI (GEO)", audited, versioned). Missing row or DB failure falls back to open defaults.
- `src/lib/geo.ts` builds the answer-first summary, FAQ, robots and llms text from live catalogue data;
  `GeoAnswer` renders it as visible SSR text and the same FAQ feeds `FAQPage` JSON-LD
  (Home + `/destination/$code`). Destination pages deliberately carry no `Product` (see
  `seo-product-ranking.test.ts`); `Product`/`Offer` stays on `/plan/$id`.

## Installable app (PWA)

Install prompt, offline fallback, update flow and Web Push are documented in [`docs/pwa.md`](docs/pwa.md). Policy lives in `admin_settings.pwa` (`src/lib/pwa-config.ts`, `src/lib/pwa.server.ts`), the worker in `public/sw.js`, push delivery in `src/lib/push.server.ts`, and the READY-transition hook in `src/lib/esim-provisioning-refresh.server.ts`.

## Affiliate (referral) program

Members activate affiliate in one step (no verification form) at `/affiliate`; verification happens only
at payout (bank details, admin review). Admin runs it at `/admin/affiliates`.

- **Source of truth:** migration `033_affiliate.sql` (`affiliate_accounts/clicks/referrals/commissions/payouts`),
  rules in [`src/lib/affiliate.ts`](src/lib/affiliate.ts), server logic in
  [`src/lib/affiliate.server.ts`](src/lib/affiliate.server.ts), program settings in `admin_settings`
  key `affiliate` (commission % of order **markup**, hold days, minimum payout, cookie days, on/off).
- **Attribution:** `?ref=CODE` → first-party cookie `djiwa_ref` (only for a real active code) →
  `claimAffiliateReferral` locks referrer→referee once, from the verified session. Self-referral, an
  already-referred account, and an account that already paid an order are rejected; 3+ accounts from the
  same device hash are flagged and held.
- **Commissions** are *derived* from settled orders by an idempotent sweep (`runAffiliateSweep`, unique per
  `order_id`), not hooked into payment code: first paid order only → `pending` → `approved` after the hold
  and no failed provisioning → `reversed` on refund/cancel. The sweep runs on dashboard/admin loads and via
  `POST /api/tasks/affiliate-sweep` (`x-djiwa-task-secret` = `AFFILIATE_TASK_SECRET`). On the VPS the
  `djiwatravel-affiliate-sweep.timer` runs it every 5 minutes; units live in
  [`scripts/systemd`](scripts/systemd), and the secret is in `/etc/djiwatravel-task.env` and `/etc/djiwatravel.env`.
- **Payouts** are admin-reviewed records (requested → approved → paid with an external reference). Travel does
  **not** credit Djiwa Pay: wallet balance and ledger stay in Djiwa Pay, so crediting is a manual/ops step until a
  signed Pay endpoint is agreed (needs the Tentram repo). One open payout per affiliate (partial unique index).
