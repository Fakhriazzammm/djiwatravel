# Djiwa Pay In-App Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Djiwa Pay iframe sheet with an external-browser fallback to the existing `/wallet` screen while keeping the Djiwa Travel bottom navbar available.

**Architecture:** Keep wallet data and mutations in `src/routes/wallet.tsx`. Put the cross-origin browser UI in a focused `DjiwaPayBrowser` component with a fixed canonical URL, accessible dialog controls, and a fallback link. The existing Wallet page owns only the open/close state.

**Tech Stack:** React 19, TanStack Start route, Tailwind CSS, lucide-react, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-29-djiwa-pay-in-app-browser-design.md`

## Global Constraints

- Preserve the existing Wallet balance, top-up, quick-action, and ledger behavior.
- Keep the Djiwa Travel navbar outside the browser sheet.
- Treat Djiwa Pay as cross-origin and always provide an external fallback.
- Do not add frontend credentials or tokens.

## Review Focus

- Wallet data loading succeeds: the launch action appears without changing existing data calls.
- Browser sheet is closed: no iframe or dialog is rendered.
- Browser sheet is open: iframe URL, accessible title, close control, and external fallback are present.
- Cross-origin flow cannot be embedded: external fallback remains usable.
- Mobile viewport: sheet remains usable above the fixed bottom navbar.

### Task 1: Define the failing browser-sheet and Wallet integration tests

**Files:**

- Create: `src/test/djiwa-pay-browser.test.tsx`
- Modify: `src/test/wallet-scope-ui.test.tsx`

**Interfaces:**

- The tests expect `DjiwaPayBrowser` to accept `{ open: boolean; onOpenChange: (open: boolean) => void }`.

- [ ] **Step 1: Write tests**
  - Assert the component renders nothing when closed.
  - Assert the open state renders a dialog named `Djiwa Pay`, iframe `https://djiwapay.web.id`, close button, and external fallback link.
  - Assert the Wallet screen exposes `Buka Djiwa Pay` and opens the dialog.
- [ ] **Step 2: Run the focused tests and verify they fail for the missing behavior**

Run: `npm test -- src/test/djiwa-pay-browser.test.tsx src/test/wallet-scope-ui.test.tsx`

Expected: FAIL because `DjiwaPayBrowser` and its Wallet launch action do not yet exist.

### Task 2: Implement the focused Djiwa Pay browser sheet

**Files:**

- Create: `src/components/djiwa-pay-browser.tsx`

**Interfaces:**

- Produces `DjiwaPayBrowser({ open, onOpenChange })`.
- Exposes `DJIWA_PAY_URL = "https://djiwapay.web.id"` for the iframe and fallback link.

- [ ] **Step 1: Implement the minimal component**
  - Render nothing when closed.
  - Render a fixed, mobile-safe dialog when open.
  - Use an iframe with an accessible title and the canonical URL.
  - Add close, refresh, and `Buka di browser` controls.
  - Keep the fallback link `target="_blank"` with `rel="noreferrer"`.
- [ ] **Step 2: Run the focused component test**

Run: `npm test -- src/test/djiwa-pay-browser.test.tsx`

Expected: PASS.

### Task 3: Integrate the browser sheet into Wallet

**Files:**

- Modify: `src/routes/wallet.tsx`

**Interfaces:**

- Wallet owns `djiwaPayOpen` state and passes it to `DjiwaPayBrowser`.

- [ ] **Step 1: Add the launch action without changing wallet data behavior**
  - Add `djiwaPayOpen` state.
  - Add a clearly labelled `Buka Djiwa Pay` button in the loaded Wallet view.
  - Render `DjiwaPayBrowser` from the Wallet page so the existing `Page` still supplies the bottom navbar.
- [ ] **Step 2: Run the Wallet integration test**

Run: `npm test -- src/test/wallet-scope-ui.test.tsx`

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
