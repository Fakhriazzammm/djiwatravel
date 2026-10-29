# Clean Mobile UX Foundation

## Intent

Give Djiwa Travel a calm, clean, mobile-first interface inspired by the visual hierarchy in the supplied Oyenza reference: clear primary information, generous whitespace, grouped rows, subtle dividers, restrained color, and persistent bottom navigation. Apply those principles to travel tasks rather than reproducing a finance dashboard.

## Goals

- Establish reusable global visual tokens and customer navigation/layout primitives.
- Make Home lead with destination search and useful travel context (active trip or eSIM state when available).
- Make Explore a focused destination-discovery surface with clear package availability and a simple path to Finder.
- Keep existing route, pricing, checkout, account, and analytics behavior intact.
- Preserve semantic colors for payment, connectivity, warnings, and destructive actions.

## Non-goals

- Rebuild every route in one change; transaction, account, and admin routes follow in later stages.
- Copy Oyenza's financial metric, chart, labels, illustration, or brand identity.
- Change commercial rules, payment processing, authentication, or backend contracts.

## Design decisions

- Use the existing system font stack and remove the globally fetched Nunito font if no UI depends on it.
- Use one shared token source for neutral canvas/surfaces, text, borders, brand accent, semantic status, radii, and spacing.
- On mobile, prefer grouped list surfaces and thin separators over multiple elevated cards; keep desktop content comfortably centered and readable.
- Home's primary action is choosing a destination. Show trip/eSIM context only when actual data is available; never invent a summary metric.
- Explore prioritizes search and destinations. Finder remains a distinct guided filter flow but shares the customer shell and tokens.
- Keep the five existing customer destinations and tab routing unless source evidence shows a broken contract.

## Approaches

- Replace all customer and admin screens at once: rejected for this phase because it creates a broad regression surface across commerce and operations.
- Apply a shared foundation, then migrate representative entry pages and continue by journey: selected because it creates a visible standard while preserving existing route contracts.
- Style each route independently: rejected because the audit found inconsistent local values and duplicated presentation decisions.

## Constraints

- Existing TanStack Start/React/Tailwind stack and current route contracts.
- Preserve the Lovable-connected Git history; no force push, rebase, amend, or squash of published commits.
- Avoid changing backend semantics or business copy that encodes terms/pricing.

## Acceptance

- Shared shell and tokens provide a consistent mobile-first baseline.
- Home has one obvious destination-search action and contextual travel content.
- Explore exposes destinations and Finder without competing promotional panels.
- Loading, empty, and unavailable data remain distinguishable.
- Current route destinations, query state, and CTA behavior remain functional.
