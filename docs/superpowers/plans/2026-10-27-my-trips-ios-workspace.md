# My Trips iOS Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework `/my-trips` into an Apple-style travel workspace with a Today focus, Logbook trip cards, actionable checklist/itinerary rows, and existing trip features kept reachable.

**Architecture:** Keep the existing mutation/server-function contracts. Add one read-only `getMyTripsHome` server function that composes the existing trip summaries with the selected trip's near-term itinerary and open checklist items. Replace only the index route presentation; detail and feature routes remain the source of truth for full trip editing.

**Tech Stack:** TanStack Start, React, Tailwind CSS v4, Lucide icons, Vitest.

**Spec:** User-provided Apple Reminders/Logbook references in the conversation.

## Global Constraints

- Preserve current authentication, ownership scoping, database contracts, and mutation functions.
- Keep the mobile-first `max-w-md` shell and bottom tab navigation.
- Use existing destination imagery/assets only; no new brand or logo asset is required.
- Empty, unauthenticated, and database-fallback states must remain explicit and recoverable.

## Review Focus

- No trips: render a useful empty state with login/create actions.
- No itinerary/checklist rows: render compact empty copy without broken spacing.
- Ongoing vs upcoming vs past trips: select the correct focus trip and status label.
- Long names/destinations and large checklist counts: preserve truncation and readable hierarchy.
- Client navigation: no server-only imports may enter the route bundle.

### Task 1: Today read model

**Files:**
- Modify: `src/lib/my-trips.server.ts`
- Test: `src/test/my-trips-home.test.ts`

**Interfaces:**
- Produce `getMyTripsHome(): Promise<{ trips; focusTrip; agenda; checklist }>` through a GET server function.
- Keep existing `getMyTrips`, `getTrip`, and mutation exports unchanged.

- [ ] Add failing tests for focus selection, limited agenda/checklist mapping, and empty results.
- [ ] Implement the read model with user-scoped queries and safe fallback behavior.
- [ ] Run the focused tests.

### Task 2: Apple-style workspace UI

**Files:**
- Modify: `src/routes/my-trips.index.tsx`
- Test: `src/test/travel-ui.test.tsx` or a focused route contract test.

**Interfaces:**
- Consume `getMyTripsHome()` and existing `getMyTrips` mutations/routes.
- Render Today as default, a Logbook section, category shortcuts, checklist rows, and FAB create action.

- [ ] Add failing UI assertions for Today heading, focus trip, checklist action, Logbook, and create action.
- [ ] Implement the responsive iOS-style layout with accessible buttons/links.
- [ ] Keep existing auth and empty-state behavior.

### Task 3: Verification

- [ ] Run focused tests and the existing travel UI tests.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and local route smoke checks.
