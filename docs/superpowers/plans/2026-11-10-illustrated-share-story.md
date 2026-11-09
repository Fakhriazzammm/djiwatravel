# Illustrated share Story — approved design 4

Implement the approved single-image, compact illustrated poster, including the three final copy revisions. Work in the current checkout to retain the user's existing share work; preserve unrelated AI changes. Local implementation only: no commit, push, deployment, production database, or service changes.

## Surface matrix

| Surface              | Entry / result                                                                                                                                 | Source and permission                                                                                                                                                                                                                                             | Empty / error / proof                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer itinerary   | My Trips share sheet, AI Travo's existing share sheet, public `/share/$handle/$token` → one 1080×1920 PNG                                      | Refresh the existing token-scoped public `getSharedTrip` on every export; dates, names, categories, notes and times come from that response. No expenses, booking references, documents or private profile fields.                                                | Empty itinerary remains exportable; revoked links fail; oversized agendas fail explicitly instead of dropping activities. Tests prove one image across days, latest source data, complete rows and readable bounds. |
| Customer other cards | eSIM, guides, affiliate, flight shortlist → illustrated brand PNG                                                                              | Existing link/product data and permissions. Shared renderer, no new product promises or prices.                                                                                                                                                                   | Existing share loading/error/retry UI. Test brand output and refreshed attribution.                                                                                                                                 |
| Identity / time      | Owner label is `(public first name) · Member Djiwa Travel`; generator attribution is the current session's display first name, or `Pengunjung` | Existing Better Auth session read, presentation only; never accept ownership from image input. Timestamp created during every render, displayed in Asia/Jakarta with seconds and WIB.                                                                             | Guests and session-read failures must not be attributed to the trip owner. Test distinct owner/generator and repeat exports.                                                                                        |
| Admin                | Existing `admin.customers`, trip/support and `admin-trip-assistant-panel.tsx` remain read/control surfaces                                     | No new configurable setting, provider, persistence or authorization. Client image composition is not an Admin operation; Admin parity is therefore not applicable. AI customer share already uses `ShareTripSheet`; admin AI creates no alternate share renderer. | Inspect these modules and run existing tests. No database migration needed.                                                                                                                                         |

## Implementation

1. Add failing behavioral tests for one-image grouping, compact metadata, attribution freshness/guest identity, overflow, and fresh token reads on repeated exports.
2. Add a text-free Tokyo illustration derived from approved art, neutral destination fallback, local licensed serif font and asset provenance. Tokyo art only applies to Tokyo; other trips retain their own destination imagery or neutral art. No AI service call at export time.
3. Replace the old per-day pagination with measured one-image layout. Preserve all activity titles and compact location/category/duration/hour metadata; suppress missing-data boilerplate. Normalize notes and shorten only their optional descriptive preview. Do not silently truncate activity lists or titles. Adapt hero and fonts within a readable lower bound; report excess data explicitly.
4. Share the footer across all renderers: slogan above `djiwatravel.com`; below the URL, automatic-generation description, generator and current date/time. Public owner labels retain `Member Djiwa Travel`.
5. Route public-page exports through `tripStoryImages` as My Trips/AI already do, so exported data is refreshed rather than captured at page load. Keep exact shared links in native sharing; no need to print long tokens on artwork.
6. Run focused tests, targeted lint/types, project gate/build and full tests. Render real PNGs locally with browser canvas through a script (no hosted preview or production change); inspect final example and another destination/long/empty case. Record baseline failures separately.

## Delivered and verified

- Updated `src/lib/share-card.ts`: single-image measured itinerary composition and matching brand cards; complete agenda titles; compact optional descriptive previews; category, duration, location and opening hours; existing notes parser retained. Oversized lists fail explicitly. The header boundary also handles a valid 120-character wide trip name, covered by a regression test and an actual Chrome canvas export.
- Added `src/lib/share-card-attribution.ts`: public owner and current image generator stay distinct; no email fallback; first-name attribution, guest/member fallback and fresh Asia/Jakarta timestamp with seconds. Font caching does not cache member identity or date.
- Updated `src/lib/trip-share-image.ts` and `src/routes/share.$token.tsx`: public and My Trips/AI image exports use the same fresh token read. Trip years and traveler counts are retained. The handle route delegates to this same public component. Revoked shares are not exported from old page data.
- Updated `src/components/social-share.tsx`: actionable one-image capacity errors can be retried; existing native-share and download paths remain in place.
- Assets and license: `public/assets/share/`; original logo and Travo reused. Tokyo art is limited to Tokyo; neutral illustration is used for brand posters and as destination fallback. No runtime AI generation API or database migration.
- Tests: `src/test/share-card.test.ts`, `src/test/trip-share-image.test.ts`; corrected the existing `src/test/my-trips-sharing.test.ts` fixture to include the already-existing public-name query and assert the first-name handle. No server query or ownership behavior changed for this fixture repair.
- `.gitignore` excludes local `artifacts/share-story/` exports, which can contain public member display names. All unrelated concurrent AI/Admin work remains outside this change.

### Results

| Check | Result |
| --- | --- |
| `npm run build` after `npm ci --include=optional --ignore-scripts --no-audit --no-fund` | **Passed**, exit 0; `.output/server/index.mjs` and both illustration assets plus the local font present in `.output/public/assets/share/`. Missing optional jsPDF dependency `canvg` was an environment issue; restoring the lockfile-installed tree fixed it. `package.json` and `package-lock.json` unchanged; installed versions match the lockfile. |
| Targeted `npx eslint` on the eight changed TS/TSX files | **0 errors**, two existing route-export Fast Refresh warnings in `share.$token.tsx`. |
| Final `npx vitest related --run … --maxWorkers=4` | **92 passed, 2 failed** across 15 files. Both remaining failures are in unchanged `flight-features-ui.test.tsx`: Admin-hidden banner/bell/eSIM, and saving a signed-in member's watch target. Share-card, fresh-token, sharing permissions, dialogs, guide share and AI-related checks passed. |
| Full suite run | **1761 passed, 7 failed, 63 skipped**. Failure files were `admin-ui-contract`, `deployment-build-output`, `flight-features-ui`, `home-esim-events`, `my-trips-sharing`, `trip-overview-ui`. The subsequent public-name mock-fixture repair made `my-trips-sharing` pass in fresh focused and related runs. The full suite is not reported as green. |
| `npx tsc --noEmit` | Whole repo remains red outside the changed files: Admin loading/customer/support/login/profile, existing eSIM webhook/package-copy modules, and existing deployment/webhook/persistence/travel-UI tests. **No diagnostics on any of the eight changed TS/TSX files**. |
| `node scripts/djiwa.mjs gate …` | Lint and changed-file TypeScript passed; related-test stage was red. The final related run above supersedes its intermediate test output, but the gate is not claimed green. |
| Real browser canvas (offline, no app server) | Exported and inspected `tokyo-implemented.png`, `singapore-implemented.png`, `empty-implemented.png`, `long-title-implemented.png`, and `brand-implemented.png` in local `artifacts/share-story/`. Each itinerary yields exactly **one 1080×1920 PNG**; fonts/illustrations/logo/mascot load from local project assets. |
| `git diff --check` | Passed. |

The code-review finding about long-header/agenda overlap was reproduced with a
failing test, fixed by enforcing the measured minimum agenda position, and
verified with passing tests and a real canvas export.

Release boundary: **local source and local production build only**. Not
committed, pushed, deployed, or production-service/public-route verified. No
VPS/database/service changes and no new Admin operation or setting.
