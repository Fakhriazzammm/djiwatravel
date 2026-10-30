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

| Token | Current direction | Contract |
| --- | --- | --- |
| Typography | system stack: SF-style system fonts, Inter fallback | Use `large-title` for page titles; use weight and spacing before oversized text. |
| Background | very light cool neutral | Keep long-reading surfaces quiet; use `surface` for cards and sheets. |
| Brand | `--brand-red` and `--brand-red-soft` | Reserve brand red for primary travel actions, emphasis, and the active product signal. |
| Semantic | `--success`, warning, destructive, muted | Color must pair with text, icon/shape, or status label; never use color alone. |
| Border | restrained neutral border | Prefer separation by spacing and surface before heavy outlines. |
| Radius | `--radius` plus existing radius utilities | Controls are smaller than cards; sheets are the largest continuous radius. |
| Motion | short press feedback and route transitions | Respect `prefers-reduced-motion`; motion must explain state or direct attention. |

Suggested scale: 4/8px rhythm, 16px minimum horizontal page padding, 24px
section spacing, 32px+ hero breathing room. A touch target should be at least
44px high even when its visual glyph is smaller. Avoid dense desktop tables on
mobile; use cards or horizontally scrollable data with an accessible summary.

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

### Checkout, wallet, and booking

Checkout and booking surfaces show package, price, payment state, provisioning
state, and the next action in that order. Wallet UI is a bounded Djiwa Pay
integration; never present a Travel balance as the source of truth. QR/code or
activation data is revealed only in an authorized order context and never in
admin list summaries.

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
