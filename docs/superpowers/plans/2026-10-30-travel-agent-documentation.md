# Djiwa Travel Agent Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a coherent documentation system that lets agents understand and safely change Djiwa Travel across apps, projects, auth services, databases, VPS deployments, and product design.

**Architecture:** Use layered documentation with one responsibility per file. `AGENTS.md` owns universal agent rules, `PROJECT.md` owns architecture and boundaries, `DESIGN.md` owns visual/product decisions, `LESSONS.md` owns durable operational learnings, `CLAUDE.md` adapts the same rules for Claude, and `README.md` remains the short human entrypoint.

**Tech Stack:** TanStack Start, Vite, React, TypeScript, Tailwind, PostgreSQL, SQL migrations, Better Auth, Djiwa APIs, Google Calendar, eSIM Access, Mayar, Djiwa Pay bridge, systemd/nginx VPS deployment, GitHub repository.

**Spec:** `docs/superpowers/specs/2026-10-30-travel-agent-documentation-design.md`

## Global Constraints

- Preserve the repository history policy in `AGENTS.md`; never force-push, rebase, amend, or squash published history.
- Treat Djiwa Travel and Djiwa Tentram as separate repositories, apps, databases, VPS targets, and deployment runbooks unless verified otherwise.
- Better Auth session ownership is canonical; derive `customer_auth_subject` from the verified HttpOnly session and never accept ownership from browser input.
- Keep Djiwa Pay wallet, balance, ledger, settlement, and Mayar authority outside Travel's duplicated data model.
- Keep server-only credentials out of browser bundles, `VITE_` variables, docs, logs, commits, and screenshots.
- Document iOS/Apple-inspired hierarchy without copying Apple branding or proprietary assets.
- Use 3D assets as the default for designed visual icon surfaces, with accessible labels and non-image fallbacks for utility controls.
- Report local source, commit, pushed revision, deployed artifact, service health, and public reachability as separate boundaries.

## Review Focus

- Cross-project auth drift: documentation must not imply Travel owns or shares the central Better Auth database; verify the API contract and session subject.
- VPS confusion: Travel's `/home/ubuntu/djiwatravel` target must remain separate from Djiwa Tentram's `/opt/djiwatentramapp` target.
- Secret leakage: examples may name variables but must not contain values, tokens, cookies, or connection strings.
- Stale route/schema claims: route and migration maps must identify source locations and state that source wins when inventories drift.
- Design overreach: 3D icon guidance must preserve accessibility, performance, semantic colors, and clear exceptions for utility controls.

### Task 1: Rewrite the agent entrypoints

**Files:**
- Modify: `AGENTS.md`
- Create: `CLAUDE.md`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-10-30-travel-agent-documentation-design.md`, current repository instructions, scripts, and runbooks.
- Produces: a common orientation and safety contract that points agents to `PROJECT.md`, `DESIGN.md`, `LESSONS.md`, and `README.md`.

- [ ] **Step 1: Preserve the repository history policy and add the agent workflow**

  Document repository identification, status checks, source-of-truth rules, cross-project verification, server/client boundaries, testing, migrations, deployment, and reporting. Keep the policy concise and link deeper facts to `PROJECT.md`.

- [ ] **Step 2: Add the Claude adapter**

  Create a short `CLAUDE.md` that states it follows `AGENTS.md` and links to the canonical project/design/lessons documents; do not duplicate conflicting rules.

- [ ] **Step 3: Verify entrypoint links and secret safety**

  Run:

  ```bash
  rg -n "PROJECT.md|DESIGN.md|LESSONS.md|README.md|api.djiwatentram.web.id|/home/ubuntu/djiwatravel|/opt/djiwatentramapp" AGENTS.md CLAUDE.md
  rg -n "(sk-|AIza|Bearer |DATABASE_URL=postgres|client_secret=)" AGENTS.md CLAUDE.md
  ```

  Expected: all canonical links/boundaries are present and the secret scan returns no credential values.

### Task 2: Create the project architecture map

**Files:**
- Create: `PROJECT.md`

**Interfaces:**
- Consumes: source route tree, `src/routes/README.md`, `package.json`, `.env.example`, migrations, server modules, `scripts/`, current README, and cross-project Djiwa Tentram guidance.
- Produces: source-linked architecture and integration map for future agents.

- [ ] **Step 1: Document system topology and ownership**

  Cover Travel customer/admin surfaces, central Better Auth, Djiwa profile API, Djiwa Pay bridge/wallet boundary, PostgreSQL, provider integrations, Google Calendar, webhooks, scheduled tasks, local runtime, Travel VPS, and the separate Tentram VPS.

- [ ] **Step 2: Document route and module conventions**

  Map route groups from `src/routes/`, server-only module conventions, file-based routing, generated `routeTree.gen.ts`, shared components, test locations, and migration numbering. Link to source directories instead of pretending a static inventory cannot drift.

- [ ] **Step 3: Document operational workflows**

  Include local setup, focused/full verification, safe migration flow, deploy script, auto-deploy, rollback, live checks, and explicit rules for cross-VPS work.

- [ ] **Step 4: Review against source**

  Run:

  ```bash
  rg -n "Better Auth|customer_auth_subject|Djiwa Pay|Google Calendar|eSIM Access|Mayar|VPS|migration|route" PROJECT.md
  test -f PROJECT.md
  ```

  Expected: every major source-backed boundary from the spec has a section and no secret values appear.

### Task 3: Create durable lessons and operational guardrails

**Files:**
- Create: `LESSONS.md`

**Interfaces:**
- Consumes: verified lessons from prior Travel work, current auth/calendar/deploy behavior, migration conventions, and `PROJECT.md` boundaries.
- Produces: a concise append-only-style lesson format future agents can extend without duplicating the architecture map.

- [ ] **Step 1: Define the lesson format**

  Use fields for date/context, symptom, evidence, root cause, safe fix, prevention rule, and verification boundary.

- [ ] **Step 2: Record current lessons**

  Include Better Auth ownership, `redirect_uri_mismatch`/OAuth verification, Google Calendar event sync and date normalization, fire-and-forget server work, trip ownership/delete cascade, safe migrations, admin protected reads, and VPS source/artifact/public verification.

- [ ] **Step 3: Verify lesson safety**

  Ensure lessons contain no tokens, cookies, email secrets, raw customer data, or unverified claims; link code paths and commits only where useful.

### Task 4: Replace the product design document

**Files:**
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: existing Travel brand tokens, current UI components/assets, product routes, user request for iOS/Apple-style UI and 3D icons, accessibility and performance constraints.
- Produces: the canonical design system for customer Travel and admin surfaces.

- [ ] **Step 1: Define principles and visual language**

  Specify calm hierarchy, generous spacing, restrained borders, touch-first controls, brand-red use, semantic colors, typography, elevation, corner radii, and responsive behavior without copying Apple branding.

- [ ] **Step 2: Define layout and component contracts**

  Cover app shell, navigation, cards, sheets, forms, trip timeline, itinerary, budget, checklist, booking, status/empty/error/loading states, admin tables, dialogs, and motion.

- [ ] **Step 3: Define the 3D asset system**

  Specify asset provenance, naming, file formats, transparent backgrounds, material/light/camera consistency, size/performance budgets, icon slots, fallback labels, and when utility icons may use a system glyph for clarity/accessibility.

- [ ] **Step 4: Verify the design document against the product**

  Confirm it references actual surfaces (`/my-trips`, `/profile`, checkout, admin) and does not invent unsupported components or colors.

### Task 5: Refresh the README and perform documentation QA

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `AGENTS.md`, `CLAUDE.md`, `PROJECT.md`, `LESSONS.md`, `DESIGN.md`, existing commands and deploy runbook.
- Produces: a short onboarding page that routes humans and agents to the right canonical document.

- [ ] **Step 1: Add the documentation index**

  Add a project orientation, document map, setup/verification/deploy command matrix, environment safety reminder, and cross-project warning.

- [ ] **Step 2: Remove stale or duplicated claims**

  Keep operational detail only where it helps onboarding; link to `PROJECT.md` for architecture and `DESIGN.md` for UI.

- [ ] **Step 3: Run final documentation QA**

  Run:

  ```bash
  for f in AGENTS.md CLAUDE.md PROJECT.md LESSONS.md DESIGN.md README.md; do test -s "$f"; done
  git diff --check
  rg -n "(sk-|AIza|Bearer |client_secret=|BEGIN PRIVATE KEY|postgresql://[^[:space:]]+:[^[:space:]]+@)" AGENTS.md CLAUDE.md PROJECT.md LESSONS.md DESIGN.md README.md
  git status --short
  ```

  Expected: all six documents exist, whitespace is clean, the secret scan has no matches, and only intended documentation/spec/plan files are changed.

- [ ] **Step 4: Commit the documentation set**

  ```bash
  git add AGENTS.md CLAUDE.md PROJECT.md LESSONS.md DESIGN.md README.md
  git commit -m "docs(travel): establish cross-project agent documentation"
  ```
