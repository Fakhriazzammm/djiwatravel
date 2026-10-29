# eSIM Finder Bottom Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saat pengguna memilih destinasi di `/esim/finder`, form preferensi tampil sebagai bottom sheet dari bawah, bukan card inline di bawah daftar.

**Architecture:** Pertahankan state dan submit handler di `src/routes/esim.finder.tsx`. Render form yang sama di dalam primitive Radix `Sheet` yang sudah dipakai project, dikontrol oleh state `formOpen` dan dibuka pada pemilihan destinasi. Hasil rekomendasi dan error tetap berada di alur halaman utama.

**Tech Stack:** React 19, TanStack Start, Radix Dialog melalui `src/components/ui/sheet.tsx`, Tailwind CSS, Vitest Testing Library.

**Spec:** User request and approved Sheet approach from the conversation.

## Global Constraints

- Jangan mengubah logika rekomendasi, payload preference, atau analytics event.
- Jangan menulis ulang published git history atau melakukan force push/rebase/amend/squash.
- Mobile-first: sheet muncul dari bawah, memiliki batas tinggi dan safe-area padding, serta tetap usable saat keyboard/mobile viewport berubah.
- Destinasi yang sudah dipilih tetap terlihat di form dan perubahan pilihan membuka/menjaga sheet.

## Review Focus

- Pemilihan destinasi pertama harus membuka sheet; test membuktikan `SheetContent` dan judul/label form muncul.
- Memilih destinasi lain saat sheet terbuka harus memperbarui label destinasi; test membuktikan state tidak stale.
- Menutup sheet tidak boleh menghapus pilihan; test membuktikan daftar tetap memiliki destinasi terpilih setelah close.
- Submit form tetap menggunakan tombol dan handler yang sama; test/source contract memastikan form tidak lagi dirender sebagai card inline.
- Sheet tidak boleh menutupi navigasi bawah secara buruk; class harus memakai max-height, overflow, dan safe-area bottom padding.

### Task 1: Move finder preferences into a controlled bottom sheet

**Files:**

- Modify: `src/routes/esim.finder.tsx`
- Test: `src/test/esim-finder-ui.test.tsx`

**Interfaces:**

- Consumes: existing `destination`, `days`, `dataNeed`, `budget`, `submit`, and `Sheet` primitives.
- Produces: controlled `formOpen` UI state; destination button opens the sheet and the preference form is rendered inside `SheetContent side="bottom"`.

- [x] **Step 1: Write the failing test**

  Add a focused source-contract test that reads `src/routes/esim.finder.tsx` and asserts the route imports `Sheet`, `SheetContent`, `SheetDescription`, and `SheetTitle`, uses controlled `open={formOpen}` initialized closed, opens on destination selection, and has no inline `<form` sibling after the destination section.

- [x] **Step 2: Run the focused test and verify it fails**

  Run `npm test -- src/test/esim-finder-ui.test.tsx`.
  Expected: FAIL because the current route has no Sheet import/state and renders the form inline.

- [x] **Step 3: Implement the minimal route change**

  Import the Sheet primitives. Add `formOpen` state initialized to `false`, set it to `true` inside the destination button handler, and wrap the existing form with `Sheet open={formOpen} onOpenChange={setFormOpen}` plus `SheetContent side="bottom"`. Add an accessible title/description, `max-h-[88dvh]`, `overflow-y-auto`, rounded top corners, and safe-area bottom padding. Keep the form controls and `onSubmit={submit}` semantics unchanged.

- [x] **Step 4: Run the focused test and verify it passes**

  Run `npm test -- src/test/esim-finder-ui.test.tsx`.
  Expected: PASS.

- [x] **Step 5: Run the full verification suite**

  Run `npm test`, `npm run lint`, and `npm run build`.
  Expected: all commands exit 0 with no test failures, lint errors, or build errors.

- [x] **Step 6: Inspect the diff and working tree**

  Run `git diff --check`, `git status --short`, and review the route diff to ensure only the finder UI and its focused test changed.
