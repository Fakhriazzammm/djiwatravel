# Redesign Explore — Djiwa Travel Super App Implementation Plan

> **For Hermes:** Implement task-by-task with the existing Djiwa Travel stack. Do not rebuild the app, change payment/auth/provider logic, or deploy production without explicit approval.

**Goal:** Mengubah `/explore` dari daftar pencarian paket eSIM menjadi entry point destination-first untuk marketplace kebutuhan perjalanan internasional, sambil mempertahankan katalog, checkout, provisioning, My eSIM, Wallet, Profile, dan navigasi existing.

**Architecture:** Tetap gunakan TanStack Start + React + TypeScript + Tailwind/design tokens existing. Explore menjadi komposisi data konfigurasi lokal yang modular: destination metadata → service categories → live eSIM availability → optional affiliate cards → destination detail route. Fase pertama tidak membutuhkan microservice atau migrasi database; produk eSIM tetap dibaca dari reseller catalog/cache dan sellability yang sudah ada.

**Tech Stack:** TanStack Router/Start, React 19, TypeScript, Tailwind v4, lucide-react, Motion existing, Vitest, existing `getResellerCatalog`, `getSellabilityState`, destination route, auth/session, and shell components.

---

## 1. Audit Codebase yang Sudah Diverifikasi

Audit dilakukan read-only pada checkout lokal `/home/ubuntu/projects/djiwatravel-roadmap` setelah project index mengarahkan ke Djiwa Travel. Snapshot aktif: branch `feat/customer-e2e-roadmap-recommended`, `HEAD 1975db1`, `ahead 3 / behind 2` dari `origin/main`; terdapat `.hermes/` untracked. Jangan reset, clean, atau menimpa perubahan tersebut.

### Route dan komponen yang relevan

- `src/routes/explore.tsx`
  - Sudah menjadi route `/explore`.
  - Loader membaca live/cached reseller catalog, menyaring `isRecommendablePackage`, membaca sellability, lalu hanya menampilkan destination yang memiliki package live.
  - Search memakai `search()` dari `src/lib/catalog.ts`.
  - Sudah memiliki loading, cached notice, provider error + retry, dan empty search state.
  - UI saat ini: judul Explore, subtitle eSIM, search, CTA finder, daftar destination berbasis teks/flag.
- `src/routes/destination.$code.tsx`
  - Route `/destination/$code` sudah tersedia dan harus dipertahankan.
  - Loader menggunakan `getResellerCatalog`, `filterPackagesByDestination`, regional coverage, `readSellability`, stale/cache state, dan stock-pending state.
  - Halaman sudah menampilkan paket eSIM aktual, availability filter, sorting, comparison, pagination, dan link checkout `/checkout/$id`.
  - Tidak boleh mengganti provider, pricing, payment, provisioning, atau link checkout.
- `src/lib/catalog.ts`
  - Memiliki type/data destination, aliases, popular flag, `search`, `getDest`, dan package compatibility data.
  - Ini cocok menjadi sumber metadata destination awal, tetapi package aktif tetap bukan dari data statis ini.
- `src/lib/explore-availability.ts`
  - Memiliki error/retry contract dan larangan membuat destination/package palsu ketika provider gagal. Contract ini wajib dipertahankan.
- `src/lib/reseller-catalog-cache.ts`, `src/lib/esim-access-catalog.ts`, `src/lib/sellability.server.ts`, `src/lib/destination-availability.server.ts`
  - Sumber kebenaran katalog/sellability eSIM. Reuse, jangan duplikasi query baru.
- `src/lib/destination-artwork.ts`
  - Artwork existing ditemukan untuk `CN`, `JP`, `KR`, `SA`, `SG`, `TH`; tidak semua 10 destination yang diminta memiliki asset lokal saat audit.
- `src/components/shell.tsx`
  - `Page` mempertahankan bottom nav lima item: Home, Explore, My eSIM, Wallet, Profile.
  - User requirement menyebut arah masa depan My Trips, tetapi task ini tidak mengubah label/route global.
- `src/routes/finder.tsx`
  - Finder eSIM tetap ada dan CTA dari Explore harus tetap dapat diarahkan ke `/finder` jika dipertahankan.
- `src/routes/checkout.$id.tsx`, `src/routes/order.$id.tsx`, `src/routes/my-esim.index.tsx`, `src/routes/my-esim.$id.tsx`, `src/routes/wallet.tsx`, `src/routes/profile.tsx`
  - Touchpoints regresi yang harus tetap tidak berubah secara fungsional.
- `src/routes/index.tsx`
  - Home sudah memakai artwork destination dan link ke eSIM/order surfaces; perubahan landing/home tidak termasuk scope fase ini kecuali link Explore rusak.

### Backend/database audit

- `drizzle/schema.ts` memiliki tabel eSIM provider packages, customer orders/items, provisioning orders, eSIM profiles, payments, dan auth-related records.
- Tidak ditemukan tabel affiliate/travel-services pada schema yang diaudit. Search dilakukan sebelum menyimpulkan gap ini.
- Fase 1 tidak menambah migration besar: service categories dan affiliate seed/config dapat hidup di module TypeScript read-only. Struktur table affiliate disiapkan sebagai future migration specification, bukan dieksekusi tanpa approval.
- Tidak boleh ada API key, credential, provider secret, atau affiliate secret di frontend.

### Test/build contract existing

- `package.json`: `npm run lint`, `npm run test`, `npm run build`.
- Existing Explore tests: `src/test/explore-availability.test.ts`, `src/test/explore-load-recovery.test.ts`.
- Route tree `src/routeTree.gen.ts` adalah generated output; route baru harus dibuat melalui convention TanStack dan route tree diregenerasi oleh build/tooling, bukan diedit manual.

---

## 2. Confirmed Requirements, Safe Defaults, Open Questions

### Confirmed

- `/explore` menjadi destination-first travel marketplace.
- eSIM tetap ACTIVE dan memakai data aktual existing.
- Service status configurable: `ACTIVE`, `AFFILIATE`, `COMING_SOON`, `DISABLED`.
- Destination cards, destination search, featured services, AI Trip Planner entry point UI.
- Destination detail route tetap kompatibel dan tetap menjual eSIM.
- Affiliate fase pertama external URL; transaksi pihak ketiga harus diberi disclosure.
- Mobile-first, responsive desktop, light/dark, iOS-inspired, clean and compact.
- No fake price, stock, availability, checkout, API key, auth/payment/wallet changes.
- No production deployment in this task without explicit approval.

### Safe defaults

- Service category configuration disimpan di `src/lib/travel-services.ts` atau module equivalent; status adalah discriminated union, bukan string bebas.
- Destination card memakai asset existing bila tersedia. Destination tanpa asset lokal memakai flag/neutral visual treatment sampai asset disetujui; jangan mengambil remote image provider tanpa keputusan caching/license.
- Affiliate products pada fase 1 bersifat config-driven dan kosong by default jika URL belum tervalidasi; tidak membuat contoh partner seolah-olah sudah aktif.
- AI Trip Planner hanya UI entry point/short planning flow lokal, tanpa LLM/provider call.
- Search hanya memfilter destination metadata dan live-available destination set; tidak menampilkan destination seolah punya eSIM bila loader provider error.

### Open questions sebelum implementasi affiliate/content final

1. Apakah URL affiliate resmi Klook/Traveloka sudah disetujui dan boleh ditambahkan sekarang? Jika belum, tampilkan `COMING_SOON` tanpa outbound URL.
2. Apakah founder menyetujui asset destination baru untuk MY/HK/TW/AU, atau fase pertama memakai flag/gradient fallback?
3. Apakah label user-facing tetap `My eSIM` pada bottom nav untuk fase ini? Rencana ini menganggap **ya**, sesuai instruksi jangan mengubah global navigation.
4. Apakah destination detail ingin tetap satu route `/destination/$code` dengan section tambahan (rekomendasi), bukan route baru? Rencana memilih route existing agar kompatibel.

---

## 3. Target Information Architecture

```text
/explore
├── Header: Explore + “Mau pergi ke mana?”
├── Destination search
├── Travel Services grid
│   ├── eSIM (ACTIVE)
│   ├── Aktivitas Wisata (AFFILIATE/COMING_SOON)
│   ├── Transportasi (COMING_SOON)
│   ├── Open Trip (COMING_SOON)
│   ├── Bagasi (COMING_SOON)
│   ├── Personal Shopper (COMING_SOON)
│   ├── Visa (COMING_SOON)
│   └── Travel Insurance (COMING_SOON)
├── Popular Destinations
│   └── cards → /destination/$code
├── Featured Services
│   ├── live eSIM cards from existing catalog
│   └── validated affiliate cards or non-clickable Coming Soon cards
└── AI Trip Planner entry point
    └── lightweight local planning flow/modal; no paid AI call

/destination/$code (existing route)
├── Existing BackBar + destination header
├── New modular destination summary/services block
├── Existing eSIM availability/sort/package/comparison/checkout UI (untouched contract)
├── Affiliate/Coming Soon sections
└── Future travel guides placeholder only if content source is approved
```

---

## 4. Data Model and Configuration

### 4.1 Service categories (new local module)

Create `src/lib/travel-services.ts` (or the project-approved equivalent) with:

```ts
export type TravelServiceStatus =
  | "ACTIVE"
  | "AFFILIATE"
  | "COMING_SOON"
  | "DISABLED";

export type TravelServiceCategory = {
  id: string;
  label: string;
  description: string;
  icon: string; // safe icon key mapped to imported lucide icon, never arbitrary component input
  status: TravelServiceStatus;
  href?: string;
  displayOrder: number;
};
```

Rules:

- `eSIM` is the only ACTIVE category and links to the current Explore/destination purchase surfaces.
- `AFFILIATE` may link only through a validated URL record and must open external navigation with disclosure.
- `COMING_SOON` and `DISABLED` are not checkout links. They render disabled/labelled states.
- UI renders from config and never branches on eight hardcoded category names.
- Status changes must require only config changes, not changes to the primary grid component.

### 4.2 Destination metadata

Extend `Destination` only with display metadata that is safe and non-transactional, for example:

- `popularOrder?: number`
- `heroImage?: string` or artwork key
- `shortDescription?: string`
- `availableServiceIds?: string[]`

Do not add price/stock fields to static destination data. Actual eSIM availability remains derived from the existing loader.

### 4.3 Affiliate product config

Create `src/lib/affiliate-services.ts` with a narrow shape:

```ts
export type AffiliateService = {
  id: string;
  partnerName: string;
  productTitle: string;
  destinationCode: string;
  categoryId: string;
  image?: string;
  affiliateUrl: string;
  status: "ACTIVE" | "COMING_SOON" | "DISABLED";
  displayOrder: number;
};
```

Add a runtime validator/helper that accepts only `https:` URLs and rejects empty, malformed, non-http(s), or unapproved host values. The allow-list must be explicit and configurable; do not treat a sample Klook/Traveloka string as valid automatically. When no approved records exist, render Coming Soon, not fake products.

### 4.4 Future database shape (not part of phase-1 migration)

If admin-managed affiliate content is later approved, add an additive migration for an `affiliate_services` table:

```text
affiliate_services
- id uuid primary key
- partner_name text not null
- product_title text not null
- destination_code text not null
- category_id text not null
- image_url text nullable
- affiliate_url text not null
- status text check (ACTIVE, COMING_SOON, DISABLED)
- display_order integer not null default 0
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()
```

Required future controls: HTTPS/host validation, status check, display-order index, RLS/read policy, auditability, and no checkout/order relation. Do not implement this migration in the first execution wave without explicit approval.

---

## 5. UI/UX Specification

### Explore

- Container remains `Page`/existing max-width shell; do not alter bottom nav.
- Header uses `Explore`, subtitle exactly `Mau pergi ke mana?`, and compact search input with `aria-label="Cari destinasi"`.
- Service grid: 4 columns on mobile, 8 items; icon circle, Indonesian label, status badge for non-active, minimum touch target 44px. On desktop keep a compact responsive grid, not an oversized hero.
- Popular destination cards: horizontal scroll on mobile or 2-column grid; flag/image, Indonesian name, short availability line derived from actual data (`eSIM tersedia` only when current live set confirms it). No fake price/stock.
- Featured services: cards with a clear type/status badge:
  - live eSIM package cards derive from existing package view data and link to `/destination/$code` or existing checkout detail path;
  - affiliate cards show `Partner eksternal`, open validated URL, and disclose `Transaksi dilakukan di website partner`;
  - Coming Soon cards are non-clickable or have an accessible disabled button.
- AI Trip Planner card: exact headline `Rencanakan perjalananmu`; exact description `Bingung mulai dari mana? Bantu susun perjalanan internasionalmu.`; phase-1 interaction can collect destination/duration/interest locally and return a lightweight summary or a clear Coming Soon state. No AI API call.
- Loading: preserve route pending state and add skeletons for grid/cards if needed.
- Empty: no live destinations → explain catalog unavailable and retain retry; no affiliate records → show Coming Soon, not empty broken card.
- Error: reuse existing actionable retry and provider messaging; do not display static destinations as eSIM-buyable when provider fails.
- Dark mode: use existing semantic tokens (`bg-surface`, `text-foreground`, etc.), never hardcode light-only colors for new cards.

### 3D Asset Direction — Icon System

Use lightweight 3D icon assets for the Travel Services grid and selected Explore entry points, generated through the approved OpenAI image-generation workflow referred to by the user as **OpenAI Imagen Codex**. Treat this as an asset-production step, not a runtime AI feature: generated files are reviewed, optimized, committed as static assets, and served locally from the app. Do not call an image model from the browser and do not expose an API key.

#### Visual brief

- Style: compact soft-3D, iOS-inspired, rounded forms, premium travel marketplace, friendly but not childish.
- Composition: one centered object per icon, front/three-quarter view, readable at 24–40px, generous transparent/clean background, no text, no logos, no flags embedded inside service icons.
- Palette: Djiwa Travel brand red/coral plus warm neutral, with restrained highlights; assets must work on both light and dark surfaces.
- Consistency: fixed camera angle, light direction, shadow softness, object scale, and canvas ratio across all service icons.
- Forbidden: illegible micro-detail, dense scenes, watermarks, partner logos, fake product packaging, prices, QR codes, or copyrighted character likenesses.
- Generate one source sheet only if it can be reliably sliced without inconsistent padding; otherwise generate individual icons for predictable rendering.

#### Initial asset set

Create a versioned asset manifest for these eight service IDs, with a fallback lucide icon if an asset is missing or fails review:

- `esim`: smartphone/eSIM chip
- `attractions`: landmark/ticket or ferris wheel
- `transportation`: airport/train/transport vehicle
- `open-trip`: compact suitcase plus route pin
- `baggage`: travel suitcase
- `personal-shopper`: shopping bag with location pin
- `visa`: passport/document with approval mark
- `travel-insurance`: shield around a travel document

Destination cards may continue using the existing destination artwork/flag treatment; do not use generated 3D service icons as destination photography.

#### Asset pipeline and acceptance

1. Confirm the exact approved generation tool/model and account/workspace before implementation. If “Imagen Codex” is shorthand rather than an available OpenAI tool, record the actual provider/model in the manifest instead of inventing an integration.
2. Generate assets from a single shared prompt template plus per-icon object subject; store the prompt/version metadata outside the frontend bundle or in a small `README`/manifest.
3. Human/agent review each output for brand fit, transparency/background, no text/logo/watermark, consistent framing, and readability at target size.
4. Optimize static files to WebP/AVIF where the existing build supports it; preserve accessible fallback and avoid adding a large dependency. Target ≤50 KB per icon where practical and measure the bundle impact.
5. Store under an explicit path such as `src/assets/explore/services/` (or the repository’s established asset directory) with stable names matching service IDs. Do not place generated files in `public` unless the existing asset convention requires it.
6. Add `src/lib/explore-assets.ts` mapping service ID → imported asset + alt text + fallback icon key. UI consumes this manifest, not hardcoded image paths.
7. Test missing-asset fallback, dark/light contrast, image loading, and mobile rendering. If generation or review is unavailable, ship the same UI with lucide fallbacks and keep the 3D asset task explicitly pending.

### Destination detail

- Keep current `BackBar`, destination route, live loader, package filters, price display, comparison, pagination, checkout links, stock states, and `StickyCta`.
- Add modular blocks before/after the eSIM package section without replacing it:
  1. header/summary;
  2. available services;
  3. eSIM packages (existing canonical block);
  4. affiliate/activities and other service states;
  5. travel guides only when an approved content source exists.
- Do not call an affiliate card a product owned by Djiwa Travel. Use `rel="noopener noreferrer"`, safe external navigation, and disclosure.

### Responsive space budget

- Mobile target: header + search ≤ 150px; service grid ≤ 220px; popular destinations ≤ 250px; featured/AI blocks are independently scrollable/stacked.
- Desktop target: `max-w-md` shell may remain for current mobile app; if widening Explore is desired, do it only through an explicit shell decision because `Page` currently constrains every customer route. Do not silently widen all routes.
- Maintain existing bottom safe-area padding and 44px touch targets.

---

## 6. Implementation Waves and Bite-Sized Tasks

### Wave 1 — Data contracts and pure logic (no route UI replacement)

1. Create `src/lib/travel-services.ts` with status union, service config, icon keys, order, and status/link rules.
2. Create `src/lib/affiliate-services.ts` with typed config, HTTPS/host validator, and empty-safe filtering.
3. Add/extend destination display metadata in `src/lib/catalog.ts` without adding transactional fields.
4. Add pure tests:
   - `src/test/travel-services.test.ts`: all categories renderable, status transitions/config filtering, no checkout href for Coming Soon/Disabled.
   - `src/test/affiliate-services.test.ts`: valid HTTPS allow-list passes; invalid URL/host/status fails; no configured records yields no active card.

**Checkpoint:** `STARTED` data contract → `TESTING` pure tests → `DONE` with no behavior change to existing routes.

### Wave 2 — Reusable UI components + 3D assets

5. Produce the approved 3D service icon set using the shared prompt brief above; save reviewed, optimized files under the established asset directory and create `src/lib/explore-assets.ts` manifest with fallback icon keys.
6. Create `src/components/explore/service-category-grid.tsx`; render the asset manifest with accessible fallback, status badges, and no navigation for Coming Soon/Disabled.
7. Create `src/components/explore/destination-card.tsx`.
8. Create `src/components/explore/featured-service-card.tsx`.
9. Create `src/components/explore/ai-trip-planner-card.tsx` (local-only state; no provider call).
10. Add component tests or route-level interaction tests for:
    - search input/filter;
    - destination card links;
    - Coming Soon non-navigation;
    - affiliate disclosure and external URL attributes;
    - 3D asset load/fallback and stable alt text;
    - light/dark semantic class usage.

**Dependency:** components consume Wave 1 contracts and the reviewed asset manifest; they do not query provider/database themselves. If asset generation is not available in the execution environment, use lucide fallback and report the asset blocker without delaying the functional Explore implementation.

### Wave 3 — Integrate `/explore`

10. Modify `src/routes/explore.tsx`:
    - preserve loader, deadline, retry, cached/error/empty states;
    - change metadata copy from eSIM-only to travel marketplace while retaining truthful eSIM language where appropriate;
    - preserve `search()` and filter against actual available destination codes;
    - render service grid, popular destinations, live eSIM/featured services, and planner entry point;
    - do not manufacture package cards from `src/lib/catalog.ts`.
11. Update only necessary route tests/fixtures; keep existing `explore-availability` and recovery contracts.
12. Verify generated route tree/build output; never manually edit `src/routeTree.gen.ts` unless the generator explicitly requires it.

### Wave 4 — Integrate destination detail modularly

13. Create `src/components/destination/destination-services.tsx` for service status/affiliate blocks.
14. Modify `src/routes/destination.$code.tsx` to insert destination summary/services around the existing eSIM section.
15. Verify all existing package controls remain intact: live package values, sellability, stock-pending, checkout links, comparison, pagination, and sticky compare CTA.
16. Add route regression tests around loader/package data and view-level checks for checkout link preservation.

### Wave 5 — QA and release gate

17. Run focused tests for Explore, destination, catalog/sellability helpers, and affiliate validation.
18. Run full `npm run lint`, `npm run test`, and `npm run build`.
19. Run browser verification at 375px, 768px, and desktop width in light/dark mode:
    - `/explore` search and cards;
    - a live destination such as `/destination/jp`;
    - eSIM package → existing checkout route;
    - Coming Soon does not navigate;
    - Wallet, `/my-esim`, Profile, and bottom nav unchanged.
20. Capture screenshot/ASCII evidence and report changed files, tests, build, risks. Stop before deploy until user explicitly approves.

---

## 7. Dependency Graph / Parallelization

```text
Wave 1 (parallel by file)
├── travel-services.ts + tests
├── affiliate-services.ts + tests
└── catalog.ts metadata review

Wave 2 (parallel; each new component separate file)
├── ServiceCategoryGrid
├── DestinationCard
├── FeaturedServiceCard
└── AiTripPlannerCard

Wave 3 (sequential: same route file)
└── explore.tsx integration + route tests

Wave 4 (sequential on destination surface)
├── DestinationServices component
└── destination.$code.tsx integration + regression tests

Wave 5 (single verification gate)
└── lint → focused tests → full tests → build → browser/screenshot review
```

For execution, use `djiwa-travel-developer`/`subagent-frontend` for UI and `subagent-qa-tester` for independent verification. Database specialist is not needed for phase 1 unless the user approves the future affiliate migration. Do not delegate implementation to coding CLIs.

---

## 8. No-Hardcode and Data-Integrity Audit

- Do not hardcode live eSIM price, data, duration, stock, package code, or availability. These remain from reseller catalog/cache, sellability, and destination route loaders.
- Static service labels/status/order are product configuration and intentionally local in phase 1; document the single source module.
- Affiliate URL must be config-validated and approved; no placeholder partner URL rendered as active.
- Destination card “available services” must be derived from `serviceIds` plus actual eSIM availability; never infer availability from the destination list alone.
- “Popular” affects display order only, not stock or pricing.
- AI planner output must be clearly a planning suggestion/selection summary, not a booking or availability guarantee.
- External affiliate click must not create a local order, payment, wallet debit, or fake conversion record.

---

## 9. Acceptance Criteria Mapping

- [ ] Explore displays all configured travel service categories with Indonesian labels and statuses.
- [ ] Search filters destinations and preserves actual live eSIM availability constraints.
- [ ] Popular destinations open existing `/destination/$code` route.
- [ ] Destination detail still displays actual eSIM packages and existing checkout flow.
- [ ] Coming Soon and Disabled services cannot navigate to fake checkout.
- [ ] Valid affiliate URL opens externally with partner disclosure; invalid/unapproved URL is never rendered active.
- [ ] Featured eSIM data comes from existing live provider/catalog path; no fabricated price/stock.
- [ ] AI Trip Planner entry point works as lightweight UI only, without paid AI service.
- [ ] The approved 3D service icon set is generated/reviewed, optimized, mapped through an asset manifest, and has accessible fallback icons; no API key is shipped to the frontend.
- [ ] Loading, empty, cached, and error/retry states are present and truthful.
- [ ] Mobile, desktop, light, and dark layouts are verified.
- [ ] Wallet, My eSIM, Profile, auth, payment, provisioning, and global bottom navigation show no unintended changes.
- [ ] Lint, tests, build, and browser verification pass.
- [ ] No production deployment occurs without explicit approval.

---

## 10. Risks, Rollback, and Next Steps

| Risk | Mitigation / rollback |
|---|---|
| Provider catalog timeout makes Explore appear empty | Preserve current retry/error contract; never fall back to fake packages; rollback only Explore UI components if integration fails. |
| Static destination list diverges from live catalog | Keep live availability set as the gate for eSIM claims and destination links. |
| Affiliate URL redirects to unapproved/unsafe host | HTTPS + explicit host allow-list + external disclosure; default to Coming Soon. |
| New sections make mobile page too long | Compact cards, horizontal destination rail, independent sections, verify 375px screenshot. |
| Destination detail regression breaks checkout | Keep existing package block intact; route-level regression and eSIM checkout smoke test before merge. |
| Missing artwork for some destinations | Use approved fallback visual/flag; do not download or invent licensed images without approval. |
| 3D generation output is inconsistent, too large, or unavailable | Use a shared prompt/style guide, review every asset, optimize with measured bundle impact, and retain lucide fallback so functional delivery is not blocked. |
| Shell/navigation scope expands accidentally | Do not change `src/components/shell.tsx` in this task; report My Trips migration separately. |
| Founder cannot maintain many data sources | Keep phase 1 config modules small; defer admin/DB affiliate CRUD until real content volume justifies it. |

Rollback is file-scoped: revert only new Explore components/config and the targeted route integration, preserving existing eSIM route/data code. Do not use `git reset --hard` or `git clean`.

### Recommended follow-up after phase 1

1. Approve partner list and affiliate hosts, then seed only verified URLs.
2. Approve/licence destination images for the remaining popular countries.
3. Add destination guides from a defined content source.
4. Add admin-managed affiliate CRUD only after content operations require it; use additive migration + RLS + audit log.
5. Plan the future My Trips route separately; do not rename My eSIM in this task.
6. Consider AI Trip Planner backend only after the local flow has validated user demand and provider/cost approval.

---

## 10. Final Handoff Deliverables

The implementation handoff must report:

1. Ringkasan perubahan dan exact files modified/created.
2. Komponen existing yang digunakan ulang.
3. Fitur ACTIVE dan fitur yang masih `AFFILIATE`/`COMING_SOON`/`DISABLED`.
4. Daftar 3D service icons yang dihasilkan, provider/model metadata yang benar-benar digunakan, prompt version, file size, visual review result, and fallback mapping.
5. Testing, lint, typecheck/build, and responsive/light-dark verification evidence.
6. Risks, blockers, and whether any affiliate URL or asset remains pending approval.
7. Recommendation for the next development wave.

## 11. Definition of Done / Preview Efek

- Codebase audit findings and exact affected paths are documented above.
- Implementation is completed in waves with no unrelated file changes.
- `npm run lint`, focused tests, `npm run test`, and `npm run build` have real output.
- Browser verification produces screenshots or equivalent route/DOM evidence for mobile + desktop and light + dark.
- Existing eSIM package selection reaches the unchanged checkout path.
- Final handoff reports changed files, reused components, active services, Coming Soon services, test/build evidence, risks, and next recommendation.
- Production deploy remains blocked until the user gives explicit approval.
