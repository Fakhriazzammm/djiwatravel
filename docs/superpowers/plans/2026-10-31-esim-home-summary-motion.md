# eSIM Home Summary Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Ship the approved compact eSIM card treatment with a colored 3D icon that gently floats on Beranda.

**Architecture:** Preserve `EsimHomeSummaryCard` state selection, actions, and data. Add one decorative image component using the already installed Motion React API, plus an optimized public asset and provenance entry.

**Tech Stack:** React, TypeScript, Tailwind CSS, `motion/react`, transparent WebP/PNG.

**Spec:** `docs/superpowers/specs/2026-10-31-esim-home-summary-motion-design.md`

## Global Constraints

- Do not change order selection, quota calculations, status labels, routes, navbar, server modules, or schema.
- Use neutral gray surface tokens; keep semantic status and primary-action colors.
- Animate only the 3D artwork; respect reduced motion.
- Preserve the origin worktree's unrelated untracked files.

## Review Focus

- Empty, active, low, pending, ready, history, and loading card states retain their current behavior.
- A missing or delayed image cannot collapse the artwork slot or obscure accessible text.
- The loop is limited to the illustration and is disabled for reduced-motion preferences.
- Asset format, size, manifest metadata, and public URL match the deployment output.
- Home remains compact at narrow mobile widths, with quota and primary action readable.

---

### Task 1: Add the optimized eSIM artwork

**Files:**

- Create: `public/assets/esim/esim-chip-color-v1.png` (256 × 228 transparent PNG, about 40 KB)
- Modify: `public/assets/esim/ASSET-MANIFEST.md`

- [x] Copy the selected generated colored eSIM artwork into the stable public asset path, preserving transparency.
- [x] Resize it for a 56–64 px UI slot and confirm the output size: 256 × 228, 40,957 bytes, alpha preserved.
- [x] Add source, prompt summary, date, review date, and intended surface to the manifest.

### Task 2: Integrate the artwork and loop into the card

**Files:**

- Modify: `src/components/esim-home-summary-card.tsx`

- [x] Add a fixed-size decorative image slot with intrinsic dimensions, empty alt text, and neutral ring/background.
- [x] Place the image in empty and owned-order headers without overlapping labels, status badges, quota, or actions.
- [x] Use `motion/react` for a slow, small vertical float and slight tilt; use `useReducedMotion` to render it static when requested.
- [x] Set the card to a neutral gray token surface and preserve semantic badges/actions.
- [x] Keep existing data and navigation logic unchanged.

### Task 3: Verify and release

**Files:**

- No additional source files.

- [x] Run `git diff --check` and `npm run build`; confirm fresh `.output/server/index.mjs`.
- [x] Inspect the focused diff, asset dimensions/size, and the clean worktree boundary.
- [ ] Commit the intended files, fast-forward merge to `main`, and push `origin/main`.
- [ ] Deploy with `scripts/deploy-vps.sh` from a clean release worktree and record the deployed revision.
- [ ] Verify the service, representative local/public routes, and public asset identity independently.

**Verification record:** Focused ESLint and Prettier checks passed; `git diff --check` passed; `npm run build` produced `.output/server/index.mjs` (50,449 bytes) and copied the icon (40,957 bytes). The build printed the existing `vite-tsconfig-paths` advisory and `node:crypto` browser externalization notice from unchanged `src/lib/esim-access.ts`.
