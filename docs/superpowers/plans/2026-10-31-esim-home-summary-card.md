# eSIM Home Summary Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Home a dynamic, customer-friendly eSIM dashboard card that makes purchase, activation, quota, and repeat-purchase actions immediately discoverable.

**Architecture:** Add a pure state/view-model helper over the existing `Order`, `effectiveOrderStatus`, `usageView`, and `reorderIntent` contracts. Render that view model in a focused card component with typed TanStack Router links, then place it after Home search and before destination discovery. Keep `/my-esim` and the existing detail/checkout surfaces authoritative for full workflows.

**Tech Stack:** React 19, TanStack Start/Router, TypeScript, Vitest, Testing Library, Tailwind utility classes, existing motion and eSIM journey primitives.

**Spec:** `docs/superpowers/specs/2026-10-31-esim-home-summary-card-design.md`

## Global Constraints

- The eSIM card renders immediately after Home search and before `Destinasi Populer`.
- The five bottom-navigation destinations remain unchanged.
- Unknown provider usage must say it is unavailable; never render invented `0 GB` usage.
- The current repository has no customer eSIM top-up route, so use `Perpanjang paket` or `Beli lagi`, not a false top-up action.
- Djiwa Pay wallet balance remains separate from eSIM quota.
- Existing detail, QR installation, usage, history, and canonical checkout routes remain the source of truth.
- Preserve unrelated worktree changes and do not push, merge, or deploy in this implementation.

## Review Focus

- A newly loaded customer must see a loading card before orders resolve; test it in the card task.
- An empty order list must lead to `/esim/finder` with customer-friendly purchase copy; test it in the state-model and card tasks.
- A low-quota measured order must show the provider percentage and checkout renewal action; test it in the state-model task.
- Missing usage must not become zero quota; test it in the state-model task.
- Expired active orders and multiple-order lists must fall through to history/list affordances deterministically; test it in the state-model task.

### Task 1: eSIM Home Summary State Model

**Files:**
- Create: `src/lib/esim-home-summary.ts`
- Create: `src/test/esim-home-summary.test.ts`

**Interfaces:**
- Consumes: `Order` from `src/lib/orders.ts`, `effectiveOrderStatus` from `src/lib/esim-status.ts`, `usageView` and `formatGb` from `src/lib/travel-journey.ts`, and `reorderIntent` from `src/lib/travel-journey.ts`.
- Produces: `EsimHomeTarget`, `EsimHomeAction`, `EsimHomeSummary`, and `buildEsimHomeSummary(orders: Order[], now?: number): EsimHomeSummary` for the card component and Home route.

- [ ] **Step 1: Write the failing state tests**

  Add deterministic order fixtures and tests named:

  - `returns a finder CTA for a customer without eSIM orders`, asserting `kind === "empty"`, title `Belum punya eSIM?`, and target `{ kind: "finder" }`.
  - `prioritizes a low-quota installed eSIM and points renewal to canonical checkout`, asserting `kind === "low"`, `remainingPercent === 10`, a `Perpanjang paket` action, and `{ kind: "checkout", id: packageId }`.
  - `describes an installed order with unavailable usage instead of inventing zero`, asserting `kind === "active"`, a provider-unavailable quota label, and no `0 GB` text.
  - `routes a ready order to its detail page for installation`, asserting `kind === "ready"` and `{ kind: "detail", id: orderId }`.
  - `routes a pending payment to order status and labels the next customer action`, asserting `kind === "pending"`, `Lanjutkan pembayaran`, and `{ kind: "order", id: orderId }`.
  - `uses latest terminal history when no active or pending order remains`, asserting `kind === "history"` and a checkout target.
  - `treats an expired installed order as history and exposes the full list when multiple orders exist`, asserting `kind === "history"` and `hasMultiple === true`.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm test -- src/test/esim-home-summary.test.ts`

  Expected: FAIL because `src/lib/esim-home-summary.ts` does not yet exist.

- [ ] **Step 3: Implement `buildEsimHomeSummary` in `src/lib/esim-home-summary.ts`**

  Define the target union for finder/list/detail/order/checkout links. Resolve
  effective statuses using the supplied `now`; rank low measured installed,
  installed, ready, latest pending, then latest terminal order. Use
  `usageView({ active: status === "INSTALLED", ... })` so unavailable usage is
  explicit. Build Indonesian customer copy and reuse `reorderIntent` for the
  checkout package id and label.

- [ ] **Step 4: Run the focused tests to verify they pass**

  Run: `npm test -- src/test/esim-home-summary.test.ts`

  Expected: all state-model tests PASS.

- [ ] **Step 5: Commit the state model**

  ```bash
  git add src/lib/esim-home-summary.ts src/test/esim-home-summary.test.ts
  git commit -m "feat: model home esim summary states"
  ```

### Task 2: Standout eSIM Summary Card

**Files:**
- Create: `src/components/esim-home-summary-card.tsx`
- Create: `src/test/esim-home-summary-card.test.tsx`

**Interfaces:**
- Consumes: `EsimHomeSummary` and `buildEsimHomeSummary` from Task 1, plus `Order`.
- Produces: `EsimHomeSummaryCard({ orders }: { orders: Order[] | null })`, including loading, empty, active, low, pending, ready, history, and multiple-order presentations.

- [ ] **Step 1: Write the failing card tests**

  Render the component in a small memory router containing the card's target
  paths. Assert loading exposes `aria-busy`, empty exposes `Beli eSIM sekarang`
  and an `/esim/finder` href, active exposes `data-state="active"` and its
  quota, low exposes `Kuota hampir habis` and `Perpanjang paket`, pending
  exposes `Lanjutkan pembayaran`, and multiple orders expose `Lihat semua eSIM`.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm test -- src/test/esim-home-summary-card.test.ts`

  Expected: FAIL because the card component does not yet exist.

- [ ] **Step 3: Implement `EsimHomeSummaryCard`**

  Render a loading skeleton for `orders === null`; otherwise build the summary
  view. Use an article with an accessible `data-testid="esim-home-summary"`
  and `data-state`, a focusable summary link, a clamped measured quota bar,
  explicit status text, optional `Lihat semua eSIM`, and typed route links for
  every target. Use existing brand primitives and avoid nested anchors.

- [ ] **Step 4: Run the focused tests to verify they pass**

  Run: `npm test -- src/test/esim-home-summary-card.test.ts src/test/esim-home-summary.test.ts`

  Expected: all card and state-model tests PASS.

- [ ] **Step 5: Commit the card**

  ```bash
  git add src/components/esim-home-summary-card.tsx src/test/esim-home-summary-card.test.ts
  git commit -m "feat: add customer esim summary card"
  ```

### Task 3: Home Integration and Regression Coverage

**Files:**
- Modify: `src/routes/index.tsx:1-275`
- Modify: `src/test/client-rpc-boundary.test.ts` only if the source-contract test needs a focused assertion
- Create: `src/test/esim-home-integration.test.ts`

**Interfaces:**
- Consumes: `EsimHomeSummaryCard` from Task 2 and the existing `useOrders` hook.
- Produces: Home rendering with the eSIM summary between search and `Destinasi Populer`; the old compact `Perjalanan aktif` section is removed so there is one canonical Home summary surface.

- [ ] **Step 1: Write the failing Home contract test**

  Read `src/routes/index.tsx` as a source contract and assert the new summary
  component is imported/rendered, appears before the `Destinasi Populer`
  heading, and the old `Perjalanan aktif` heading is absent. Also assert the
  five navbar route strings remain unchanged in `src/components/shell.tsx`.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm test -- src/test/esim-home-integration.test.ts`

  Expected: FAIL because Home still renders only the old active-trip block.

- [ ] **Step 3: Integrate the card into Home**

  Import `EsimHomeSummaryCard`, remove the derived `active*` display values and
  conditional compact section, and render the card immediately after the search
  dialog. Wrap it in the existing `Reveal` section so it follows the existing
  reduced-motion behavior. Leave popular destinations, service tiles, guides,
  and the five bottom-nav entries unchanged.

- [ ] **Step 4: Run integration and focused UI tests**

  Run: `npm test -- src/test/esim-home-integration.test.ts src/test/esim-home-summary-card.test.ts src/test/esim-home-summary.test.ts src/test/travel-ui.test.tsx`

  Expected: all focused tests PASS.

- [ ] **Step 5: Commit Home integration**

  ```bash
  git add src/routes/index.tsx src/test/esim-home-integration.test.ts
  git commit -m "feat: surface esim dashboard on home"
  ```

### Task 4: Whole-branch Verification

**Files:**
- No planned source changes; only fix regressions if verification finds them.

**Interfaces:**
- Consumes: Tasks 1–3 committed feature branch.
- Produces: verified local branch and a truthful handoff separating local,
  committed, pushed, deployed, and public states.

- [ ] **Step 1: Run the full test suite**

  Run: `npm test`

  Expected: all tests pass; report any pre-existing warning separately.

- [ ] **Step 2: Run focused static checks and build**

  Run: `npx eslint src/lib/esim-home-summary.ts src/components/esim-home-summary-card.tsx src/routes/index.tsx src/test/esim-home-summary.test.ts src/test/esim-home-summary-card.test.tsx src/test/esim-home-integration.test.ts` and `npm run build`.

  Expected: targeted lint and production build pass without server-only code entering the client bundle.

- [ ] **Step 3: Review the diff and status**

  Run: `git diff HEAD~3..HEAD --stat && git status --short --branch`

  Expected: only feature files/docs are present on `feat/esim-dashboard`; no
  generated dependency noise or unrelated main-checkout files are changed.

- [ ] **Step 4: Record completion**

  Do not push or deploy in this task. Report the worktree path, commits, test
  results, build result, and the explicit fact that GitHub/VPS/public
  verification remains pending user authorization.
