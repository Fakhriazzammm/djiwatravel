# eSIM Home Summary Card Design

## Intent

Make eSIM the first-class product on the Home screen without adding a sixth
bottom-navigation item. A customer should immediately understand whether they
have no eSIM, a payment/provisioning task, an eSIM ready to install, an active
package, low remaining quota, or only older purchase history.

## Chosen surface

Render one dynamic, high-contrast eSIM card immediately after Home search and
before `Destinasi Populer`. The existing bottom navigation remains unchanged.
The card's summary area links to the relevant existing eSIM/order page; its
actions link to the existing finder, detail, order-status, My eSIM, or canonical
checkout routes.

This keeps the buying focus visible on every Home visit while preserving the
full `/my-esim` hub for customers with multiple purchases.

## Customer states and copy

| State | Customer answer | Primary action | Destination |
| --- | --- | --- | --- |
| Loading | `Menyiapkan eSIM kamu…` | none | skeleton |
| Empty | `Belum punya eSIM?` and a short connection benefit | `Cari paket eSIM` (opens the Home search) | `/checkout/$packageCode` after search; `Semua paket` to `/esim/finder` |
| Payment/provisioning | Explain that payment or provider processing is still in progress | `Lanjutkan pembayaran` or `Lihat status` | `/order/$id` |
| Ready | `eSIM siap dipasang` plus package and destination | `Pasang eSIM` | `/my-esim/$id` |
| Active | Package, destination, measured remaining quota or an explicit unavailable/unlimited label | `Lihat detail eSIM` | `/my-esim/$id` |
| Low quota | `Kuota hampir habis`, remaining percentage, and no invented zero | `Perpanjang paket` | `/checkout/$id` |
| History only | Invite the customer to reconnect using the latest package | `Beli lagi` | `/checkout/$id` |

If more than one order exists, show `Lihat semua eSIM` to `/my-esim`. The
primary order is selected deterministically: low-quota installed, other
installed, ready, latest pending, then latest terminal history. An expired
ready/installed order is treated as terminal by `effectiveOrderStatus`.

## Data and safety rules

- Quota is derived from the existing `usageView` provider contract.
- Unknown usage says that the provider has not reported it; it never renders
  `0 GB` or a made-up percentage.
- The current repository has no customer eSIM top-up route. Do not label the
  checkout action as top-up; use the already supported `Perpanjang paket` or
  `Beli lagi` intent and let canonical checkout re-read live availability.
- Wallet/Djiwa Pay balance stays separate from eSIM quota.
- Do not change the five bottom-navigation destinations.

## Visual and interaction direction

- Use the existing iOS-inspired spacing, rounded surfaces, brand primary panel,
  and red primary CTA.
- Make the main summary area a keyboard-focusable link, with explicit text
  labels so color and icons are not the only status signal.
- Show a real progress bar only for a measured quota; clamp its width to 0–100.
- Keep the card compact enough to appear before the destination discovery feed.
- Respect the existing motion/reduced-motion primitives by using the Home
  `Reveal` wrapper and no new motion loop.

## Iteration: compact card and in-card catalog search

The second iteration keeps the same placement and state model but makes the
card denser:

- Empty state is a compact call to action, not a second search field: a
  `Cari paket eSIM` button opens the single Home search dialog, and `Semua paket`
  links to `/esim/finder`. The Home dialog (`Cari destinasi & paket eSIM`) owns
  the only query input: it lists matching destinations and, for queries of at
  least two characters, `EsimPackageResults` with up to four `searchHomeEsimCatalog`
  packages that link to `/checkout/$packageCode`. The dialog closes on
  navigation. The server function filters the reseller catalog, applies
  `isRecommendablePackage` and the sellability check, and returns only
  `ViewPackage` fields so provider cost and markup never reach the browser; a
  stale or truncated catalog is disclosed in the results, and a failed lookup
  offers `Coba lagi`.
- Owned-eSIM states use the compact dark panel with the brand-red accent, a
  circular quota ring instead of a wide progress bar, and a two-up action row.
  When multiple orders exist, a `Pilih eSIM` selector switches which order the
  card summarizes, and `Lihat semua eSIM` remains the route to `/my-esim`.
- The ring keeps `role="progressbar"` with `aria-valuemin`, `aria-valuemax`,
  `aria-valuenow`, and a text percentage label, so the gauge is not the only
  status signal.

## Non-goals

- No new database tables, provider endpoints, or payment authority.
- No replacement of `/my-esim` detail, QR installation, usage, or reorder
  capabilities; the card is a summary and routing surface for those features.
- No bottom-nav redesign in this iteration.
