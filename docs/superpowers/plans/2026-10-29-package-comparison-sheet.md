# Package Comparison Sheet Implementation Plan

> **For agentic workers:** inline implementation plan for the accepted comparison-sheet design.

**Goal:** Open package comparisons in an animated bottom sheet without scrolling the eSIM catalog.

**Architecture:** Keep selection state on the destination route. Replace the in-page comparison section and scroll CTA with the existing Radix-backed `Sheet`, keeping selected packages removable and checkout links available.

**Tech Stack:** React, TanStack Router, existing `Sheet` UI component, Tailwind CSS.

**Spec:** User approved the previously proposed bottom-sheet flow for package comparison.

## Global Constraints

- Preserve the current maximum of three selected packages.
- Keep catalog position unchanged when opening or closing comparison.
- Reuse existing theme tokens and package labels.

## Review Focus

- Removing the final package closes the sheet and hides the sticky action.
- Escape and backdrop interaction close the sheet through Radix Dialog.
- Narrow screens retain access to all compared columns via horizontal scrolling.

---

### Task 1: Replace inline comparison with a sheet

**Files:**

- Modify: `src/routes/destination.$code.tsx`

- [x] Add controlled comparison sheet state and move the existing comparison table into bottom-sheet content.
- [x] Add per-package removal actions and a clear-selection action.
- [x] Change the sticky CTA to open the sheet; remove `scrollIntoView` and the inline comparison section.
- [x] Build the application and inspect the final diff.
