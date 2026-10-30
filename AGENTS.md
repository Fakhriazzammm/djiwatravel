# Djiwa Travel agent instructions

This is the shared entrypoint for Codex, Claude, OpenCode, IDE agents, and
deployment harnesses working in Djiwa Travel. Read it before changing files,
then use the canonical documents below rather than reconstructing the system
from memory:

- `PROJECT.md` — architecture, route/source map, ownership, integrations,
  cross-project contracts, VPS targets, and release runbooks.
- `DESIGN.md` — customer/admin UI, iOS-inspired hierarchy, accessibility,
  interaction, motion, and 3D asset contracts.
- `LESSONS.md` — verified incidents, root causes, safe fixes, and prevention
  rules; append lessons instead of duplicating architecture facts.
- `README.md` — short onboarding, command matrix, and document index.

## Orient before changing

1. Confirm `pwd`, the Git repository, current branch, `git status --short`,
   target app, environment, database, service, VPS, and public origin.
2. Inspect the source route/module and its tests before editing. Source code,
   migrations, environment templates, and deploy scripts outrank inventories
   in documentation; record drift instead of silently inventing facts.
3. Preserve unrelated worktree changes. Keep a requested change narrow and
   report local, committed, pushed, deployed, service, and public boundaries
   separately.

## Boundaries that must not drift

- Djiwa Travel and Djiwa Tentram/Djiwa Pay are separate apps, repositories,
  databases, VPS targets, and release runbooks unless verified for this task.
  Travel production uses `/home/ubuntu/djiwatravel`; Tentram uses
  `/opt/djiwatentramapp`. The central auth/profile contract is served through
  `api.djiwatentram.web.id`; inspect the other repository before changing it.
- Better Auth's verified HttpOnly session is the ownership source. Derive
  `customer_auth_subject` and customer/profile ownership server-side; never
  accept a browser-supplied owner, wallet source, or order owner.
- Djiwa Pay owns wallet balance, ledger, settlement, and Mayar authority.
  Travel may initiate a bounded bridge/top-up flow but must not duplicate the
  wallet ledger or retain payment credentials.
- Server-only credentials, provider tokens, cookies, customer data, and
  database URLs stay out of client bundles, `VITE_` variables, docs, logs,
  screenshots, tests, and commits.

## Change and verify safely

- Follow the route → loader/action/server module → database/provider trace.
  Keep server-only imports in server modules and make webhooks/idempotent jobs
  safe to retry.
- Treat every feature or feature fix as an end-to-end product change. Before
  coding, identify the customer journey (how a customer uses it) and the admin
  journey (how the team enables, configures, monitors, moderates, fulfills, or
  troubleshoots it). Implement and verify both surfaces in the same change;
  do not stop after the customer UI or after an admin CRUD screen works.
- The end-to-end trace must cover customer UI/state, admin UI/state, shared
  server actions/loaders, authorization and ownership, database/migration or
  provider changes, retry/error behavior, focused tests, and release checks.
  A feature is incomplete when either customer use or admin operation cannot
  be completed safely. If one side is genuinely not applicable, record the
  reason, the checked routes/modules, and the verification evidence in the
  handoff and plan/review notes.
- For each feature, write a small surface matrix before implementation:
  customer entry/result, admin entry/control, source of truth, permissions,
  empty/loading/error states, and the test proving the contract. Keep the
  customer and admin behavior consistent when an admin setting changes.
- Use additive, reviewable numbered SQL migrations. Run the local focused
  checks first, then the relevant build/full suite; never treat a known
  baseline failure as a new regression without comparing output.
- For release work, inspect `scripts/deploy-vps.sh`, `scripts/autodeploy.sh`,
  and the target systemd/nginx configuration. Verify source revision, built
  artifact, active service/listener, localhost routes, public routes, and
  rollback boundary separately. Do not push, merge, or deploy unless asked.

When reporting, include the customer/admin surface matrix, changed files,
verification commands and results, known unrelated failures, and whether the
result is local, committed, pushed, deployed, internally healthy, or publicly
reachable.
