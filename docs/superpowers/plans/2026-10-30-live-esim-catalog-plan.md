# Live eSIM Country Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project every valid live eSIMAccess country into the customer catalog and show its live packages.

**Architecture:** Keep eSIMAccess as the package source of truth. Add a pure projection helper that merges live location codes with local metadata and use it in the server destination-list path; existing destination routes already query the live reseller catalog.

**Tech Stack:** TypeScript, TanStack Start server loaders, Vitest, existing reseller catalog cache.

**Spec:** `docs/superpowers/specs/2026-10-30-live-esim-catalog-design.md`

## Global Constraints

- Only recommendable, sellable provider packages may create destinations.
- Unknown country codes use neutral fallback metadata and must not invent names or flags.
- Degraded provider reads retain the existing seeded storefront.
- Do not duplicate provider credentials, prices, or package records in the browser.

## Review Focus

- A new provider country code must be listed and routeable — test projection and list integration.
- Multiple packages/codes must deduplicate destinations — test unique stable output.
- Regional bundles must not turn every member into a false standalone package — preserve existing route filtering.
- Provider failure/empty catalog must preserve the seed list — retain and run fallback tests.
- Unknown metadata must remain neutral and safe — test code/name/flag/region fallback.

---

### Task 1: Dynamic destination projection

**Files:**
- Modify: `src/lib/destination-availability.ts`
- Modify: `src/lib/destination-availability.server.ts`
- Test: `src/test/destination-availability.test.ts`

**Interfaces:**
- Produces `destinationsForCatalog(packages, availability)` and dynamic `listableDestinations` output for the Finder.

- [ ] **Step 1: Write the failing tests** for an unknown live code (e.g. `DE`) producing fallback metadata, duplicate package codes producing one destination, and preserving known metadata.
- [ ] **Step 2: Run the focused test and verify it fails because live unknown destinations are not projected.**
- [ ] **Step 3: Implement the pure projection and use it from the server list path, while preserving degraded fallback and regional entries.**
- [ ] **Step 4: Run `npm test -- --run src/test/destination-availability.test.ts` and verify it passes.**
- [ ] **Step 5: Commit the projection change.**

### Task 2: Regression verification

**Files:**
- Test: `src/test/esim-access-catalog.test.ts`
- Test: `src/test/reseller-catalog-view.test.ts`

**Interfaces:** Consumes the existing live package normalization and destination filtering APIs.

- [ ] **Step 1: Add/adjust a regression assertion that a valid package for a previously unknown country remains recommendable and filterable by that projected country.**
- [ ] **Step 2: Run the focused catalog/view tests and verify they pass.**
- [ ] **Step 3: Run the full test suite and production build; record unrelated failures separately.**
- [ ] **Step 4: Commit tests and verification fixes.**
