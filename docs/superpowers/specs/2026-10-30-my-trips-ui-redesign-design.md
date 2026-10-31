# My Trips UI/UX Redesign

## Intent

Improve the customer My Trips experience on mobile by replacing the repeated
form-first layouts with a calm trip workspace: a useful overview, focused
feature tabs, contextual add flows, and clearer empty/loading/error states.

## Goals

- Make the trip overview the primary command center.
- Give each feature a layout appropriate to its data type:
  itinerary timeline, booking cards, budget summary, checklist progress, and
  expense history.
- Keep the primary action obvious and reachable with one hand.
- Move add/edit forms into bottom sheets so content remains visible.
- Preserve existing routes, server actions, ownership checks, and database
  contracts.
- Keep the current iOS-inspired visual language, safe areas, reduced motion,
  and responsive behavior.

## Non-goals

- No changes to payment, wallet, authentication, or trip ownership logic.
- No new provider integration, document upload backend, group permissions, or
  currency conversion service in this pass.
- No destructive migration or data-model rewrite.

## Current problems addressed

- Repeated page title and header consume vertical space.
- The five-tab strip is clipped and difficult to scan on narrow screens.
- Forms appear before useful content on every tab.
- Budget repeats a save action for every row.
- Checklist exposes destructive actions beside the main task action.
- Empty states are passive and leave a large unused area.
- The trip detail page lacks a concise preparation/status summary.

## Proposed experience

### Trip overview

- Stable trip header with destination, dates, traveler count, and overflow menu.
- Preparation progress card combining checklist completion, upcoming agenda,
  budget remaining, and booking count.
- “Next up” agenda card with a direct link to the full itinerary.
- “Needs attention” list showing incomplete checklist items and missing
  booking/budget data when applicable.
- One contextual “Tambah” action that opens a bottom sheet for the selected
  feature.

### Feature navigation

- Use a horizontally scrollable, sticky compact tab rail with an active pill.
- Preserve the existing route sections and deep links.
- Keep the current section visible after navigation and avoid truncating the
  active label.
- Use icons only as supporting cues; labels remain accessible text.

### Itinerary

- Group activities by date in a vertical timeline.
- Show time, title, location, category, and booking status in scannable cards.
- Keep the add activity form behind a bottom sheet.
- Surface empty state with a clear first-action button.

### Bookings

- Show bookings as cards with category, title, date, provider, and reference.
- Use a bottom-sheet form for creation/editing.
- Put edit/delete in an overflow action rather than exposing destructive text
  on the main list.

### Budget

- Add a summary block for total allocated, spent, remaining, and percentage.
- Show a compact progress indicator and category rows/cards.
- Replace per-row “Simpan” buttons with edit mode or a single bottom-sheet
  editor that saves one category at a time with clear feedback.

### Checklist

- Show completion progress at the top.
- Group items into preparation and general sections when the data supports it.
- Make checkbox completion the primary interaction.
- Move add, rename, and delete actions into a bottom sheet/overflow menu.
- Keep completed items visually subordinate but readable.

### Expenses

- Show total spent and recent expense count before the list.
- Group entries by date and show amount, description, and category/payment
  metadata when available.
- Use a prominent “Tambah pengeluaran” button that opens a bottom sheet.
- Preserve the existing amount/currency server contract; UI improvements must
  not invent conversion data.

## Visual and interaction rules

- Mobile-first at 375px; verify tablet/desktop after the narrow layout.
- Reuse existing tokens and primitives from `src/styles.css` and
  `src/components/ui/`.
- Use 16px page padding, 24px section rhythm, 44px minimum touch targets,
  restrained borders, and brand red only for primary/status actions.
- Use explicit loading, empty, success, and error states for every async form.
- Respect `prefers-reduced-motion` and keep bottom navigation/safe-area spacing.
- Avoid nested scrolling except for the tab rail and bottom-sheet content.

## Approaches considered

1. Keep the existing forms and only polish colors/spacing. Fastest, but it
   leaves the core information hierarchy and mobile usability problems intact.
2. Replace the page with one large dashboard and remove tabs. Cleaner for a
   small trip, but loses direct access and becomes dense for larger trips.
3. Use a trip command center plus focused redesigned tabs. This preserves the
   current route/data contracts while matching each surface to its task; this
   is the selected approach.

## Implementation boundaries

- Primary files are the My Trips route files and reusable My Trips components.
- Server loaders/actions should be reused unless a UI requirement exposes a
  real missing field; any required field change must be additive and reviewed.
- Existing unrelated worktree changes must remain untouched.
- Verification should include focused My Trips tests, a production build, and
  a narrow-screen visual/manual check if a local browser is available.

## Open builder decisions

- Exact card composition and icon choice can be settled during implementation
  using the existing design tokens.
- If the current loader lacks a count or summary needed for the overview, use
  already available data first; do not broaden queries until the gap is proven.
