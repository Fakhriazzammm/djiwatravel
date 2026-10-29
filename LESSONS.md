# Djiwa Travel lessons

This file is append-only in spirit. Add a new entry when an incident or
verification produces a reusable rule. Do not store credentials, cookies,
customer identifiers, raw payloads, or copied production logs here.

## Entry format

Use this structure for each new lesson:

```text
### YYYY-MM-DD — short context
- Symptom: what was observed.
- Evidence: source path, test, command, or safe status/error category.
- Root cause: the smallest verified explanation.
- Safe fix: the bounded change that resolved it.
- Prevention rule: what future agents must do first.
- Verification boundary: what was proven, and what remains unproven.
```

## Verified lessons

### 2026-10-30 — ownership comes from Better Auth

- Symptom: a customer-owned query or cross-app wallet flow can appear to work
  while using a browser-provided identifier.
- Evidence: `customer_auth_subject` predicates in
  `src/lib/my-trips.server.ts`, `src/lib/customer-support.server.ts`, and the
  session helpers in `src/lib/customer-session.server.ts`.
- Root cause: Travel data and the central Better Auth identity are separate
  boundaries; request fields are not proof of ownership.
- Safe fix: derive the subject from the verified HttpOnly Better Auth session,
  resolve the canonical profile/source server-side, and fail closed when the
  contract is unavailable.
- Prevention rule: never accept `userId`, owner, wallet source, or order owner
  from browser input; test both authenticated and mismatched-owner cases.
- Verification boundary: source-level ownership predicates and focused tests
  prove the application contract; they do not prove the live auth service is
  healthy without a live check.

### 2026-10-30 — OAuth redirect and verification are separate failures

- Symptom: Google Calendar can show `redirect_uri_mismatch`, or later show
  `access_denied` because the OAuth app is still in testing/unverified state.
- Evidence: callback/connect routes in `src/routes/api.google-calendar.*.ts`
  and the server configuration in `src/lib/google-calendar.server.ts`.
- Root cause: Google requires the exact callback URI to be registered, while
  OAuth consent/testing rules separately control which accounts can authorize.
- Safe fix: compare the generated callback URI character-for-character with
  the provider configuration; keep authorized test users/verification status
  correct for the selected OAuth mode. Never work around this by weakening
  redirect validation.
- Prevention rule: verify configuration and consent/testing state before
  debugging tokens or Calendar event payloads.
- Verification boundary: a successful callback proves authorization for that
  account and redirect; it does not prove every future user can authorize.

### 2026-10-30 — Calendar dates must preserve the trip timezone

- Symptom: an activity appears on the wrong day or at the wrong local time in
  Google Calendar even though it exists in the Travel itinerary.
- Evidence: Calendar adapter `src/lib/google-calendar.server.ts`, Calendar API
  routes, and migration `migrations/019_google_calendar_sync.sql`.
- Root cause: converting a date-only/local itinerary value through UTC before
  constructing the event changes its calendar day or time zone.
- Safe fix: normalize the activity date/time with the trip timezone, send
  explicit `timeZone` values, persist the provider event identity/status, and
  make retries idempotent.
- Prevention rule: add a boundary test for Asia/Jakarta and overnight
  itineraries whenever date parsing or event construction changes.
- Verification boundary: focused adapter tests prove normalization and request
  shape; only a live Calendar read-back proves the user-visible event exists.

### 2026-10-30 — Do not hide durable work behind fire-and-forget

- Symptom: the UI reports that a trip/activity was saved, but a related sync,
  notification, or provider operation fails after the response has returned.
- Evidence: async server functions and sync status handling in
  `src/lib/my-trips.server.ts`, `src/lib/google-calendar.server.ts`, and the
  Calendar status/sync routes.
- Root cause: unawaited work has no request-level error boundary and may be
  terminated with the process or leave no durable retry record.
- Safe fix: await user-critical writes; for asynchronous provider work, persist
  a pending/outbox state, expose retryable status, and log a redacted error.
- Prevention rule: every fire-and-forget operation must have a durable state,
  retry policy, and an observable failure path.
- Verification boundary: unit/route tests prove state transitions; a worker or
  production health check is needed to prove eventual delivery.

### 2026-10-30 — Trip delete must be owner-scoped and cascade deliberately

- Symptom: an existing trip detail page fails to load, or deleting a trip
  leaves activities, checklist items, bookings, budgets, or expenses behind.
- Evidence: owner predicates and delete ordering in
  `src/lib/my-trips.server.ts`, customer routes under `src/routes/my-trips*`,
  and migration `migrations/018_my_trips.sql`.
- Root cause: a trip ID alone is not authorization, and related records may not
  have database cascades or explicit application cleanup.
- Safe fix: require the authenticated subject in every read/update/delete and
  use verified foreign-key cascade or a transaction that removes dependents.
- Prevention rule: test direct URL access, wrong-owner access, successful
  deletion, and absence of dependent records after deletion.
- Verification boundary: focused route/database tests prove local behavior;
  production data deletion requires an explicit backup/rollback decision.

### 2026-10-30 — Applied migrations are additive and tracked

- Symptom: a deploy works against one database but fails on another, or a
  rollback leaves application code incompatible with the schema.
- Evidence: numbered files in `migrations/`, tracking logic in
  `scripts/apply-migrations.sh`, and deployment ordering in
  `scripts/deploy-vps.sh`.
- Root cause: schema state is environment-specific and published migrations
  cannot safely be rewritten.
- Safe fix: add a new numbered migration, apply it before code that requires
  it, keep old and new code compatible during rollout, and back up/inspect
  state before destructive work.
- Prevention rule: never edit an applied migration; use additive expand/verify/
  contract phases and record the pending migration set.
- Verification boundary: local migration application proves syntax and order;
  only the target database confirms production state.

### 2026-10-30 — Protected admin reads need explicit error states

- Symptom: an admin page remains on a skeleton or reports empty data when the
  protected read actually failed.
- Evidence: `src/lib/admin-read-model.server.ts`, admin guards, and admin route
  loaders under `src/routes/admin.*.tsx`.
- Root cause: `null`/loading state can mask a rejected protected request or an
  expired session.
- Safe fix: distinguish loading, ready, empty, and error states; keep the
  protected session/header boundary server-side and show a retryable message.
- Prevention rule: never interpret a failed protected read as an empty dataset;
  add an error-path test for each new admin read surface.
- Verification boundary: route tests prove state rendering; a live admin
  session check is required for deployed authorization behavior.

### 2026-10-30 — Source, artifact, service, and public checks are different

- Symptom: a public HTTP 200 is reported as a successful release while the
  wrong bundle, service, database, or route is active.
- Evidence: release phases and checks in `scripts/deploy-vps.sh`; Travel target
  is `/home/ubuntu/djiwatravel`, `djiwatravel.service`, and `127.0.0.1:3000`.
- Root cause: HTTP reachability does not identify the deployed revision or
  prove authenticated data and migrations.
- Safe fix: verify commit/artifact marker, active systemd service/listener,
  localhost routes, public routes/assets, and rollback backup independently.
- Prevention rule: report local, committed, pushed, deployed, internally
  healthy, and publicly reachable as separate states.
- Verification boundary: a deploy command can prove its own checks only for the
  target it reached; it does not prove the separate Djiwa Tentram VPS.
