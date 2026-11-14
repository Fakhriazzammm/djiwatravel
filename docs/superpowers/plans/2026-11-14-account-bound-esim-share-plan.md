# Account-bound eSIM Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind new eSIM share claims to the recipient's verified Djiwa account so that the same account can reopen the eSIM in another browser while other accounts cannot see its QR.

**Architecture:** Add nullable `esim_share_links.claimed_by_subject`, derive it only from the verified Better Auth session in the server handler, and keep the old HttpOnly-cookie path for legacy claimed rows. Keep `/e/$token` preview minimal, make login return to the same link, animate the before/after states with the existing `motion/react` dependency and mascot asset, and reuse existing owner/Admin controls.

**Tech Stack:** TanStack Start server functions, PostgreSQL numbered migrations, React, `motion/react`, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-14-account-bound-esim-share-design.md`

## Global Constraints

- Recipient identity comes only from `getAuthenticatedUser().id`; browser data never selects the claimant.
- Only the matching account receives QR/activation details; account mismatch and signed-out access fail closed.
- Existing `claim_hash` rows stay browser-cookie-bound; do not backfill or reassign their identity.
- Migration 075 is additive, nullable, and does not add an index or alter existing rows.
- Keep token hashing/encryption, owner-scoped order access, eligibility checks, Admin kill switch, and revocation behavior.
- Customer UI follows DESIGN.md mobile compact scale and respects reduced motion.
- Do not include unrelated workspace changes in commits or deployment artifacts.

## Review Focus

1. Concurrent first claims: exactly one account wins; test with an atomic-update result race.
2. Unclaimed anonymous preview: package metadata remains visible but no QR/usage is loaded; test server response.
3. Account-bound read: matching session opens without the original browser cookie; different or missing session never receives secrets; test both.
4. Legacy claim: matching cookie still opens and mismatched/missing cookie stays blocked; test server response.
5. Revoked, expired, disabled, malformed claimed rows, and Admin status: continue failing closed and never expose claimant identity; test server/Admin read models.

---

### Task 1: Account-bound server claim contract

**Files:**
- Create: `migrations/075_esim_share_claim_account.sql`
- Modify: `src/lib/esim-share.server.ts`
- Modify: `src/test/esim-share-server.test.ts`

**Interfaces:**
- `getAuthenticatedUser()` remains the identity source and returns the verified `id`.
- `claimSharedEsimHandler({ data: { token } })` claims only an unclaimed link and returns the existing `SharedEsimLanding` union.
- `loadSharedEsim(token)` reads an account claim by verified session; it retains cookie validation only when `claimed_by_subject` is null and the legacy `claim_hash` exists.
- Owner/Admin `ShareLinkSummary.claimed` is based on `claimed_at`; neither read model returns `claimed_by_subject`.

- [x] **Step 1: Write failing server tests** in `src/test/esim-share-server.test.ts` for:
  - a claim update that writes the authenticated subject and does not set a claim cookie;
  - same-subject access with no cookie returning `open` and loading the QR;
  - another subject and an unauthenticated session returning `claimed_elsewhere` without usage/QR reads;
  - a failed first-claim update followed by another account's claim returning `claimed_elsewhere`;
  - a legacy `claim_hash` row still opening only with its matching cookie;
  - Admin and owner summaries reporting a timestamped account claim as `claimed` without exposing the subject.
- [x] **Step 2: Run the server test to confirm the expected failures.**

Run: `npm test -- src/test/esim-share-server.test.ts`

Expected: new account-bound assertions fail because claim currently binds only to the browser cookie.

- [x] **Step 3: Add migration 075 and implement the minimum server changes.** Add nullable `claimed_by_subject text`; set it atomically from the authenticated user on first claim; compare it on reads; preserve the legacy-cookie branch; count opens only after authorization; derive claimed status from `claimed_at`.
- [x] **Step 4: Run the server test and confirm it passes.**

Run: `npm test -- src/test/esim-share-server.test.ts`

Expected: all server contract cases pass, including the existing owner/revoke/eligibility tests.

- [x] **Step 5: Commit Task 1** with only the migration, server module, and server test.

### Task 2: Recipient, owner, and Admin experience

**Files:**
- Modify: `src/routes/e.$token.tsx`
- Modify: `src/components/customer-auth.tsx`
- Modify: `src/components/esim-share-sheet.tsx`
- Modify: `src/components/admin-esim-share-panel.tsx`
- Modify: `src/lib/esim-share.ts` to add the non-identifying `claimMode: "account" | "browser"` on open views.
- Modify: `src/test/esim-share.test.ts` and create `src/test/esim-share-ui.test.tsx`
- Modify: `PROJECT.md`
- Modify: `src/test/mobile-compact-scale.test.ts` only if the share route is not already listed.

**Interfaces:**
- The route reads `SharedEsimLanding` from the existing loader and reads signed-in state through `useBetterAuthUser()`.
- Extend `CustomerAuth` with an optional button label while preserving its default text and current callback-to-page behavior.
- Keep `SharedEsimLanding` as the shared client-safe state contract; the UI never receives `claimed_by_subject`.
- `SharedEsimView.claimMode` distinguishes only account-bound links from legacy browser-cookie links; it contains no identity.

- [x] **Step 1: Write failing UI tests** for the signed-out preview and auth CTA, signed-in claim action, successful animated open state, cross-account conflict without install data, retryable claim error, mascot tip disclosure, and the changed owner/Admin status copy.
- [x] **Step 2: Run the UI tests to confirm the expected failures.**

Run: `npm test -- src/test/esim-share-ui.test.tsx src/test/esim-share.test.ts`

Expected: the new tests fail because the route currently has no account-aware CTA, mascot interaction, or account-specific messages.

- [x] **Step 3: Implement the compact responsive UI.** Use `/assets/home-hero/mascot-v6.png`; add a tappable Travo tip and accessible disclosure; show sign-in before claim and claim after session resolves; transition to existing install/manual/usage content on success; show safe account-conflict recovery; preserve explicit loading/error/unavailable states; use one-shot `motion/react` transitions with `useReducedMotion`.
- [x] **Step 4: Update owner/Admin copy and architecture docs.** Explain account-bound claiming in the share sheet; describe claim time instead of browser-open status; keep the Admin subject, token, QR, and activation secret private; update the eSIM-sharing section in `PROJECT.md`.
- [x] **Step 5: Run the UI, pure contract, and mobile-scale tests.**

Run: `npm test -- src/test/esim-share-ui.test.tsx src/test/esim-share.test.ts` and `npm test -- src/test/mobile-compact-scale.test.ts -t 'src/routes/e'`

Expected: UI/pure contracts pass; all `/e/` route scale checks pass. The complete mobile-scale suite was also run; two failures remain in unchanged `/my-trips` files and are recorded in the SDD ledger.

- [x] **Step 6: Commit Task 2** with only the recipient, owner/Admin, tests, and architecture documentation changes.

### Task 3: Release verification

**Files:** no additional source changes unless a test/build/review finding requires a test-first fix.

- [ ] **Step 1: Run all relevant focused tests, then the full Vitest suite.** Record any pre-existing failures separately from task regressions.
- [ ] **Step 2: Run `npm run build` and confirm `.output/server/index.mjs` exists.**
- [ ] **Step 3: Review the full diff and verify the release worktree contains no unrelated changes.**
- [ ] **Step 4: Push the approved commits to `main` without force-pushing.** If remote `main` advanced, fetch and integrate it before retrying.
- [ ] **Step 5: Run `scripts/deploy-vps.sh` with the standard migration/build/rollback behavior.** Do not skip migrations or source sync.
- [ ] **Step 6: Verify deployed SHA/artifact, active `djiwatravel.service`, listener `127.0.0.1:3000`, localhost and public share routes, and the migration record separately.**

## Verification and review record

- Customer/owner/Admin surface matrix: see the approved design spec above. Customer QR access is session-owned; owner/Admin lifecycle status uses `claimed_at` without recipient identity.
- Focused session/eSIM server, UI, and helper checks: 40/40 passed. Share-route compact scale: 5/5 passed. Changed-file ESLint passed.
- Full Vitest was attempted and interrupted after approximately 11 minutes. Recorded failures were in unchanged flight search/features, wallet, Admin UI contracts, home event contracts, and two trip mobile-scale checks. The full suite is not claimed green.
- Repository TypeScript has existing failures in unrelated modules. The new route motion optional-prop and test route-mock typing errors were corrected.
- Fresh whole-branch review found a temporary auth outage could appear to be an account mismatch. Added failing tests, then a distinct safe retry state, automatic session recheck, and manual retry; focused checks returned green.
- Deferred minor: owner instructions and generated share messages describe account cross-browser access even for historical cookie-only claims. The recipient view retains accurate legacy-browser instructions and sender recovery.
- Rollback limitation: the prior application cannot open new account-bound claims. Keep migration 075 in place and roll forward to restore those claims; legacy cookie claims remain compatible.
- Rulings: release is explicitly authorized; `claimMode` is a non-identifying enum needed for accurate recipient legacy copy; the two unchanged trip mobile-scale failures remain outside this release.
