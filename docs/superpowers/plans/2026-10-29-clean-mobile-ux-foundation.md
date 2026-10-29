# Clean Mobile UX Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Apply a clean, consistent mobile-first visual system across all Djiwa Travel customer and admin routes.

**Architecture:** Extend existing CSS variables and shared shell primitives, then migrate route groups by user journey while retaining TanStack route loaders, navigation, and commercial behavior. Use grouped list surfaces and status-aware detail pages for customer journeys, and the same neutral tokens with operational density for admin.

**Tech Stack:** React 19, TanStack Start/Router, Tailwind CSS 4, Motion, Lucide.

**Spec:** `docs/superpowers/specs/2026-10-29-clean-mobile-ux-foundation-design.md`

## Global Constraints

- Preserve route and business behavior; presentation changes must not alter pricing, payment, identity, or backend contracts.
- Do not invent trip, eSIM, or availability data.
- Preserve semantic colors for operational and payment states.
- Respect safe areas, reduced motion, keyboard focus, and mobile layouts.
- Preserve Lovable-published Git history.

## Review Focus

- No available destinations: retain a useful empty/unavailable explanation and recovery action.
- Small mobile viewport: prevent clipped headers, search controls, and tab labels.
- User navigates back to Explore: preserve existing destination query/filter behavior.
- Reduced motion: transitions must remain suppressed by the existing global preference.
- Data loading failure: never present missing data as zero or successful availability.

### Task 1: Global visual tokens and customer shell

**Files:**
- Modify: `src/styles.css`
- Modify: `src/routes/__root.tsx`
- Modify: `src/components/shell.tsx`

- [x] Consolidate neutral canvas, grouped surface, text, border, accent, semantic colors, and radius tokens in `src/styles.css`.
- [x] Remove the global Nunito stylesheet request if no remaining component depends on it; retain system font fallback.
- [x] Refine `Page`, `TabBar`, `BackBar`, `StickyCta`, section heading, and grouped row primitives to use shared tokens and consistent safe-area sizing.
- [x] Preserve tab destinations, active route indication, keyboard focus, and reduced-motion behavior.

### Task 2: Home destination-first dashboard

**Files:**
- Modify: `src/routes/index.tsx`
- Reuse: `src/components/shell.tsx` and existing explore components/data helpers.

- [x] Keep the destination search as the single primary action and simplify its hierarchy.
- [x] Reorder secondary sections so active travel/eSIM context appears only when real data exists, followed by destination discovery and useful services.
- [x] Reduce decorative card/shadow use; use grouped sections, concise labels, and subtle dividers.
- [x] Preserve existing search submission, navigation, analytics, and content destinations.

### Task 3: Explore and Finder consistency

**Files:**
- Modify: `src/routes/explore.tsx`
- Modify: `src/routes/finder.tsx`
- Reuse: `src/components/explore/*` where fit is established by existing behavior.

- [x] Make Explore lead with destination search and a scannable destination list/collection, with availability clearly represented.
- [x] Keep Finder's guided form and filters while moving it onto the shared `Page`/navigation shell and global tokens.
- [x] Preserve URL search parameters, destination/package navigation, availability states, and analytics.
- [x] Ensure mobile controls and list rows remain usable at narrow widths.

### Task 4: Package purchase and fulfillment routes

**Files:**
- Modify: `src/routes/destination.$code.tsx`, `src/routes/plan.$id.tsx`, `src/routes/checkout.$id.tsx`
- Modify: `src/routes/order.$id.tsx`, `src/routes/receipt.$id.tsx`, `src/routes/refund.$order.tsx`

- [x] Present package attributes and activation steps as compact grouped rows.
- [x] Keep price, stock, payment, provisioning, refund, and receipt semantics explicit.
- [x] Reduce elevated surfaces and retain one clear purchase action through the flow.

### Task 5: Trips, eSIM, and account routes

**Files:**
- Modify: `src/routes/my-trips*.tsx`, `src/routes/my-esim*.tsx`, `src/routes/wallet.tsx`, `src/routes/profile.tsx`, `src/routes/notifications.tsx`, `src/routes/support.tsx`

- [x] Apply grouped rows to trip/eSIM lists and preserve detailed progress/status context.
- [x] Apply the shared token hierarchy to wallet, profile, notifications, and support states.
- [x] Keep forms, account actions, support-case actions, and privacy/financial semantics intact.

### Task 6: Admin routes

**Files:**
- Modify: `src/components/admin-shell.tsx`, `src/routes/admin*.tsx`

- [x] Replace shared shell and common neutral admin colors with global visual tokens.
- [x] Normalize route-level neutral surfaces, controls, and mobile list/table treatments.
- [x] Preserve semantic operational colors and readiness/data-freshness language.

### Task 7: Whole-route audit and handoff

**Files:**
- Review all customer, legal, and admin routes and shared components.

- [x] Inspect customer, account, legal, guide, and Admin page routes for local styling outliers; API and redirect-only routes do not render a page UI.
- [x] Review the implementation diff for changes to navigation, business flows, and data/state semantics.
- [x] Follow the instruction not to run tests/build unless requested; report that automated verification was not run.
- [x] Report scope and verification status without claiming unverified runtime behavior.
