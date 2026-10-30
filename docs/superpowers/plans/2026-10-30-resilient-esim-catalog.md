# Resilient eSIM Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep all package-backed live countries visible while refreshing package data from eSIMAccess.

**Architecture:** Extend the existing reseller catalog cache with a persistent production snapshot and an error fallback to the last valid global snapshot. Browse reads may use stale data during provider outages; checkout fresh reads remain strict.

**Tech Stack:** TypeScript, Vitest, TanStack Start server runtime, atomic JSON file store, existing VPS deploy script.

**Spec:** `docs/superpowers/specs/2026-10-30-resilient-esim-catalog-design.md`

## Global Constraints

- Snapshot is server-only and stored with permission `0600`.
- The `.data` snapshot survives `.output` atomic swaps.
- No new destination is shown unless it has provider package coverage.
- Fresh checkout reads remain provider-backed.

## Review Focus

- Provider failure after the 15-minute stale window: browse still uses the last valid snapshot.
- Provider recovery: one refresh updates the snapshot and subsequent reads use fresh data.
- Fresh package checkout during provider failure: still fails closed rather than using stale data.
- Missing/corrupt snapshot: existing seed fallback remains safe.
- Deploy swap: `.data` is not removed by source or output sync.

### Task 1: Resilient cache fallback

**Files:**
- Modify: `src/lib/reseller-catalog-cache.ts`
- Test: `src/test/reseller-catalog-cache.test.ts`

- [ ] Add a failing test proving an old global snapshot is returned with `stale: true` when the provider refresh fails.
- [ ] Implement last-valid-entry fallback only for non-fresh catalog reads.
- [ ] Preserve strict provider behavior for `getResellerPackage(..., { fresh: true })`.
- [ ] Run the focused cache test.

### Task 2: Production snapshot path

**Files:**
- Modify: `src/lib/reseller-catalog-file-store.server.ts`
- Test: `src/test/reseller-catalog-file-store.test.ts`

- [ ] Add a test for the production default path selection without exposing the file publicly.
- [ ] Enable the existing file store by default in production at `.data/reseller-catalog.json`, while honoring `RESELLER_CATALOG_CACHE_FILE`.
- [ ] Keep atomic writes and `0600` permissions.
- [ ] Run cache and file-store tests.

### Task 3: Verification and release

**Files:**
- No application source changes.

- [ ] Run focused catalog tests and build.
- [ ] Deploy using `scripts/deploy-vps.sh`.
- [ ] Verify `/esim/finder` contains live countries and updated region labels after a provider timeout-safe read.
- [ ] Verify destination route and all deploy-script routes remain healthy.
