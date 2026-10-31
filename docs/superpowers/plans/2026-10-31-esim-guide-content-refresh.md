# eSIM Guide Content Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the eight existing Indonesian eSIM and travel guides genuinely more useful while preserving their URLs and indexability.

**Architecture:** Keep the current data-driven guide renderer and refresh the existing records in `src/lib/travel-guides.ts`. Preserve every slug and add practical, topic-specific explanations, decision criteria, steps, and official references where they support technical claims; update `updatedAt` for revised articles. No new URLs, ranking claims, or product assertions.

**Files:** `src/lib/travel-guides.ts`; this plan file.

## Tasks

- [x] Expand and differentiate the eight guide records; retain slugs, assets, related destinations, and their present rendered structure.
- [x] Confirm official source URLs and remove/avoid time-sensitive device or carrier claims that cannot be safely generalized.
- [x] Review the diff for Indonesian readability, duplication, unsupported promises, link integrity, and preservation of all guide slugs.
- [x] Run focused lint and formatting checks; both pass. A production build was attempted but is blocked by unrelated in-progress Admin modules importing a missing `requireAdmin` export. Tests were not run.
