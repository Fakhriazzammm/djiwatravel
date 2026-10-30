# eSIM Home Summary Card Design

## Intent

Make eSIM the first-class product on the Home screen without adding a sixth
bottom-navigation item. A customer should immediately understand whether they
have no eSIM, a payment/provisioning task, an eSIM ready to install, an active
package, low remaining quota, or only older purchase history.

## Chosen surface

Render one dynamic, iOS-style grouped eSIM card immediately after Home search
and before `Destinasi Populer`. The existing bottom navigation remains
unchanged. The card's rows link to the relevant existing eSIM/order page; its
actions link to the existing finder, detail, order-status, My eSIM, or canonical
checkout routes.

This keeps the buying focus visible on every Home visit while preserving the
full `/my-esim` hub for customers with multiple purchases.

## Customer states and copy

| State                | Customer answer                                                                           | Primary action                                                                                  | Destination                                                            |
| -------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Loading              | `Menyiapkan eSIM kamu…`                                                                   | none                                                                                            | skeleton                                                               |
| Empty                | `Belum punya eSIM?` and a short connection benefit                                        | `Cari paket eSIM` (opens the Home search)                                                       | `/checkout/$packageCode` after search; `Semua paket` to `/esim/finder` |
| Payment/provisioning | Explain that payment or provider processing is still in progress                          | `Lanjutkan pembayaran` or `Lihat status`                                                        | `/order/$id`                                                           |
| Ready                | `eSIM siap dipasang` plus package and destination                                         | `Pasang eSIM`                                                                                   | `/my-esim/$id`                                                         |
| Active               | Package, destination, measured remaining quota or an explicit unavailable/unlimited label | `Lihat detail eSIM`                                                                             | `/my-esim/$id`                                                         |
| Low quota            | `Kuota menipis`, remaining percentage, and no invented zero                               | `Beli paket lagi` (a new package through canonical checkout; there is no customer top-up route) | `/checkout/$id`                                                        |
| History only         | Invite the customer to reconnect using the latest package                                 | `Beli paket lagi`                                                                               | `/checkout/$id`                                                        |

If more than one order exists, the card pages between current eSIMs with
accessible page dots and still shows `Lihat semua eSIM` to `/my-esim`. The
primary order is selected deterministically: unfinished payment, provisioning
failure, ready to install, low-quota installed, other installed, paid/provisioning,
then terminal history. An expired ready/installed order is treated as terminal
by `effectiveOrderStatus` and is excluded from the page dots. Each dot has a
44px-tall target, `role="radio"`/`aria-checked`, and Arrow/Home/End keys move
the selection.

## Data and safety rules

- Quota is derived from the existing `usageView` provider contract.
- Unknown usage says that the provider has not reported it; it never renders
  `0 GB` or a made-up percentage.
- The current repository has no customer eSIM top-up route. Label repeat
  purchase `Beli paket lagi` and let canonical checkout re-read live availability.
- Wallet/Djiwa Pay balance stays separate from eSIM quota.
- Do not change the five bottom-navigation destinations.

## Visual and interaction direction

- Use the existing iOS-inspired spacing, a rounded grouped surface, and a
  restrained brand-red accent.
- Make summary actions keyboard accessible, with explicit text labels so color
  and icons are not the only status signal.
- Show a quota ring only for measured usage; clamp its value to 0–100.
- Keep the card compact enough to appear before the destination discovery feed.
- Respect the existing motion/reduced-motion primitives by using the Home
  `Reveal` wrapper and no new motion loop.

## Iteration: compact card and catalog search

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
- Owned-eSIM states use a compact dark panel with the brand-red accent and a
  circular quota ring. When multiple orders exist, a `Pilih eSIM` selector
  switches which order the card summarizes, and `Lihat semua eSIM` remains the
  route to `/my-esim`.
- The ring keeps `role="progressbar"` with `aria-valuemin`, `aria-valuemax`,
  `aria-valuenow`, and a text percentage label, so the gauge is not the only
  status signal.

## Iteration: grouped card (current)

The grouped card supersedes the dark panel above. It keeps the same state model
and routes, with a light surface, one status badge, one clear summary, and
compact action rows. The empty state exposes the shared Home search and full
catalog. Owned eSIMs show destination, package details, measured quota and
expiry when available, then detail and repeat-purchase actions. Pending orders
show the next useful step. Only current eSIMs appear in the page dots; expired
and canceled history stays accessible through `/my-esim`.

The page dots use a single tab stop with arrow, Home, and End keyboard controls.
Each control has a 44px touch target; the visible dot remains small so the
card stays compact.

## Non-goals

- No new database tables, provider endpoints, or payment authority.
- No replacement of `/my-esim` detail, QR installation, usage, or reorder
  capabilities; the card is a summary and routing surface for those features.
- No bottom-nav redesign in this iteration.
