# Google-only Travel sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Google sign-in/registration clear and mobile-friendly, then return the traveler to the page that initiated auth.

**Architecture:** Reuse the existing `CustomerAuth` dialog and central Better Auth Google OAuth. Style its content as a bottom sheet on mobile and centered dialog on desktop; use the current same-origin location as OAuth callback.

**Tech Stack:** React, TanStack Router, Radix Dialog, Tailwind CSS, Better Auth.

**Spec:** `docs/superpowers/specs/2026-10-30-google-only-auth-sheet-design.md`

## Global Constraints

- Google remains the only auth action in Travel.
- Do not change the shared auth service, Djiwa Pay, guest browsing, or guest checkout.
- Keep the account identity based on the existing Better Auth session.
- Do not add or run tests unless requested; verify with lint, production build, and browser route review.

## Review Focus

- OAuth callback must remain on `djiwatravel.com` and preserve the current route/query/hash.
- Mobile sheet must stay above the bottom tab bar and respect the home indicator safe area.
- Dialog remains keyboard-dismissible and reports Google errors accessibly.
- Account CTA is not shown as a login button after the session resolves to an authenticated user on home.

---

### Task 1: Refine the shared Google auth surface

**Files:**

- Modify: `src/components/customer-auth.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/my-trips.index.tsx`
- Modify: `src/routes/profile.tsx`

**Interfaces:**

- Keep `CustomerAuth`'s `size` variant; remove its unused `onAuthenticated` callback.
- Google callback is the current same-origin URL.

- [ ] Convert the content to a safe-area-aware mobile bottom sheet and centered desktop dialog.
- [ ] Update title and benefit copy; retain the Google loading and error states.
- [ ] Use current location for OAuth return and remove the unused callback prop from route call sites.
- [ ] Run ESLint on modified files and `npm run build`; inspect Home, Profile, and My Trips at mobile width.
