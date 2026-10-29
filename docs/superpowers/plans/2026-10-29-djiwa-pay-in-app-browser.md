# Djiwa Pay In-App Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the Djiwa Pay iframe sheet and external-browser fallback available from `/wallet`, including when the Travel wallet API fails.

**Architecture:** Keep wallet data and mutations in `src/routes/wallet.tsx`. Put the cross-origin browser UI in a focused `DjiwaPayBrowser` component with a fixed canonical URL, accessible dialog controls, and a fallback link. The Wallet page owns the open/close state and renders a small launch card in both the loaded and error states, so Travel API availability does not gate Djiwa Pay access.

**Tech Stack:** React 19, TanStack Start route, Tailwind CSS, lucide-react, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-29-djiwa-pay-in-app-browser-design.md`

## Global Constraints

- Preserve the existing Wallet balance, top-up, quick-action, and ledger behavior.
- Keep the Djiwa Travel navbar outside the browser sheet.
- Treat Djiwa Pay as cross-origin and always provide an external fallback.
- Do not add frontend credentials or tokens.
- Preserve the Travel API error message and retry action when the wallet read fails.

## Review Focus

- Wallet data loading succeeds: the launch action appears without changing existing data calls.
- Browser sheet is closed: no iframe or dialog is rendered.
- Browser sheet is open: iframe URL, accessible title, close control, and external fallback are present.
- Cross-origin flow cannot be embedded: external fallback remains usable.
- Mobile viewport: sheet remains usable above the fixed bottom navbar.
- Wallet API error: Djiwa Pay launch action remains visible while retry remains available.

### Task 1: Define the Wallet error-state regression test

**Files:**

- Modify: `src/test/wallet-scope-ui.test.tsx`

**Interfaces:**

- The tests expect `DjiwaPayBrowser` to accept `{ open: boolean; onOpenChange: (open: boolean) => void }`.

- [ ] **Step 1: Add the failing error-state test**
  - Mock `getCustomerWallet` to reject.
  - Assert `Wallet belum dapat dimuat` remains visible.
  - Assert `Buka Djiwa Pay` is visible and opens the `Djiwa Pay` dialog with `https://djiwapay.web.id`.
- [ ] **Step 2: Run the focused test and verify it fails before the implementation**

Run: `npm test -- --run src/test/wallet-scope-ui.test.tsx`

Expected: FAIL because the error state does not yet expose the Djiwa Pay launch action.

### Task 2: Keep the existing in-app browser behavior covered

**Files:**

- Test: `src/test/djiwa-pay-browser.test.tsx`

**Interfaces:**

- Produces `DjiwaPayBrowser({ open, onOpenChange })`.
- Exposes `DJIWA_PAY_URL = "https://djiwapay.web.id"` for the iframe and fallback link.

- [ ] **Step 1: Run the existing component test**

Run: `npm test -- --run src/test/djiwa-pay-browser.test.tsx`

Expected: PASS, proving the existing iframe, close control, and external fallback remain unchanged.

### Task 3: Integrate the browser launch action into the Wallet error state

**Files:**

- Modify: `src/routes/wallet.tsx`

**Interfaces:**

- Wallet owns `djiwaPayOpen` state and passes it to `DjiwaPayBrowser`.

- [ ] **Step 1: Add a shared launch card and render it when `error` is set**
  - Keep the existing loaded-state card and open/close state.
  - Add the same labelled launch action to `ErrorState`, preserving its retry callback and error copy.
  - Keep `DjiwaPayBrowser` under `Page` so the bottom navbar remains outside the sheet.
- [ ] **Step 2: Run the Wallet integration tests**

Run: `npm test -- --run src/test/wallet-scope-ui.test.tsx src/test/djiwa-pay-browser.test.tsx`

Expected: PASS.

### Task 4: Verify the complete change

**Files:**

- No additional files.

- [ ] **Step 1: Run lint**

Run: `npm run lint`

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

- [ ] **Step 3: Run the production build**

Run: `npm run build`

- [ ] **Step 4: Review the diff for scope and confirm no secrets or unrelated changes**
