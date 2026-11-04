# Djiwa Travel design system

This is the canonical product/UI contract for customer Travel and admin
surfaces. It is iOS-inspired: calm hierarchy, tactile controls, generous
breathing room, and clear state feedback. It is not a copy of Apple screens,
logos, proprietary typography, or proprietary assets.

## Design priorities

Apply these priorities in order:

1. Make the next action and its consequence obvious.
2. Preserve a calm, content-first hierarchy on small screens.
3. Make every touch target comfortable and every state recoverable.
4. Use semantic color and motion to explain status, not decoration.
5. Add 3D visual assets when they improve recognition or emotional quality;
   never let decoration hide data, controls, or accessibility text.

## Visual language and tokens

The implementation source is [`src/styles.css`](src/styles.css) and existing
primitives are in [`src/components/ui/`](src/components/ui/). Reuse tokens and
primitives before adding a one-off value.

| Token      | Current direction                                   | Contract                                                                               |
| ---------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Typography | system stack: SF-style system fonts, Inter fallback | Use `large-title` for page titles; use weight and spacing before oversized text.       |
| Background | very light cool neutral                             | Keep long-reading surfaces quiet; use `surface` for cards and sheets.                  |
| Brand      | `--brand-red` and `--brand-red-soft`                | Reserve brand red for primary travel actions, emphasis, and the active product signal. |
| Semantic   | `--success`, warning, destructive, muted            | Color must pair with text, icon/shape, or status label; never use color alone.         |
| Border     | restrained neutral border                           | Prefer separation by spacing and surface before heavy outlines.                        |
| Radius     | `--radius` plus existing radius utilities           | Controls are smaller than cards; sheets are the largest continuous radius.             |
| Motion     | short press feedback and route transitions          | Respect `prefers-reduced-motion`; motion must explain state or direct attention.       |

Suggested scale: 4/8px rhythm and 16px minimum horizontal page padding. For
sizes, spacing, and density use the **Mobile compact scale** below; it overrides
older generous-spacing guidance. A touch target keeps a ≥44px hit area even when
its visual glyph is smaller. Avoid dense desktop tables on
mobile; use cards or horizontally scrollable data with an accessible summary.

## Mobile compact scale (iOS density standard)

Every customer page and every page fix is built to this scale so the app feels
like a native iOS app on a 390×844 device, not a scaled-up website. This is the
default; a bigger value needs a stated reason in the PR/handoff. Home hero and
marketing surfaces are the only places that may exceed it.

| Element                    | Standard                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Page padding               | `px-4`; `max-w-md`; `safe-top`; content ends above the tab bar (`pb-24`/`pb-28`)                                                              |
| Spacing                    | between groups `mt-3`–`mt-4`; inside cards `p-3` (hero card `p-4`); list row `px-3 py-2`                                                      |
| Page title                 | `text-[22px] font-bold leading-tight tracking-tight` + one 12px muted subtitle. Do **not** use `large-title`/`large-title-xl` on app screens. |
| Section label              | `text-[11px] font-medium uppercase tracking-wide text-muted-foreground`, `px-3`                                                               |
| Row title / body / meta    | 14px semibold / 13px muted / 11px muted. Nothing above 16px except the money figure.                                                          |
| Money hero / summary       | hero balance max 28px bold; summary tiles 15px bold                                                                                           |
| Buttons                    | primary CTA `min-h-10 rounded-xl text-[14px]`; secondary `min-h-9 text-[13px]`; text link 13px                                                |
| Chips / segmented / search | chip `min-h-8 text-xs`; segmented and search `min-h-9`                                                                                        |
| Header icon button         | `size-9` with `size-4` glyph                                                                                                                  |
| Icons                      | inline glyph `size-4`; leading tile `size-8 rounded-lg` with `size-4` glyph; 3D/illustration tile `size-9` (36px)                             |
| Radius                     | grouped lists `rounded-2xl`; hero card `rounded-[22px]`; controls `rounded-xl`; chips `rounded-full`                                          |
| List row height            | whole row is the tap target, `min-h-12` (48px)                                                                                                |
| Touch targets              | visual size may be 32–40px; keep a ≥44px hit area (row tap, `tap` utility, or padding) for small icon buttons                                 |
| Sheets / toasts            | sit above the tab bar: `mb-[calc(6.5rem+env(safe-area-inset-bottom))]` or `bottom-24`; never behind it                                        |

### Component specs (iOS density)

Use the shared utilities in `src/styles.css` before writing raw classes:
`ios-title`, `ios-subtitle`, `ios-section-label`, `ios-group`, `ios-row`,
`ios-btn`, `ios-chip`, `ios-tile`. Reference pages: `notifications.tsx`,
`wallet.tsx`.

| Component         | Spec                                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page title block  | `ios-title` + optional `ios-subtitle`; header icon button `size-9`, glyph `size-4`; no extra top hero padding (`pt-1`)                                                                       |
| Section           | `ios-section-label` (11px) above an `ios-group`; gap between sections `mt-4`; never `mt-6`+                                                                                                  |
| Grouped list      | `ios-group` (`rounded-2xl`, `bg-surface`); rows `ios-row` (min 48px, `px-3 py-2`); hairline separator `border-t border-border/60` inset to the text; leading `ios-tile` (32px, `rounded-lg`) |
| Info card         | `rounded-2xl bg-surface p-3`; feature/hero card `p-4`, `rounded-[22px]`; one title (14px semibold), one body (13px muted), one action                                                        |
| Stat tile         | 2-column grid `gap-2`, `px-3 py-2.5`, label 11px, value 15px bold                                                                                                                            |
| Action tile grid  | 4 columns, tile `min-h-[72px]`, icon `size-9`, label 10.5px, no more than 2 rows before a "Lihat semua"                                                                                      |
| Form              | field `min-h-10 rounded-xl bg-secondary px-3 text-[14px]`; label 12px above, 4px gap; help text 11px; fields `space-y-3`                                                                     |
| Buttons           | `ios-btn` (primary `bg-brand-red text-white`, secondary `bg-secondary`); full-width only inside cards/sheets; max one primary per card                                                       |
| Chips / segmented | `ios-chip` 32px; segmented control 36px with `rounded-lg` track                                                                                                                              |
| Sheet / dialog    | `rounded-3xl` only for bottom sheets; padding `p-3`/`p-4`; actions are 40–48px rows; sits above the tab bar                                                                                  |
| Header / nav      | fixed header block `shrink-0`, list scrolls under it; no collapsing large title on app screens                                                                                               |
| Hero              | image/banner height ≤ 160px; title ≤ 22px; Home hero is the only exception                                                                                                                   |
| Text              | max 2 lines for titles in rows (`line-clamp-2`), 1 line + truncate for meta; line-height `leading-snug`                                                                                      |
| Shadow            | none on rows/cards; `ios-card`-style hairline only for floating cards; sheets/toasts may use `shadow-xl`                                                                                     |

Vertical rhythm: page `px-4`; blocks `mt-4`; items inside a block `gap-2`/`gap-3`
(`space-y-3`); card padding `p-3`/`p-4`. Never use `mt-5+`, `p-5+`, `py-4+`,
`rounded-3xl` (outside bottom sheets), or `gap-4+` on mobile app screens.

Layout rules:

- A page has at most one scroll region. App-like screens with a fixed header
  (inbox, lists with filters) use `h-dvh flex-col overflow-hidden` with a header
  `shrink-0` and an inner `min-h-0 flex-1 overflow-y-auto overscroll-contain
pb-28` list; see `src/routes/notifications.tsx`. Content pages scroll normally
  inside `Page`.
- The first screen at 390×844 must show the header, the primary action, and at
  least three rows/cards of real content. If it does not, shrink or merge before
  adding anything.
- iOS patterns first: inset grouped lists, swipe actions, action sheets,
  segmented controls, undo toasts instead of confirm dialogs for reversible
  actions.

Anti-slop rules (reject in review):

- No oversized empty states (icon ≤ `size-8`, two short lines), no hero copy
  blocks, no repeated subtitle that restates the title.
- No emoji or decorative sparkles as UI icons; use lucide at 1.8 stroke or the
  approved 3D assets. No gradients except the brand wallet card/hero.
- No nested cards, heavy shadows, or glass blur on content surfaces.
- One primary action per card; secondary actions are text links or ⋯ menus.
- Copy is short, concrete Indonesian. No filler like "Kami akan senang…".
- Never ship a size by feel: use the table or write the exception down.

`src/test/mobile-compact-scale.test.ts` enforces the type-size ceiling on the
pages already migrated; add a page to its list when you bring it to this scale.
The project skill `djiwa-mobile-ui` (`.claude/skills/djiwa-mobile-ui/`) applies
this checklist when building or fixing any page.

## Responsive app shell

The root shell is `src/routes/__root.tsx`; customer navigation and shared shell
components are in `src/components/shell.tsx` and related files. Preserve safe
areas (`safe-top`, `safe-bottom`), the persistent bottom navigation pattern,
and the router `<Outlet />`.

- Mobile first: one dominant column, sticky action only when it does not cover
  content, bottom navigation with 4–5 high-value destinations.
- Tablet/desktop: cap reading width, use two-column detail layouts only when
  the secondary column remains scannable, and let admin tables use their full
  information density.
- Avoid nested scroll containers unless a sheet, table, or horizontal media
  rail clearly owns the gesture. Keep keyboard focus visible.
- Use `Sheet`/bottom-sheet patterns for contextual mobile tasks; use a dialog
  only for confirmation, destructive action, or a focused short form.

## Component contracts

### Cards and content sections

Cards group one decision or one status. Use a clear title, supporting metadata,
and one primary action. Do not make an entire card clickable while also hiding
the destination or action label. Distinguish zero, unavailable, loading, and
error states.

### Forms and sheets

Forms use visible labels, helpful examples, inline validation, and a submit
state that cannot be double-submitted. Date/time inputs must preserve the
trip's local timezone. On mobile, `Sheet` content should keep the title and
primary action discoverable while fields scroll beneath them.

### My Trips and itinerary

The `/my-trips` surfaces use a progress summary, trip identity, itinerary
timeline, budget, checklist, bookings, expenses, and sync state. The timeline
should make date, local time, location, category, and booking status scannable.
Destructive trip/activity actions require owner-scoped authorization and a
confirmation that names the affected data. Calendar sync status must state
connected, pending, partially synced, failed, or disconnected; never imply
success from a local optimistic row alone.

The Agenda also shows AI place ideas: a small carousel (116px cards: photo, name,
kind and walking time) above the day list, and a "Ke mana lagi ya?" sheet opened
from the carousel's "Lainnya" or the mascot bubble (search field, kind chips,
list rows with a 64px photo, detail with day and time fields). Every idea shows
its source; adding one uses the same activity record as a manual entry and
offers an undo toast. Without a clear photo, show the per-kind illustration,
never a guessed picture.

### Checkout, wallet, and booking

Checkout and booking surfaces show package, price, payment state, provisioning
state, and the next action in that order. Wallet UI is a bounded Djiwa Pay
integration; never present a Travel balance as the source of truth. QR/code or
activation data is revealed only in an authorized order context and never in
admin list summaries.

### Home eSIM card

One card, top to bottom: "Mau ke mana berikutnya?" with destination chips (always
shown), then, only when the customer owns eSIMs, the swipeable "eSIM kamu" rail.
Rail cards show a stand-alone flag (no tile behind it), remaining data, a linear
progress bar, used data, and days left, ordered low quota → active → ready to
install → in progress → expired. Tapping a chip opens two server-chosen
packages (Terlaris, Best Deal) inside the card; "Beli sekarang" opens checkout
as a bottom sheet. Never show more than these two picks there; the full catalogue
stays on the destination page. Admin pins override each slot per destination
(Admin → Settings → eSIM Beranda).

### Status, empty, loading, and error states

Every async surface needs explicit loading, ready, empty, and error states.
Empty means a valid zero result; unavailable means the provider or permission
is not ready. Error copy should say what happened, whether data was saved, and
what the user can do next. Admin protected reads must not turn an auth error
into an empty table.

### Admin surfaces

Admin pages prioritize decision cards, freshness/scope, and next action before
decorative density. Tables may be denser on desktop but need a mobile summary,
clear column labels, filters, pagination, and safe destructive confirmation.
Never invent metrics when production data is unavailable; redact activation
codes, tokens, and raw customer identifiers.

### Paired customer/admin delivery

Customer and Admin are two views of the same capability, not separate
afterthoughts. For every new feature or feature fix, design the pair together:

- Customer gets a clear entry point, understandable progress/result, recovery
  path, and accessible action.
- Admin gets the smallest safe control needed to enable, configure, inspect,
  fulfill, moderate, retry, or disable that capability for customers.
- Both surfaces use the same server-owned source of truth and communicate
  loading, empty, unavailable, and error states without implying success.
- An admin setting must produce a customer-observable result, and the design
  review must name the route/state that proves it. If no Admin surface is
  needed, the review must state why and confirm that support/operations do not
  require one.

The design review for a feature should therefore answer: “What does the
customer do?”, “What does Admin control or inspect?”, and “How do we know the
two surfaces remain consistent?”

## Motion and interaction

Use press feedback for touch, short opacity/position transitions for state
changes, and route progress only when navigation is actually pending. Do not
stack multiple loading overlays. Avoid parallax, looping animation, or motion
that competes with a form or payment action. The reduced-motion CSS contract in
`src/styles.css` is mandatory.

## 3D asset system

3D is the default for designed visual icon surfaces such as destination/feature
cards, hero/empty-state illustrations, and meaningful trip category markers.
It is not a requirement to replace every utility glyph.

### Asset contract

- Provenance: every asset has a source/creator, license or generation note,
  review date, and intended surface recorded beside the asset manifest.
- Naming: use stable kebab-case names such as
  `trip-category-flight-v1.webp`; do not rename an asset casually after release.
- Format: prefer transparent-background WebP/AVIF for raster 3D renders; use
  SVG only for authored vector utility marks; keep source files outside the
  client bundle unless the pipeline requires them.
- Visual consistency: use one material family, soft key light, gentle contact
  shadow, neutral camera elevation, and consistent object scale. Avoid a mixed
  collection of glossy icons, flat emojis, and unrelated lighting.
- Slots: define a fixed visual slot with an accessible adjacent label and a
  fallback background/shape. A missing image must not collapse layout or hide
  meaning.
- Budgets: target under 100KB per small icon, under 250KB per card/empty-state
  render, responsive dimensions, lazy loading below the fold, and no animated
  3D by default. Measure the production bundle before adding a collection.
- Accessibility: decorative assets use empty alt text; informative assets get
  concise alt text; the action remains a labelled HTML control. Never encode
  status or destination meaning only in a 3D image or color.
- Performance: provide a lightweight mobile variant when needed, reserve
  intrinsic dimensions to avoid layout shift, and test slow network rendering.

### When utility glyphs are correct

Use a system/Lucide-style glyph for close, back, menu, calendar, chevron,
search, edit, delete, loading, and other controls where instant recognition,
small size, focus clarity, or platform accessibility matters more than
decoration. Pair it with an accessible label and do not call it a failure to
use a basic glyph in these cases.

## Review checklist

- Does the change serve an actual surface such as `/my-trips`, `/profile`,
  checkout, wallet, or an `admin.*` route?
- Does the feature have both a customer journey and an admin operation/control,
  or a documented reason and evidence why one side is not applicable?
- Does changing the admin setting/control produce a verified customer-visible
  result through the shared source of truth?
- Are customer and admin loading, empty, unavailable, error, permission, and
  recovery states covered?
- Is the hierarchy clear at 375px width before desktop polish?
- Are loading, empty, error, disabled, focus, and reduced-motion states covered?
- Is the primary action reachable with one hand and at least 44px high?
- Is a 3D asset genuinely useful, licensed/provenanced, optimized, and paired
  with text/fallbacks?
- Does the UI preserve ownership, payment, and provider boundaries in
  `PROJECT.md`?
