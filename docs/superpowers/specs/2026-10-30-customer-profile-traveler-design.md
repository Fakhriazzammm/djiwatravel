# Customer Profile Traveler Data Design

## Intent

Make `/profile` a calm, iOS-inspired traveler profile that captures the
minimum reusable identity and traveler details needed for future travel flows.
The page should feel like a personal settings surface, not a dense checkout
form.

## Goals

- Keep Better Auth email read-only and preserve server-side ownership by the
  authenticated `user.id`.
- Add editable display name, WhatsApp, nationality, date of birth, and gender.
- Group information into `Akun`, `Kontak`, and `Data traveler` sections with
  visible labels, helpful hints, inline validation, and clear save states.
- Keep onboarding compatible: only email and WhatsApp remain required to pass
  the existing global profile gate; added traveler fields are optional.
- Keep sensitive data out of client logs, analytics, and URLs.

## Non-goals and anti-goals

- Do not add passport, address, payment, wallet, or credential fields.
- Do not change Better Auth, Djiwa Pay ownership, checkout contact semantics, or
  the separate Tentram/Pay application.
- Do not make the page a multi-step wizard or use large decorative cards that
  obscure the next action.

## Constraints

- Use the existing TanStack Start route, Drizzle schema, numbered additive SQL
  migration, shell primitives, tokens, and reduced-motion behavior.
- Existing profiles must continue to load and save with only email and
  WhatsApp. New columns are nullable and added without a backfill requirement.
- Validate date of birth as a real date in the past, gender against an
  allow-list, and nationality as a short non-empty country label/code.

## Approaches

1. **Recommended — additive profile fields and grouped settings UI.** Extend
   the existing profile row/API and keep the onboarding gate focused on required
   contact data. This preserves current contracts while giving `/profile` a
   complete traveler surface.
2. Separate traveler table linked to `customer_profiles`. This gives cleaner
   future extensibility but adds joins, migration complexity, and ownership
   surfaces for a small first release.
3. Store optional fields in JSON. This is flexible but weakens validation,
   queryability, and the project's typed migration conventions.

The recommended approach is selected because it is the smallest safe change
that satisfies the requested UX and avoids cross-project identity changes.

## Proposed data and interaction

`customer_profiles` gains nullable `display_name`, `nationality`,
`date_of_birth`, and `gender`. The API read/write contract returns those fields
and rejects invalid optional values. The profile page renders a compact account
header followed by grouped sections. Editing is one page with clear labels;
save uses the existing staged progress label and successful save collapses the
form back to a readable summary. Cancel restores the last saved draft.

The existing onboarding sheet may show the new optional fields only if the
implementation can remain compact; it must not make them required or block
existing users from continuing.

## Verification

Add focused validation/normalization tests, API/schema contract tests where
existing test seams allow, then run the focused tests, full Vitest suite,
lint, and production build.
