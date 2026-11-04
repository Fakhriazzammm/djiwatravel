# Compact destination package deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the mobile destination package carousel compact and simple while preserving package comparison and checkout behavior.

**Architecture:** Keep the existing `Destination` route, package deck data, full-card button interaction, duration filter, and checkout link unchanged. Change only the deck/card presentation classes and add a focused source contract test that prevents the oversized styling from returning.

**Tech Stack:** TanStack Start/React, TypeScript, Tailwind utility classes, Vitest, ESLint, Nitro/Vite build, Travel VPS autodeploy.

**Spec:** `docs/superpowers/specs/2026-11-04-compact-destination-package-deck-design.md`

## Global Constraints

- Follow `DESIGN.md` → Mobile compact scale and `.claude/skills/djiwa-mobile-ui`.
- Keep label, quota, duration/quota type, total price, price per day, position indicators, selection state, and the buy CTA available.
- No changes to package selection rules, pricing, loader data, checkout routes, or provider/admin configuration.
- Keep touch targets and the full-card button interaction accessible.
- Preserve unrelated worktree files and do not deploy a stale build artifact.

## Review Focus

- Selected cards must remain visibly distinct and retain `aria-pressed` state — test the compact class contract in `src/test/destination-redesign.test.ts`.
- All package information and the CTA must remain in the card — inspect the unchanged JSX fields and verify the destination route in browser.
- Neighboring cards must remain discoverable through horizontal scrolling — verify the 390px/mobile preview after the change.
- The deck must keep working when there are no cards — preserve the existing `deck.length > 0 && chosen` guard and run the destination tests.
- Production must serve the new artifact, not merely the pushed SHA — verify `.deployed-sha`, service health, public route, and fresh asset marker after deploy.

---

### Task 1: Add the failing compact-deck contract test

**Files:**

- Modify: `src/test/destination-redesign.test.ts`

**Interfaces:**

- Consumes: `packageDeckCardClass(selected: boolean)` from `src/routes/destination.$code.tsx`.
- Produces: a focused regression test named `keeps the destination package deck compact`.

- [ ] **Step 1: Write the failing test**

  Import `packageDeckCardClass` and assert that the selected and unselected
  outputs use the intended compact sizing/radius/padding, the selected output
  uses solid `bg-brand-red text-white`, and neither output includes the old
  gradient or shadow treatment.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npx vitest run src/test/destination-redesign.test.ts -t "keeps the destination package deck compact"`

  Expected: FAIL because `packageDeckCardClass` is not yet exported.

### Task 2: Implement the compact presentation

**Files:**

- Modify: `src/routes/destination.$code.tsx:629-704`

**Interfaces:**

- Consumes: the existing `deck`, `chosen`, `chooseCard`, `shortData`, `pricePerDay`, and checkout link behavior.
- Produces: `packageDeckCardClass(selected: boolean)` and the same package deck with compact visual classes.

- [ ] **Step 1: Replace only the deck presentation classes**

  Add/export `packageDeckCardClass(selected: boolean)` in
  `src/routes/destination.$code.tsx`, use it for each card, and set the rail to
  `gap-2` and `pb-2`. The helper must return `w-[48%] max-w-[188px]`,
  `rounded-2xl`, and `p-3`. Keep the card as a full-button touch target with
  `aria-pressed`, `data-code`, snap positioning, and the existing focus ring.

- [ ] **Step 2: Reduce visual hierarchy without removing information**

  Keep the label, data, duration/type, total price, and price-per-day spans in
  the same order. Use `text-[20px]` for quota, `text-[15px]` for price,
  `text-[11px]` for duration, and `text-[10px]` for the per-day value. Replace
  the active gradient/heavy shadow with `bg-brand-red text-white`; retain the
  neutral ring for unselected cards.

- [ ] **Step 3: Run focused tests to verify the implementation**

  Run: `npx vitest run src/test/destination-redesign.test.ts src/test/mobile-compact-scale.test.ts`

  Expected: PASS, including the new compact-deck contract and existing helper/
  mobile-scale checks.

### Task 3: Run the project quality gates

**Files:**

- No additional source files.

**Interfaces:**

- Consumes: the changed route, focused test, design note, and plan.
- Produces: fresh evidence for test, lint, and build readiness.

- [ ] **Step 1: Run the full test suite**

  Run: `npm test`

  Expected: exit 0; record any unrelated baseline failure by name if present.

- [ ] **Step 2: Run lint**

  Run: `npm run lint`

  Expected: exit 0; do not mass-format unrelated files.

- [ ] **Step 3: Run the production build**

  Run: `npm run build`

  Expected: exit 0 and `.output/server/index.mjs` exists.

### Task 4: Commit, push, deploy, and verify production

**Files:**

- Commit only: `src/routes/destination.$code.tsx`, `src/test/destination-redesign.test.ts`, `docs/superpowers/specs/2026-11-04-compact-destination-package-deck-design.md`, `docs/superpowers/plans/2026-11-04-compact-destination-package-deck.md`.

**Interfaces:**

- Consumes: passing local gates and the repository's `scripts/djiwa ship` release path.
- Produces: pushed `main`, deployed Travel artifact, active `djiwatravel.service`, and public browser evidence.

- [ ] **Step 1: Review the exact diff and repository state**

  Run: `git diff --check && git status --short && git diff --stat`

  Expected: only the four scoped files are changed; preserve unrelated edits if
  any appear.

- [ ] **Step 2: Commit and push through the guarded release command**

  Run: `scripts/djiwa ship -m "fix(destination): compact package deck" 'src/routes/destination.$code.tsx' src/test/destination-redesign.test.ts docs/superpowers/specs/2026-11-04-compact-destination-package-deck-design.md docs/superpowers/plans/2026-11-04-compact-destination-package-deck.md`

  Expected: the command runs the scoped eslint/tsc/related-test gate, commits
  only the named files, pushes `main`, waits for autodeploy, and runs public
  checks. The full-suite baseline is recorded in the ledger and handoff. If
  the command reports a release failure, stop and report the boundary rather
  than claiming deploy.

- [ ] **Step 3: Verify the deployed artifact and service independently**

  Run: `scripts/djiwa status --quick` and inspect the public destination route
  with the browser preview at `/destination/jp?availability=all`.

  Expected: `.deployed-sha` matches the pushed commit, `djiwatravel.service`
  is active, the destination route is reachable, and the package deck is visibly
  compact with the buy link still present.
