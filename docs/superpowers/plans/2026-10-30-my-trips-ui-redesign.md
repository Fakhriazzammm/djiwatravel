# My Trips UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign My Trips overview and every existing feature tab into a clear, mobile-first trip workspace.

**Architecture:** Keep current TanStack routes, loaders, server actions, and database contracts. Rework the route components and add small shared presentational patterns for summaries, tab navigation, and contextual sheets.

**Tech Stack:** React, TypeScript, TanStack Router/Start, Tailwind, existing Lucide and motion primitives.

**Spec:** `docs/superpowers/specs/2026-10-30-my-trips-ui-redesign-design.md`

## Global Constraints

- Preserve existing routes, server actions, ownership checks, and database contracts.
- Keep current iOS-inspired visual language, safe areas, reduced motion, and responsive behavior.
- Reuse existing tokens and primitives; use 44px minimum touch targets.
- Do not introduce provider integrations, destructive migrations, or conversion data.
- Preserve unrelated worktree changes.

## Review Focus

- Empty/zero-data trips must still have an obvious next action.
- Long tab labels must stay reachable and active state must remain visible.
- Forms must preserve current validation and submission feedback when moved into sheets.
- Expenses and budget must respect currency minor-unit conventions.
- Editing/deleting checklist or booking items must retain existing authorization and confirmation behavior.

---

### Task 1: Trip overview and workspace shell

**Files:**
- Modify: `src/routes/my-trips.$tripId.tsx`
- Modify: `src/routes/my-trips.$tripId.$section.tsx`

- [ ] Replace oversized repeated page heading with compact trip identity, trip dates, traveler context, and a clear overview hierarchy.
- [ ] Add preparation, budget, bookings, and upcoming-agenda summaries using data already returned by the loader.
- [ ] Create a compact sticky horizontally scrollable tab rail with accessible labels and active-state visibility.
- [ ] Ensure overview and section routes preserve safe-area and bottom-navigation spacing.

### Task 2: Redesign itinerary and booking surfaces

**Files:**
- Modify: `src/routes/my-trips.$tripId.$section.tsx`

- [ ] Group itinerary activities by date and present them as a timeline.
- [ ] Present bookings as readable cards with available metadata and secondary overflow actions.
- [ ] Move add forms behind bottom sheets while retaining validation, mutation feedback, and refresh behavior.
- [ ] Add useful empty states with direct add actions.

### Task 3: Redesign budget, checklist, and expenses

**Files:**
- Modify: `src/routes/my-trips.$tripId.$section.tsx`

- [ ] Add budget totals and progress before category allocations; provide focused category editing without repetitive save buttons.
- [ ] Add checklist completion progress, clear completion controls, and secondary item actions.
- [ ] Add expense totals and date grouping, with category/payment details only where available.
- [ ] Move add/edit forms behind bottom sheets and retain current server input units.
- [ ] Make all list and zero-data states actionable.

### Task 4: Align My Trips home and finalize responsive polish

**Files:**
- Modify: `src/routes/my-trips.index.tsx`
- Modify: `src/routes/my-trips.$tripId.tsx`
- Modify: `src/routes/my-trips.$tripId.$section.tsx`

- [ ] Align the My Trips entry page cards and wording with the redesigned workspace.
- [ ] Remove visual artifacts and reduce duplicated vertical chrome.
- [ ] Check responsive classes and accessible names in the changed components.
- [ ] Summarize changed files and any follow-up limitations without claiming verification that was not run.
