# Wallet Pay Auth Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent `/wallet/pay` from showing the unauthenticated Djiwa Pay login page while the Travel-to-Pay bridge is still being established.

**Architecture:** Keep the existing server-side one-time bridge and cross-origin cookie boundary. When `sharedAuth` is enabled, the browser component will resolve the bridge URL before rendering the iframe; bridge failure will show an actionable state instead of silently loading raw Pay. Non-bridged sheet usage keeps its current direct Pay behavior.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, TanStack Start.

**Spec:** `docs/superpowers/specs/2026-10-29-travel-djiwapay-wallet-design.md` and the approved auth-gate approach from this task.

## Global Constraints

- Djiwa Pay remains the authority for wallet balance, ledger, settlement, and payment credentials.
- Travel continues to use a short-lived server-side bridge token; no cookie/localStorage sharing is added.
- Existing unrelated worktree changes remain untouched.
- `/wallet/pay` keeps the Travel bottom navigation and page layout contract.

## Review Focus

- Bridge request is pending: the iframe must not point at raw `https://djiwapay.web.id`.
- Bridge request returns a valid URL: the iframe must use only that URL.
- Bridge request fails or returns malformed data: the user sees recovery guidance and no unauthenticated Pay iframe.
- Component closes/unmounts during the request: late results must not update the component.
- Existing non-shared-auth sheet behavior: it must continue to load the normal Pay URL.

### Task 1: Add the failing auth-gate component tests

**Files:**
- Modify: `src/test/djiwa-pay-browser.test.tsx`
- Test: `src/test/djiwa-pay-browser.test.tsx`

**Interfaces:**
- Consumes the existing `DjiwaPayBrowser` props.
- Produces assertions for pending, success, failure, and non-shared-auth behavior.

- [ ] **Step 1: Write the failing tests**
  - Mock `globalThis.fetch` for a pending bridge and assert no iframe is rendered with the raw Pay URL.
  - Resolve a valid bridge response and assert the iframe uses the returned URL.
  - Return a non-OK response and assert an auth recovery message/action is rendered without a Pay iframe.
  - Preserve the existing direct-load test for `sharedAuth={false}`.
- [ ] **Step 2: Run the focused test and verify it fails for the missing gate**
  - Run `npm test -- --run src/test/djiwa-pay-browser.test.tsx`.
  - Expected: the new auth-gate assertions fail against the current immediate raw iframe behavior.

### Task 2: Implement the auth gate

**Files:**
- Modify: `src/components/djiwa-pay-browser.tsx`

**Interfaces:**
- Consumes `fetch("/api/djiwa-pay/bridge", { credentials: "include" })`.
- Produces the existing iframe only after a valid bridge URL when `sharedAuth` is true; otherwise produces a recoverable error state.

- [ ] **Step 1: Implement the minimal state machine**
  - Track `bridgeStatus` and the resolved `frameSrc`.
  - Reset to pending when opening/reopening shared-auth mode.
  - Ignore late responses after cleanup.
  - Render a compact loading state while pending, an actionable auth/error state on failure, and the iframe only on success.
  - Keep direct Pay loading unchanged when `sharedAuth` is false.
- [ ] **Step 2: Run the focused tests and verify they pass**
  - Run `npm test -- --run src/test/djiwa-pay-browser.test.tsx`.
  - Expected: all browser tests pass.

### Task 3: Verify the repository change

**Files:**
- Review: `src/components/djiwa-pay-browser.tsx`, `src/test/djiwa-pay-browser.test.tsx`

- [ ] **Step 1: Run the full test suite**
  - Run `npm test`.
- [ ] **Step 2: Run lint and production build**
  - Run `npm run lint` and `npm run build`.
- [ ] **Step 3: Review diff and status**
  - Run `git diff --check`, `git diff --stat`, and `git status --short`.
  - Confirm only the intended component/test/plan changes were introduced and unrelated existing files remain untouched.
