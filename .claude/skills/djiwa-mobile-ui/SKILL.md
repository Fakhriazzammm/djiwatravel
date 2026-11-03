---
name: djiwa-mobile-ui
description: Build or fix any Djiwa Travel customer page so it feels like a native iOS app on a phone — compact sizes, one scroll region, no oversized or generic AI-looking UI. Use for any new page, redesign, or "too big / compact / padatkan / iOS feel" request.
---

# Djiwa mobile UI (iOS density)

Canonical rules: `DESIGN.md` → **Mobile compact scale**. Read it first; this skill is the working checklist. Also follow `AGENTS.md` (customer + admin delivery, no push/deploy unless asked).

## Quick scale (390×844 target)

- Page: `px-4`, `max-w-md`, `safe-top`, content clears tab bar (`pb-24`/`pb-28`).
- Title `text-[22px] font-bold` + 12px muted subtitle. Never `large-title` on app screens.
- Section label 11px uppercase; row title 14 semibold; body 13; meta 11. Money hero ≤28px.
- Buttons: primary `min-h-10 rounded-xl text-[14px]`, secondary `min-h-9`; chips `min-h-8 text-xs`; search/segmented `min-h-9`.
- Icons: glyph `size-4`; leading tile `size-8 rounded-lg`; illustration `size-9`; header icon button `size-9`.
- Rows: `min-h-12`, `px-3 py-2`, whole row tappable; lists `rounded-2xl`; cards `p-3`.
- Spacing between groups `mt-3`–`mt-4`.
- Sheets/toasts above the tab bar: `mb-[calc(6.5rem+env(safe-area-inset-bottom))]` / `bottom-24`.

## Workflow

1. Open the page and one already-migrated reference (`src/routes/notifications.tsx`, `src/routes/wallet.tsx`).
2. Apply the scale; remove decoration before adding anything. If the screen needs a fixed header, use the notifications pattern (`h-dvh`, header `shrink-0`, inner `min-h-0 flex-1 overflow-y-auto`).
3. Check: first screen shows header + primary action + ≥3 rows of real content; only one scroll region; nothing hidden behind the tab bar; small icon buttons keep a ≥44px hit area.
4. Add the page's files to the list in `src/test/mobile-compact-scale.test.ts`.
5. Run `scripts/djiwa gate`, then report local/commit/push/deploy separately.

## Reject (AI-slop)

Oversized hero text or empty states; emoji or sparkles as icons; gradients outside the brand wallet card; nested cards; heavy shadow or blur on content; several primary buttons per card; subtitles that restate the title; long filler copy. Reversible actions use an undo toast, not a confirm dialog.
