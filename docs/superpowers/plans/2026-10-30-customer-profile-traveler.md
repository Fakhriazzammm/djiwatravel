# Customer Profile Traveler Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the customer profile with optional traveler identity fields and redesign `/profile` into a calm grouped iOS-style settings surface.

**Architecture:** Keep the existing `customer_profiles` row and authenticated `user.id` ownership. Add nullable columns through an additive migration, validate optional fields in shared/server contracts, and let the existing profile event synchronize `/profile`, onboarding, and checkout without changing required-contact semantics.

**Tech Stack:** TanStack Start, React 19, TypeScript, Drizzle/PostgreSQL, Zod, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-30-customer-profile-traveler-design.md`

## Global Constraints

- Email remains read-only and must equal the authenticated Better Auth email.
- Email and WhatsApp remain the only required fields for onboarding completion.
- New traveler fields are nullable and optional: display name, nationality, date of birth, gender.
- Do not add passport, address, payment, wallet, or credential fields.
- Preserve server-side ownership through the authenticated Better Auth `user.id`.
- Use an additive numbered SQL migration; do not rewrite migration `008_customer_profiles.sql`.

## Review Focus

- Existing rows with null traveler fields still load and save with only email/WhatsApp — test shared validation and API schema compatibility.
- A future date of birth is rejected — test date validation.
- Unsupported gender and empty/oversized nationality are rejected — test allow-list and bounds.
- Canceling an edit restores the last saved profile — test UI state behavior if the existing UI test seam supports it.
- Onboarding does not require optional fields — test `isCustomerProfileComplete` with only email/WhatsApp.

---

### Task 1: Shared traveler profile contract

**Files:**
- Modify: `src/lib/customer-profile.ts`
- Test: `src/test/customer-profile.test.ts`

**Interfaces:**
- Produces `CustomerProfileDraft` with `displayName`, `nationality`, `dateOfBirth`, and `gender` nullable/optional values, shared error keys, normalization, and completion semantics.

- [ ] **Step 1: Add failing tests** for optional fields, valid normalization, future date rejection, gender allow-list rejection, nationality bounds, and completion with only required contact fields.
- [ ] **Step 2: Run `npx vitest run src/test/customer-profile.test.ts`** and confirm the new assertions fail for missing contract behavior.
- [ ] **Step 3: Implement the smallest typed validation and normalization contract** while preserving existing WhatsApp/email behavior.
- [ ] **Step 4: Re-run the focused test and confirm it passes.**

### Task 2: Database and server/client profile contract

**Files:**
- Create: `migrations/021_customer_traveler_profile.sql`
- Modify: `drizzle/schema.ts`
- Modify: `src/lib/customer-profile.server.ts`
- Modify: `src/lib/customer-profile-client.ts`
- Test: `src/test/customer-profile-server.test.ts` or the nearest existing server contract test location

**Interfaces:**
- `GET /api/customer-profile` returns nullable optional traveler fields.
- `POST /api/customer-profile` accepts the same draft shape, validates optional fields, and persists under the authenticated `user.id`.

- [ ] **Step 1: Add failing server contract tests** for nullable legacy rows, valid optional data, and rejection of invalid optional data without accepting a browser owner.
- [ ] **Step 2: Run the focused server test and confirm the new behavior fails.**
- [ ] **Step 3: Add the additive migration and matching Drizzle columns.**
- [ ] **Step 4: Extend the Zod input, read projection, insert, update, and returned profile shape; keep email ownership enforcement unchanged.**
- [ ] **Step 5: Keep client save normalization and profile-updated event typed with the extended draft.**
- [ ] **Step 6: Run focused server and profile tests; confirm they pass.**

### Task 3: Profile settings UI

**Files:**
- Modify: `src/routes/profile.tsx`
- Test: `src/test/profile-ui.test.tsx` or the nearest existing profile UI test location

**Interfaces:**
- `/profile` renders grouped `Akun`, `Kontak`, and `Data traveler` sections.
- Edit state supports visible labels, inline errors, save progress, success summary, and cancel restoration.

- [ ] **Step 1: Add failing UI assertions** for section headings, labels, optional field controls, read-only email, and saved/cancel states.
- [ ] **Step 2: Run the focused UI test and confirm it fails for the current dense form.**
- [ ] **Step 3: Replace the profile card form with grouped settings sections using existing `Page`, `group`, `row`, and design tokens.**
- [ ] **Step 4: Implement controlled inputs and field-level validation/error copy for the new optional fields; preserve calendar, orders, auth, and logout sections.**
- [ ] **Step 5: Implement cancel restoration from the last saved profile and retain the existing staged save label/event behavior.**
- [ ] **Step 6: Run the focused UI test and confirm it passes.**

### Task 4: Compatibility and release verification

**Files:**
- Modify: `src/components/customer-onboarding-gate.tsx` only if the extended event/state shape requires it
- Modify: `src/routes/checkout.$id.tsx` only if typing requires a non-breaking optional-field adjustment

- [ ] **Step 1: Run `npm test`.** Record any baseline failures exactly.
- [ ] **Step 2: Run `npm run lint`.** Fix only regressions caused by this change.
- [ ] **Step 3: Run `npm run build`.** Confirm the production artifact compiles.
- [ ] **Step 4: Inspect `git diff --check`, `git status --short`, and the final diff** to ensure unrelated dirty files remain untouched.
