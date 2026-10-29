# Delete Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow an authenticated trip owner to delete a trip and its cascaded data after explicit confirmation.

**Architecture:** Add an ownership-scoped server mutation that deletes the `travel_trips` row; existing database `ON DELETE CASCADE` constraints remove child records and calendar event mappings. Add a confirmation dialog/action to the trip detail header and navigate back to `/my-trips` after success.

**Tech Stack:** TanStack Start server functions, React/TanStack Router, PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-delete-trip-design.md`

## Global Constraints

- Delete only the authenticated user's trip.
- Require explicit confirmation before the destructive action.
- Preserve existing unrelated working-tree changes.
- Do not add soft-delete or undo behavior.

## Review Focus

- A user cannot delete another user's trip: test ownership predicate and not-found behavior.
- Database failure rolls back the mutation: keep deletion in one server query/transaction boundary.
- Cancel confirmation performs no mutation: test UI action boundary.
- Successful deletion returns to My Trips: test navigation callback.
- Cascaded child cleanup remains delegated to existing schema constraints: verify migration definitions.

### Task 1: Ownership-scoped delete mutation

**Files:**
- Modify: `src/lib/my-trips.server.ts`
- Test: `src/test/my-trips.persistence.test.ts`

- [ ] Write a failing test for `deleteTrip` with owner id and `returning` result.
- [ ] Run the focused test and confirm the function is missing.
- [ ] Implement `deleteTrip(input)` using the existing `itemIdSchema` pattern and `delete from travel_trips where id=$1 and customer_auth_subject=$2 returning id`.
- [ ] Throw `Perjalanan tidak ditemukan` when no row is returned.
- [ ] Export `deleteTripRecord` as a POST server function.
- [ ] Run the focused persistence tests.

### Task 2: Confirmed trip-detail action

**Files:**
- Modify: `src/routes/my-trips.$tripId.tsx`
- Test: `src/test/my-trips-route-auth.test.ts` or a focused trip-detail UI test.

- [ ] Add a destructive “Hapus perjalanan” action in the detail header.
- [ ] Require `window.confirm` with the trip name before calling `deleteTripRecord`.
- [ ] On success navigate to `/my-trips`; on failure keep the trip page visible and show an error.
- [ ] Run focused route/UI tests and Prettier.

### Task 3: Verification

- [ ] Run focused trip tests and the existing Calendar regression test.
- [ ] Run production build.
- [ ] Review `git diff --check` and confirm unrelated Calendar working-tree changes are untouched.
- [ ] Commit only the delete-trip implementation, test, and this plan/spec documentation.
