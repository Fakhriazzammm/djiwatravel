# Djiwa Travel Djiwa Pay Wallet Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Djiwa Pay wallet feel native inside Djiwa Travel, with no visible iframe wrapper and only the Travel bottom navigation.

**Architecture:** Keep the existing cross-origin iframe so Djiwa Pay remains responsible for wallet data and actions. In Travel page layout, make the frame full-bleed and remove its header/footer chrome; on Pay, allow framing only from the two Travel origins through CSP and keep Pay's existing rule that hides its navigation whenever framed.

**Tech Stack:** TanStack Start/React and Tailwind in Djiwa Travel; React/Vite and Nginx response headers in Djiwa Pay.

**Spec:** `docs/superpowers/specs/2026-10-29-travel-djiwapay-wallet-design.md`

## Global Constraints

- Wallet content remains visible; only the iframe boundary and its surrounding chrome disappear visually.
- Djiwa Travel owns the sole bottom tab bar for the embedded flow.
- Standalone Djiwa Pay keeps its own bottom navigation.
- Approved frame origins are `https://djiwatravel.com` and `https://www.djiwatravel.com`.
- Preserve `djiwapay.web.id` as the current canonical host and keep `pay.djiwatentram.web.id` working as a legacy origin until live behavior is verified.
- Do not touch or deploy unrelated dirty changes in `/Users/apple/djiwatentramapp`; implement Pay changes in a clean worktree based on `origin/main`.
- Djiwa Travel and Djiwa Pay deploy to separate VPS instances; verify and report them independently.

## Review Focus

- Page layout must remove the iframe header/footer without removing the Travel tab bar; manually verify `/wallet/pay` at mobile and desktop widths.
- Sheet layout must retain its existing header, close action, and external-open fallback; inspect the sheet separately.
- The Pay standalone route must continue showing its own nav; manually load each Pay hostname outside an iframe.
- An unapproved parent must be blocked by CSP; inspect response headers and verify a disallowed iframe cannot render.
- The auth bridge must still deliver an authenticated wallet inside the approved frame; manually verify the account and wallet data without executing a financial transaction.

---

### Task 1: Make the Travel page layout frameless

**Files:**
- Modify: `/Users/apple/Documents/djiwatravel/src/components/djiwa-pay-browser.tsx`

**Interfaces:**
- Keep the existing `DjiwaPayBrowser` props and `layout` variants unchanged.
- `layout="page"` fills the space above the Travel tab bar and renders only the wallet iframe.
- `layout="sheet"` preserves its existing title, close/refresh buttons, and external-open fallback.

- [x] Remove the header and footer only when `pageLayout` is true.
- [x] Remove rounded panel treatment and any iframe border in page layout; keep the iframe full width and height inside the existing top-to-bottom safe area.
- [x] Build Djiwa Travel with `npm run build`.
- [ ] Manually inspect `/wallet/pay` at mobile and desktop sizes and confirm the Travel Dompet tab remains visible and active (authenticated browser capture unavailable in this run).
- [ ] Open a wallet sheet route and confirm the sheet controls remain present.

### Task 2: Restrict and scope the Pay embed

**Files:**
- Modify on the Pay VPS: the active Nginx server block for `djiwapay.web.id` and its legacy Pay hostname, after identifying the exact file with `nginx -T`.

**Interfaces:**
- Keep Pay's existing behavior of hiding its bottom nav whenever framed. CSP, rather than a referrer check, is the authority that limits embedding to Travel; this remains stable across SSO redirects.
- Pay response policy is `Content-Security-Policy: frame-ancestors 'self' https://djiwatravel.com https://www.djiwatravel.com`.

- [x] Leave Djiwa Pay source untouched; preserve standalone mode behavior.
- [x] Inspect the live Pay Nginx configuration and add the `frame-ancestors` header only to the Pay virtual host. Do not add `X-Frame-Options: SAMEORIGIN`, which would block the intended cross-origin frame.
- [x] Run `nginx -t` before reloading Nginx; inspect the final response headers on both Pay hostnames.
- [ ] Manually verify an approved Travel frame loads and an unrelated-origin frame is denied.

### Task 3: Verify the cross-app wallet flow and release boundaries

**Files:**
- No additional source files.

**Interfaces:**
- Djiwa Travel remains the entry point at `/wallet/pay`.
- Djiwa Pay remains the wallet and transaction backend owner.

- [ ] Manually verify the shared-auth bridge, wallet display, refresh, and navigation out of the frame. Do not initiate a top-up or transaction during verification.
- [x] Deploy the Pay header policy only to the Djiwa Tentram VPS and confirm Nginx health, headers, and public Pay routes.
- [ ] Deploy Djiwa Travel after reconciling its production checkout: it contains unrelated uncommitted source edits and serves commit `1d84a78`, while this isolated implementation is based on `origin/main`. Do not replace its artifact from this older base.
- [ ] Report each VPS and deployed SHA separately; leave unrelated Djiwa Pay worktree changes untouched.
