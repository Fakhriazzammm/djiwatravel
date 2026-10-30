# Admin Operations Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the selected customer-to-admin operational gaps without creating a second source of truth.

**Architecture:** Add guarded admin read/action server functions behind `.fn.ts` browser boundaries. Reuse existing dashboard read models, support tables, and the idempotent provisioning service; record refund decisions locally while keeping provider execution fail-closed.

**Tech Stack:** TanStack Start, React, TypeScript, PostgreSQL, Drizzle SQL, Vitest, Zod.

**Spec:** `docs/superpowers/specs/2026-10-31-admin-ops-foundation-design.md`

## Global Constraints

- Better Auth session and `requireAdmin()` remain the authorization boundary.
- Customer contacts and provider payloads remain masked/omitted from browser read models.
- Djiwa Pay/Mayar remains the authority for payment and refund execution.
- Preserve unrelated worktree changes.

## Review Focus

- Anonymous or non-admin action: must fail before mutation.
- Invalid case/order/request IDs: must be rejected by Zod and not mutate.
- Retry of a settled/provisioning-failed order: must reuse the existing idempotent provisioning path.
- Refund approval: must record an auditable decision but must not claim provider settlement.
- Customer privacy: list/detail read models must remain masked and omit secrets.

### Task 1: Activate admin navigation and Customers/Analytics workspaces

**Files:**
- Modify: `src/components/admin-navigation.ts`
- Modify: `src/routes/admin.customers.tsx`
- Modify: `src/routes/admin.analytics.tsx`
- Create: `src/lib/admin-customers.fn.ts`
- Create: `src/lib/admin-customers.server.ts`
- Create: `src/routes/admin.customers.$id.tsx`
- Test: `src/test/admin-p0-scope.test.ts`, `src/test/admin-ui-contract.test.ts`

- [ ] Write failing contract tests for live guarded routes, navigation links, masked customer data, and analytics loader.
- [ ] Run the focused tests and confirm failure because legacy redirects/navigation are still present.
- [ ] Implement read-only customer list/detail projections and analytics from existing Travel tables.
- [ ] Replace redirects, add navigation entries, and preserve privacy/empty/error states.
- [ ] Run focused tests and the full test suite.

### Task 2: Add Support reply and status actions

**Files:**
- Create: `src/lib/admin-support.fn.ts`
- Create: `src/lib/admin-support.server.ts`
- Modify: `src/routes/admin.support.tsx`
- Create: `migrations/023_admin_support_actions.sql`
- Test: `src/test/admin-support-actions.test.ts`

- [ ] Write failing validation/authorization/source-contract tests.
- [ ] Run the focused test and confirm the action boundary is absent.
- [ ] Implement admin reply and status update with safe actor subject, bounded body/reason, and updated timestamps.
- [ ] Add the form and explicit success/error states; customer support reads must observe the same message/status.
- [ ] Run focused tests and the full test suite.

### Task 3: Add Provisioning retry action

**Files:**
- Create: `src/lib/admin-provisioning.fn.ts`
- Create: `src/lib/admin-provisioning.server.ts`
- Modify: `src/routes/admin.provisioning.tsx`
- Test: `src/test/admin-provisioning-actions.test.ts`

- [ ] Write failing action-contract tests.
- [ ] Run the focused test and confirm the action boundary is absent.
- [ ] Implement admin retry using `provisionSettledTravelOrder(orderId)` after admin authorization and UUID validation.
- [ ] Add row-level retry UI with safe result/error states and refresh the queue.
- [ ] Run focused tests and the full test suite.

### Task 4: Add auditable refund decisions

**Files:**
- Create: `src/lib/admin-refunds.fn.ts`
- Create: `src/lib/admin-refunds.server.ts`
- Modify: `src/routes/admin.refunds.tsx`
- Create: `migrations/024_admin_refund_decisions.sql`
- Test: `src/test/admin-refund-actions.test.ts`

- [ ] Write failing tests for decision validation, idempotency, and provider fail-closed behavior.
- [ ] Run the focused test and confirm the mutation boundary is absent.
- [ ] Implement approve/reject decision recording with actor, reason, and idempotency key; do not call Mayar.
- [ ] Add decision controls and customer-visible status copy that distinguishes recorded decision from provider refund completion.
- [ ] Run focused tests and the full test suite.

### Final verification

- [ ] Run `git diff --check` and focused admin tests.
- [ ] Run `npm test` and record unrelated baseline failures separately.
- [ ] Run `npm run build` and confirm `.output/server/index.mjs` exists.
- [ ] Review the customer/admin surface matrix and report local-only status; do not commit, push, or deploy without explicit request.
