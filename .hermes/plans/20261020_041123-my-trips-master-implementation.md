# Djiwa Travel — My Trips Master Implementation Plan

**Status:** Planned; implementation has not started.
**Scope:** Build all four My Trips phases, then verify, merge to `main`, push GitHub, and deploy to the Djiwa Travel VPS.
**Product:** Djiwa Travel — International Travel Super App
**Primary route:** `/my-trips`
**Legacy route:** `/my-esim` remains supported.

## 1. Goal

Transform the current My eSIM navigation surface into a compact, mobile-first My Trips planning system without breaking eSIM Access, checkout, Djiwa Pay, authentication, wallet, existing customer data, or payment/provisioning flows.

The result must feel like a premium native iOS travel app: compact, practical, information-dense, accessible, and useful even when the traveler has never purchased an eSIM.

## 2. Verified current context

### Repository and runtime

- Project resolved through the project index: **Djiwa Travel**.
- Local implementation workspace: `/home/ubuntu/projects/djiwatravel-roadmap`.
- Production repository/webroot: `/opt/djiwatravel` on the Dalang service **Zantara Technology**.
- Production domain: `https://djiwatravel.com`.
- Current app is a TanStack Start/React application using TanStack Router, React Query, Tailwind-style classes, Motion, Vitest, ESLint, Prettier, and Vite/Nitro build output.
- Existing package scripts: `lint`, `build`, `test`, `format`.
- Current deployment service: `djiwatravel.service`.

### Existing relevant implementation found by search

- Bottom navigation is in `src/components/shell.tsx`.
  - Current tabs are Home, Explore, **My eSIM**, Wallet, Profile.
  - It uses Lucide icons, Motion active indicator, fixed safe-area-aware positioning, and five-column layout.
- Existing eSIM routes:
  - `src/routes/my-esim.index.tsx`
  - `src/routes/my-esim.$id.tsx`
- Existing eSIM/order/payment infrastructure is spread across `src/lib/orders.ts`, eSIM status/provisioning modules, checkout/order routes, wallet modules, and related server functions. These are read-only compatibility boundaries for this feature.
- Existing trip-like functionality is currently limited in scope:
  - `src/lib/travel-checklist-store.ts` stores per-order checklist/departure data in browser local storage.
  - `src/lib/travel-journey.ts` and `src/components/travel-checklist.tsx` render the existing order-linked activation/checklist experience.
  - This is not a replacement for authenticated, multi-trip persistence; it must remain compatible with the existing My eSIM detail flow.
- No `/my-trips` route, trip CRUD route, trip budget/expense/itinerary database model, or full authenticated My Trips data layer was found in the bounded route/schema search.
- Database infrastructure uses PostgreSQL/Drizzle patterns plus existing SQL migrations under `migrations/` and `drizzle/`. Existing auth ownership uses Better Auth session identity mapped to `customer_auth_subject` in existing server modules.
- Existing light/dark and iOS/PWA foundations are in the root shell/styles and must be reused.

### Current repository safety

- Before implementation, re-check the exact Git branch, HEAD, dirty files, and generated route tree.
- Existing unrelated untracked plan files must not be staged or removed.
- Do not reset or clean the workspace.
- The registry/context is orientation only; production host, service, repository HEAD, and deployment state must be re-verified before any write or release.

## 3. Confirmed requirements

- Implement all phases in sequence, with Phase 1 as the first production-ready foundation.
- Replace the primary bottom-nav label/route target from My eSIM to My Trips.
- Preserve `/my-esim` and all existing eSIM, checkout, wallet, payment, provisioning, QR, top-up, and order-history behavior.
- Users can create/use trips without buying an eSIM.
- All private trip data is owned and authorized server-side per authenticated customer.
- Monetary values use integer minor units or exact decimal representations; never floating-point currency arithmetic.
- Historical expense conversions are immutable after recording.
- Documents remain private and authenticated if/when storage is implemented.
- No destructive migrations, unnecessary dependencies, provider integrations, autonomous purchases, or real-money Djiwa Pay transfers.
- The UX is compact and mobile-first at 375–430px, responsive on desktop, accessible, and compatible with light/dark mode.
- Final delivery includes tests, route/component/database summary, limitations, and deployment evidence.

## 4. Safe defaults and explicit decisions

1. **Persistence:** use the existing PostgreSQL/Drizzle and Better Auth ownership patterns, not local storage, for trips and all durable child records. Local storage remains only for existing order-linked checklist behavior.
2. **Trip identity:** use UUID primary keys and `customer_auth_subject` ownership, with server-side ownership checks on every read/write.
3. **Currency:** store monetary amounts as integer minor units plus ISO currency code. For currencies without two decimal places, use an explicit currency exponent table/helper rather than assumptions.
4. **Exchange rates:** Phase 2 introduces a provider only after cost/availability review. Until then, manual expense entry can record a user-supplied/known rate and its source/status; no fabricated live rate is shown.
5. **Documents:** Phase 2 starts with metadata and authenticated retrieval only if the existing private storage capability is verified. Passport scans are not part of the default flow.
6. **Groups:** Phase 3 starts with explicit members/roles and server-side authorization; no real-time collaboration is required.
7. **AI:** Phase 4 begins with rules-based suggestions and an adapter interface. Paid AI providers require separate approval and are not added automatically.
8. **eSIM linking:** optional trip-to-eSIM relationship; no changes to provisioning or checkout authority.
9. **Deployment:** the user request authorizes the final release sequence, but production deployment still occurs only after all gates, read-back checks, and rollback preparation pass.

## 5. Non-goals / protected boundaries

- Do not rebuild the app or replace TanStack Start/Router, auth, payment, wallet, or eSIM Access.
- Do not make `/my-esim` depend on a trip.
- Do not migrate existing customer/order data destructively.
- Do not present manually entered bookings as provider-confirmed.
- Do not automatically transfer wallet/Djiwa Pay balances for split bills.
- Do not add Google Maps, booking provider APIs, paid AI APIs, autonomous purchasing, or real-time collaboration in the first implementation unless a later phase explicitly requires and approves it.
- Do not expose private trip/document data through public URLs or unauthenticated server functions.

## 6. Target architecture

### Route map

- `/my-trips` — authenticated trip list with Upcoming/Ongoing/Past segmented filter.
- `/my-trips/new` — create trip form.
- `/my-trips/$tripId` — trip dashboard.
- `/my-trips/$tripId/budget` — budget allocations and category comparison.
- `/my-trips/$tripId/expenses` — expense history, filters, create/edit/delete.
- `/my-trips/$tripId/itinerary` — day selector and timeline CRUD.
- `/my-trips/$tripId/checklist` — Reminders-style checklist CRUD.
- `/my-trips/$tripId/bookings` — Phase 2 manual bookings.
- `/my-trips/$tripId/places` — Phase 2 saved places.
- `/my-trips/$tripId/documents` — Phase 2 document metadata/private access.
- `/my-trips/$tripId/group` — Phase 3 group and permission management.
- `/my-trips/$tripId/split-bill` — Phase 3 informational ledger.
- `/my-trips/$tripId/currency` — Phase 2 converter.
- `/my-trips/$tripId/ai-planner` — Phase 4 optional recommendations.
- `/my-esim` and `/my-esim/$id` — unchanged legacy eSIM surfaces.

Use route aliases/redirects only where verified against TanStack Router conventions; do not hand-edit generated `src/routeTree.gen.ts` when regeneration is available.

### Database entities

Add additive migrations only. Exact SQL/types must be reconciled with the current schema and migration conventions before writing.

```text
trips
- id uuid primary key
- customer_auth_subject text not null
- name text not null
- destination_code text not null
- destination_name text not null
- departure_date date not null
- return_date date not null
- travelers_count integer not null
- primary_currency char(3) not null
- total_budget_minor bigint not null default 0
- timezone text nullable
- status derived from dates (not trusted client input)
- created_at, updated_at

trip_budget_categories
- id uuid primary key
- trip_id uuid not null
- name text not null
- category_key text nullable
- allocated_minor bigint not null default 0
- currency char(3) not null
- sort_order integer not null
- created_at, updated_at

trip_expenses
- id uuid primary key
- trip_id uuid not null
- category_id uuid nullable
- description text not null
- transaction_date date not null
- original_amount_minor bigint not null
- original_currency char(3) not null
- exchange_rate_numeric exact decimal nullable
- exchange_rate_source text nullable
- exchange_rate_status enum/text (estimated|confirmed|manual)
- exchange_rate_as_of timestamptz nullable
- converted_amount_minor bigint not null
- converted_currency char(3) not null
- payment_method text nullable
- notes text nullable
- receipt_storage_key text nullable
- created_at, updated_at

trip_itinerary_items
- id uuid primary key
- trip_id uuid not null
- activity_date date not null
- start_time time nullable
- end_time time nullable
- timezone text nullable
- title text not null
- location text nullable
- notes text nullable
- estimated_cost_minor bigint nullable
- currency char(3) nullable
- booking_reference text nullable
- activity_category text nullable
- created_at, updated_at

trip_checklist_items
- id uuid primary key
- trip_id uuid not null
- title text not null
- is_completed boolean not null default false
- due_date date nullable
- sort_order integer not null
- is_default boolean not null default false
- created_at, updated_at

trip_esims
- trip_id uuid not null
- esim/order identity reference using the existing safe eSIM identity, never raw secrets/QR data
- linked_at timestamptz not null
- primary key (trip_id, esim_identity)
```

Phase 2 additive entities:

```text
trip_bookings
trip_saved_places
trip_documents
```

Phase 3 additive entities:

```text
trip_members
trip_expense_shares
trip_settlements_ledger
```

Phase 4 does not require a new persistence table initially; store generated suggestions only after a reviewed schema/retention decision.

### Database security contract

- Every query includes authenticated subject ownership or joins through an authorized trip/member scope.
- Server functions validate payloads with the existing Zod/server validation conventions.
- Child rows cannot be accessed by guessing IDs.
- Trip status is derived from date boundaries in the server/domain helper, using the trip timezone where present.
- Delete operations are ownership-checked and use soft-delete only where historical/audit requirements make it necessary; otherwise use safe scoped deletes for user-created planning rows.
- Migration is additive, idempotent where repository conventions support it, and separately reviewed before execution.

## 7. UI/UX specification

### Shared shell

- Change `src/components/shell.tsx` tab 3 to `to: "/my-trips"`, label `My Trips`, and a luggage/briefcase Lucide icon.
- Keep five equal columns, Motion active indicator, safe-area handling, light/dark tokens, and compact label sizing.
- Keep `/my-esim` reachable through direct links and a visible eSIM entry point in My Trips.
- Preserve existing page transition behavior; check fixed layers for transform/fixed-position regressions.

### My Trips list

- Header: `My Trips`, subtitle `Rencanakan perjalananmu.`, compact plus icon button.
- Segmented control: Upcoming / Ongoing / Past.
- Cards: flag/destination, trip name, dates, derived status, budget progress, checklist progress.
- Empty state: `Belum ada perjalanan.` / `Mulai rencanakan perjalanan pertamamu.` / `Buat Perjalanan`.
- Existing eSIM section remains independent and links to `/my-esim`.
- Loading skeleton, auth-required state, query error state, and retry state are required.

### Create/edit trip

- Compact grouped iOS-style form; native date inputs/selects where supported.
- Validate name, destination, date order, traveler count, currency, and non-negative budget.
- Generate a suggested name only as editable initial text.
- Disable submit during save, show inline field errors, preserve form values on server errors, and navigate only after verified save.

### Trip dashboard

- Compact header and date/status row; no full-screen hero.
- Budget summary: total, spent, remaining, progress percentage.
- Quick-action icon grid for Phase 1: Budget, Expenses, Itinerary, Checklist, My eSIM. Later actions are marked clearly as coming/available when their phase is released, not fake links.
- Next itinerary item and checklist progress.
- Empty/loading/error/saving states for every data block.

### Budget and expenses

- Use integer minor-unit helpers and centralized formatters.
- Budget page shows total budget, allocated, actual, remaining, progress, and compact category rows.
- Expense page uses transaction rows, filter controls, add/edit form, delete confirmation, and immutable original/conversion fields.
- Overspending is a clear warning state, not a destructive block.
- Charts are secondary and lightweight; existing chart library only if already suitable.

### Itinerary

- Horizontal compact day selector with no page-wide horizontal overflow.
- Chronological timeline rows grouped by local trip date.
- Server/domain overlap helper returns warnings for intersecting start/end times; warnings do not silently delete or reorder data.
- Times include the trip timezone context and are stored/parsed consistently.

### Checklist

- Reminders-like compact rows with checkbox, title, optional due date, add/edit/delete.
- Default items seeded once per trip, not duplicated on refresh.
- Completion percentage is computed from persisted rows.
- Existing order-linked checklist remains untouched.

### Later phases

- Bookings: manual/unverified badge and reference/notes fields.
- Documents: private metadata + authenticated download only; storage capability check before implementation.
- Places: compact saved-place rows with optional URL and planned date.
- Groups: members/roles/permissions before shared data views.
- Split bill: exact ledger calculations, no money transfer.
- Currency: clearly marked estimated rate and timestamp; no invented rate.
- AI: explicit `AI-generated suggestion` badge and no purchase action.

## 8. Implementation waves

Each wave is limited to a small file set, ends with targeted checks, and is committed selectively. No generated files, secrets, or unrelated dirty files are staged.

### Wave 0 — Audit and contracts

1. Re-verify local Git state, current branch/HEAD, package scripts, route tree, auth server patterns, DB schema, and production mapping.
2. Trace `my-esim` route → order/eSIM hooks → server functions → DB/provider boundaries.
3. Identify all navigation consumers of `/my-esim` and all tests covering shell/eSIM/payment/wallet.
4. Create shared domain contracts/types for currency, trip status, ownership, and validation.
5. Acceptance: audit notes and compatibility boundaries are documented; no existing eSIM source changed.

### Wave 1 — Database foundation and server authorization

1. Add additive trip core migration/tables.
2. Add server functions for trip list, create, update, delete, and dashboard read.
3. Add ownership/validation tests, including cross-user ID access denial.
4. Seed default budget/checklist categories only through idempotent server logic.
5. Acceptance: authenticated CRUD works against test DB/mocks; unauthenticated and cross-owner reads/writes fail safely.

### Wave 2 — Shell, routes, list, and create trip

1. Change bottom nav to My Trips and add route files.
2. Keep `/my-esim` unchanged and add explicit My eSIM access from My Trips.
3. Build list filters, compact cards, empty/loading/error states, and create/edit form.
4. Add route/navigation tests.
5. Acceptance: no fake trips; create/edit/list/delete works; old eSIM links still resolve.

### Wave 3 — Trip dashboard and budget

1. Add dashboard aggregation server function.
2. Add budget category CRUD and total/allocation validation.
3. Build compact dashboard and budget UI.
4. Add exact integer minor-unit arithmetic tests and overspending tests.
5. Acceptance: totals reconcile from DB; dashboard status/progress is derived; no floating-point currency arithmetic.

### Wave 4 — Expense tracker

1. Add expense migration/server functions with immutable original/conversion fields.
2. Add expense form, filters, edit/delete confirmation, receipt boundary placeholder only if storage is not yet verified.
3. Add currency precision, ownership, and historical immutability tests.
4. Acceptance: IDR/JPY/USD/SGD/KRW examples round-trip correctly; original amount/rate/converted amount remain visible and stable.

### Wave 5 — Daily itinerary

1. Add itinerary migration/server functions.
2. Add day selector, timeline, CRUD form, timezone-aware parsing, overlap warning helper.
3. Add tests for chronology, date boundaries, timezone, and overlap warnings.
4. Acceptance: items are grouped/sorted correctly; overlapping items warn without data loss.

### Wave 6 — Checklist and My eSIM integration

1. Add persisted trip checklist migration/server functions and default seeding.
2. Build Reminders-style checklist UI/progress.
3. Add dashboard link and trip-eSIM relationship read/link layer without touching provisioning/checkout.
4. Verify existing `/my-esim`, QR/install, status, top-up, order history, wallet, and checkout tests/routes.
5. Acceptance: checklist persists across sessions; My eSIM remains usable without a trip; optional linking cannot alter eSIM lifecycle.

### Wave 7 — Phase 2 travel organization

1. Add manual bookings with explicit `Unverified/manual` status.
2. Add saved places and add-to-itinerary action.
3. Audit storage capability; if supported, add private document metadata/storage/retrieval with authenticated access. Otherwise ship metadata-only safe state and record limitation.
4. Add currency converter only after provider/cost review; preserve historical expense rates.
5. Add compact analytics derived from persisted budgets/expenses.
6. Acceptance: no public document URLs; manual booking never displays as provider-confirmed; analytics reconcile with ledger.

### Wave 8 — Phase 3 collaboration and split bill

1. Add trip members/invite lifecycle using existing auth identities.
2. Add server-side roles and scope checks.
3. Add shared view permissions for itinerary/budget/expenses.
4. Add informational split-bill ledger with exact shares, payer, owed amount, settlement status.
5. Acceptance: unauthorized members cannot read/write restricted data; no wallet transfer call exists; ledger balances reconcile.

### Wave 9 — Phase 4 smart travel

1. Add rules-based planner adapter and typed inputs/outputs.
2. Build AI planner UI with explicit AI-generated labeling.
3. Integrate Explore/eSIM recommendations as links to current catalog availability, never as purchase automation.
4. Add provider adapter only if existing infrastructure and approval support it; otherwise leave a deterministic rules-based implementation.
5. Acceptance: recommendations are distinguishable from confirmed availability; no paid API or autonomous purchase is introduced.

### Wave 10 — Release reconciliation

1. Run full lint, typecheck, tests, and production build.
2. Run database migration in a safe environment first; verify schema/query results and rollback readiness.
3. Run authenticated E2E scenarios for trip CRUD, budget, expenses, itinerary, checklist, eSIM access, wallet, checkout, and route compatibility.
4. Capture mobile 375px and desktop preview evidence, light/dark states, empty/error/loading states.
5. Review diff for secrets, unrelated files, generated artifacts, and destructive SQL.
6. Selectively commit phase waves, merge/reconcile to `main` without force push.
7. Push GitHub `main`, fetch/read back exact SHA.
8. Build on VPS release worktree, backup current `.output`, deploy atomic output, restart `djiwatravel.service`, verify health and HTTP routes.
9. Read back production `/`, `/explore`, `/my-trips`, `/my-esim`, `/wallet`, and representative authenticated API responses where safe.
10. Record rollback path and final evidence.

## 9. Files likely to change

### Existing files

- `src/components/shell.tsx`
- `src/routeTree.gen.ts` (generated through router build/regeneration only)
- `src/routes/__root.tsx` only if route-level provider/error behavior requires it
- `src/routes/my-esim.index.tsx` only for a non-breaking cross-link if needed
- Existing shared UI/token files only when the new surface can reuse them safely
- `drizzle/schema.ts` and new additive migration files
- `package.json` only if an existing dependency is genuinely insufficient; default is no new dependency

### New application files

- `src/routes/my-trips.index.tsx`
- `src/routes/my-trips.new.tsx`
- `src/routes/my-trips.$tripId.tsx`
- `src/routes/my-trips.$tripId.budget.tsx`
- `src/routes/my-trips.$tripId.expenses.tsx`
- `src/routes/my-trips.$tripId.itinerary.tsx`
- `src/routes/my-trips.$tripId.checklist.tsx`
- Later-phase route files listed in the route map
- `src/components/my-trips/*`
- `src/lib/my-trips/*` for domain helpers, formatters, schemas, and client hooks
- `src/lib/my-trips.server.ts` or split server modules following existing server-function conventions
- `src/test/my-trips/*` and focused migration/domain tests

Exact filenames must be reconciled with the repository's route naming conventions before creation.

## 10. Testing and verification matrix

### Static checks

- `npm run lint`
- `npx prettier --check <changed files>`
- `npx tsc -p tsconfig.json --noEmit` or the repository's verified typecheck equivalent
- `npm run test -- --run`
- `npm run build`
- `git diff --check`

### Functional checks

- Nav renders five compact tabs; My Trips active state works; My eSIM direct route remains valid.
- Unauthenticated My Trips behavior is clear and does not leak data.
- Trip create/edit/delete/list and date status classification.
- Budget allocation, overspend, remaining, and percentage calculations.
- Expense original/conversion immutability and currency precision.
- Itinerary chronology, day grouping, timezone, and overlap warning.
- Checklist persistence, default seeding, completion progress, CRUD.
- Optional eSIM link does not change eSIM provisioning, checkout, QR, top-up, or payment.
- Cross-user data isolation at server boundary.
- Phase 2 private document access and manual-booking labels.
- Phase 3 member permissions and ledger reconciliation.
- Phase 4 AI labeling/no-purchase boundary.

### Preview evidence

- Mobile screenshot/recording of `/my-trips` in empty, populated, and segmented states.
- Create-trip form validation and successful navigation.
- Trip dashboard with compact budget/checklist/next-activity blocks.
- Expense and itinerary interaction states.
- Light/dark mode.
- Desktop responsive check.
- Production HTTP status and exact deployed Git SHA.

## 11. Risk and rollback

| Risk | Mitigation |
|---|---|
| Existing My eSIM behavior breaks during nav replacement | Keep `/my-esim` routes, test direct links, isolate eSIM components, add regression tests before shell change |
| Trip data leaks across users | Subject-scoped server queries, ownership tests, ID-guessing tests, never trust client trip IDs |
| Floating-point currency errors | Minor-unit integers/exact decimal helper, currency exponent contract, no `number` for persisted money |
| Migration damages existing data | Additive/idempotent migrations, backup/schema read-back, no drop/rename |
| Date/timezone misclassification | Store date/time fields explicitly, trip timezone, domain tests around midnight/DST boundaries |
| Documents become public | Verify private storage first; authenticated signed retrieval only; metadata-only fallback |
| UI becomes a desktop dashboard | Mobile screenshot gates, compact space budget, five-tab shell and 375px checks |
| Phase scope expands uncontrollably | Complete and verify each phase gate before next; no provider/AI/payment extras without approval |
| Deployment regression | Build in release worktree, backup current `.output`, restart only after build pass, HTTP read-back and rollback path |

## 12. Definition of Done

- [ ] All four phases are implemented or explicitly marked with a verified, documented limitation.
- [ ] Phase 1 is fully production-ready before Phase 2 work begins.
- [ ] My Trips replaces the primary nav label while `/my-esim` remains backward-compatible.
- [ ] Trip, budget, expense, itinerary, checklist, and optional eSIM-link flows work with authenticated ownership.
- [ ] Later-phase bookings, places, documents, groups/split bill, currency conversion, and AI planner meet their stated scope without unsafe claims.
- [ ] Existing eSIM Access, Djiwa Pay, wallet, auth, checkout, payment, QR, top-up, provisioning, and order-history regression checks pass.
- [ ] Migrations are additive and verified; no secrets or unrelated dirty files are committed.
- [ ] Lint, typecheck, full tests, build, responsive/light-dark checks, and production HTTP read-back pass.
- [ ] Final commits are selectively merged to `main`, GitHub SHA is verified, VPS deployment SHA is verified, service is active, and rollback backup path is recorded.
- [ ] Final report includes features, routes, components, database changes, completed/deferred items, test results, limitations, and next recommendations.

## 13. Recommended execution protocol

- Treat this as an R3 multi-wave change, not a single edit.
- Use isolated worktrees and selective commits per wave.
- Delegate independent audit/review tasks only after the initial audit is reconciled; implementation changes remain controlled in the main engineering worktree.
- Do not deploy intermediate phases to production unless explicitly needed for a verified release; release once all acceptance gates pass.
- If an external credential, migration approval, provider decision, or production-risk decision is required, stop at that exact gate and report it rather than guessing.
