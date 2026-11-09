# Japan Tax Refund 2026 Guide Implementation Plan

> **For agentic workers:** This plan is being executed natively in this session. Steps use checkbox syntax.

**Goal:** Publish the approved Indonesian guide to Japan's tax refund system starting November 1, 2026, with an original cover image and crawlable article metadata.

**Architecture:** Add a curated record to the existing `travelGuides` registry; the current guide route, index, sitemap, and `llms.txt` consume that registry. Add the cover image under `public/assets/guides/` and include it in the Article JSON-LD image field.

**Tech Stack:** TanStack Start, React, TypeScript, Vitest, built-in ImageGen.

**Spec:** Approved article draft in the conversation; facts checked against Japan Tourism Agency and Japan Customs sources on 2026-11-09.

## Global Constraints

- Preserve unrelated changes in the primary checkout; work from a clean branch based on `origin/main`.
- Keep the article in Indonesian and preserve the approved factual guidance and official HTTPS sources.
- No database, payment, or provider changes are needed.
- Do not claim Google indexing is guaranteed; make the page discoverable and verify public output.

## Surface Matrix

| Surface | Entry/result | Source of truth | Access and states | Verification |
|---|---|---|---|---|
| Customer | `/panduan` → article route and shareable guide | `src/lib/travel-guides.ts` | Public SSR page; unknown slug returns not found | Guide registry test, build, public article and sitemap |
| Admin | Not applicable: repository has no admin guide editor; guides are curated source content | Git-reviewed guide registry | No customer data or privileged action | Confirmed no guide CRUD route under `src/routes/admin*` |

## Review Focus

- Effective date and purchase-based rule: cover in article and test.
- 90-day departure window and final departure port: cover in article and test.
- Goods must remain available before baggage check; missing an item invalidates refund for its transaction: cover in article and test.
- Consumables cannot be consumed in Japan; keep the special-packaging change clear: cover in article and test.
- Refund method and timing vary by store/provider: cite official source and phrase without promising timing.

---

### Task 1: Pin the article content contract

**Files:**
- Modify: `src/test/travel-guides.test.ts`

- [ ] Add one focused invariant test for the new guide's slug, SEO description, image and official sources, and required travel rules.
- [ ] Run the focused test and confirm it fails because the guide is not in the registry.

### Task 2: Add the guide and cover image

**Files:**
- Modify: `src/lib/travel-guides.ts`
- Modify: `src/routes/panduan.$slug.tsx`
- Create: `public/assets/guides/tax-refund-jepang-2026.jpg`
- Test: `src/test/travel-guides.test.ts`

- [ ] Generate and store an original Djiwa-style Japan travel editorial image with no text or invented logos.
- [ ] Add the approved guide with current dates, concise SEO metadata, steps, related Japan guide, and official HTTPS citations.
- [ ] Add the guide image URL to Article JSON-LD while retaining Open Graph and Twitter image metadata.
- [ ] Run the focused test and confirm the content contract passes.

### Task 3: Verify the published surfaces

**Files:**
- No additional source changes expected.

- [ ] Run the guide test and production build.
- [ ] Inspect built article HTML metadata and verify the guide is emitted by sitemap generation.
- [ ] Check the image dimensions, bytes, and build output references.

### Task 4: Release and prove the live article

**Files:**
- Commit only the guide, test, image, Article schema, and this plan.

- [ ] Commit and push the authorized change to `main`.
- [ ] Deploy using the Djiwa Travel release runbook and confirm the deploy marker and active service.
- [ ] Verify the public article, metadata, sitemap URL, and public image response.
