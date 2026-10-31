# Djiwa Travel agent documentation design

## Intent

Make this repository understandable and safe for Codex, OpenCode, Claude,
IDE agents, and deployment harnesses without requiring them to reconstruct the
system from scattered source files. The documentation must describe Djiwa
Travel as one product inside a wider Djiwa system, while keeping ownership and
runtime boundaries explicit.

The documentation set will be:

- `AGENTS.md`: operational rules for every coding agent.
- `CLAUDE.md`: Claude-specific entrypoint that points to the same canonical
  project rules without creating a conflicting second policy.
- `PROJECT.md`: architecture, product domains, route map, data model, runtime
  boundaries, integrations, and deployment topology.
- `LESSONS.md`: durable lessons from incidents, migrations, auth, payments,
  deployment, and testing; each lesson includes evidence and a prevention
  rule.
- `DESIGN.md`: product and UI system for the customer travel experience and
  admin surfaces.
- `README.md`: concise onboarding and links to the canonical documents.

## Goals

1. Let an agent identify the active repository, app, environment, database,
   VPS, domain, and deployment service before making changes.
2. Explain cross-project contracts with Djiwa Tentram/Djiwa Pay, especially the
   central Better Auth session, customer profile/source identity, wallet
   boundary, and API ownership.
3. Explain cross-app behavior inside Djiwa Travel: customer routes, admin
   routes, server functions, webhooks, scheduled tasks, provider adapters, and
   shared UI modules.
4. Make production safety enforceable: server-only secrets, ownership-scoped
   queries, additive migrations, idempotent webhooks, deploy verification,
   rollback, and honest distinction between source, artifact, service health,
   and public reachability.
5. Define an iOS-inspired visual language with calm hierarchy, touch-first
   layouts, semantic states, motion rules, accessibility, and 3D icon assets.

## Non-goals

- Do not merge the Djiwa Travel database into Djiwa Tentram/Supabase.
- Do not redefine Better Auth or the canonical customer profile API here.
- Do not claim a cross-project VPS, domain, or service is shared without live
  verification.
- Do not replace source-of-truth code, generated route trees, migrations, or
  environment files with duplicated documentation inventories.
- Do not require every page to use a 3D illustration where a small status icon,
  text label, or accessibility affordance is clearer.

## Current system boundary to document

### Djiwa Travel repository

- TanStack Start, Vite, React, TypeScript, Tailwind, and file-based routes.
- PostgreSQL accessed by server-only modules and numbered SQL migrations.
- Customer journeys: explore, catalog, finder, checkout, orders, eSIM status,
  profile, support, notifications, wallet top-up, and My Trips.
- Admin journeys: catalog, orders, provisioning, finance, refunds, support,
  team, settings, audit, analytics, and readiness.
- Integrations: central Better Auth, Djiwa customer profile, Djiwa Pay
  customer-wallet/bridge, Mayar, eSIM Access, Google Calendar, AI gateway,
  and provider/webhook workflows.

### Cross-project Djiwa boundary

- Canonical Better Auth/session and customer identity are external contracts
  served by `api.djiwatentram.web.id`.
- Travel derives `customer_auth_subject` from the verified HttpOnly session;
  browser input must never select an owner, wallet source, or order owner.
- Travel resolves the canonical customer `source_id` server-side through the
  customer profile contract before calling wallet/top-up boundaries.
- Djiwa Pay owns wallet balance, ledger, settlement, and Mayar authority;
  Travel only initiates a bounded top-up flow and must not duplicate those
  records.
- Djiwa Tentram and Djiwa Travel may use different repositories, apps,
  databases, VPS hosts, domains, package managers, and deploy services. An
  agent must inspect the target project's `AGENTS.md` and runbook rather than
  carrying infrastructure assumptions across projects.

### VPS and release boundary

The Travel production target currently documented by the repository is:

- checkout: `/home/ubuntu/djiwatravel`
- service: `djiwatravel.service`
- local listener: `127.0.0.1:3000`
- public origin: `https://djiwatravel.com`
- release flow: build, sync source and migrations, apply pending migrations,
  upload `.output`, atomic swap, restart, localhost route checks, public route
  checks, asset check, and rollback on failure.

This is a Travel-specific boundary. The Djiwa Tentram repo documents a
different canonical target (`/opt/djiwatentramapp`, `*.djiwatentram.web.id`,
and its connected `djiwa-vps` host). The two must never be conflated.

## Design system direction

`DESIGN.md` will cover both customer and admin surfaces, with a priority order:

1. content and action clarity;
2. calm Apple-inspired hierarchy and spacing;
3. touch ergonomics and responsive behavior;
4. meaningful state feedback and accessibility;
5. decorative 3D assets where they improve recognition or emotional quality.

The visual system will use existing Djiwa Travel brand tokens and preserve
semantic colors for success, warning, danger, finance, and provider states. It
will not copy Apple logos, proprietary screens, or branded assets.

3D icon guidance will specify:

- one coherent material, lighting, camera, scale, and shadow language;
- transparent-background assets with stable filenames and provenance;
- reusable icon slots with accessible text labels and non-image fallbacks;
- rules for hero illustrations, empty states, feature cards, and action icons;
- asset review for size, contrast, performance, mobile rendering, and license;
- no flat/basic placeholder icon when a documented 3D asset is required.

## Agent workflow direction

Every document will use the same workflow vocabulary:

1. orient: read instructions, inspect status, identify app/environment;
2. trace: follow route → loader/action → server module → database/provider;
3. change: keep scope narrow and preserve unrelated worktree changes;
4. verify: run focused tests, build, and relevant live checks;
5. release: push only when requested, deploy only to a verified target;
6. report: state local, committed, pushed, deployed, service, and public
   boundaries separately.

The documentation will distinguish authoritative facts from inferred or stale
inventory and require agents to verify drift-prone details from source or the
live target.

## Approaches considered

### 1. Separate short files with duplicated summaries

Fast to start, but it would cause AGENTS, CLAUDE, README, and PROJECT to drift.
Rejected because cross-project auth and VPS boundaries need one consistent
source of truth.

### 2. One large handbook only

Complete but poor for agent routing: every harness would need to load a large
file, and design guidance would be mixed with deployment safety. Rejected for
slow progressive disclosure.

### 3. Layered canonical documentation — selected

Use `AGENTS.md` for rules, `PROJECT.md` for architecture, `DESIGN.md` for UI,
`LESSONS.md` for durable operational knowledge, `CLAUDE.md` as a thin adapter,
and `README.md` as the human entrypoint. This keeps each file focused while
cross-linking them and makes the system easier for agents to load progressively.

## Deliverables after approval

- Rewrite `AGENTS.md` while preserving the repository history policy.
- Create `CLAUDE.md`, `PROJECT.md`, and `LESSONS.md`.
- Rewrite `DESIGN.md` for the actual Travel product and requested 3D/iOS
  direction.
- Update `README.md` with a concise orientation and command matrix.
- Add links and maintenance rules so future changes update the correct source
  document instead of appending contradictory notes.
- Verify links, formatting, route/migration references, and repository status.

## Open decision

The documentation blueprint is ready for implementation. The remaining call is
whether the proposed 3D asset rule should be a strict product requirement for
all newly designed visual icon surfaces, or a strong default with documented
exceptions for utility controls and accessibility fallbacks.
