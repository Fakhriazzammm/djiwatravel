# eSIM Access Complete Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align Djiwa Travel's eSIM Access client and webhook lifecycle with the current provider contract, register the production webhook safely, and verify profile delivery end to end.

**Architecture:** Keep the existing server-only eSIM Access client and PostgreSQL persistence. Extract provider envelope normalization and registration signing into focused server modules; make the webhook route accept all documented event types, use the existing provider-query refresh path for `ORDER_STATUS`, and preserve polling as recovery.

**Tech Stack:** TypeScript, TanStack Start file routes, Node `crypto`/`fetch`, Drizzle PostgreSQL, Vitest, systemd auto-deploy.

**Spec:** `docs/superpowers/specs/2026-10-29-esim-access-complete-integration-design.md`

## Global Constraints

- Never put `ESIM_ACCESS_CODE`, `ESIM_ACCESS_SECRET_KEY`, or `ESIM_ACCESS_WEBHOOK_TOKEN` in source, client bundles, committed `.env` files, or logs.
- Use `https://api.esimaccess.com` and the documented HMAC string `timestamp + requestId + accessCode + requestBody`.
- Treat provider bytes as bytes and provider timestamps as UTC.
- Preserve idempotency and the eight-requests-per-second provider limit.
- Keep polling available as a recovery path.
- Do not create a second customer order or provider order for a webhook retry.

## Review Focus

- `CHECK_HEALTH` must return success during provider registration without creating a fake order event — covered in webhook normalization/route tests.
- `ORDER_STATUS` has no ICCID and must trigger a provider profile query — covered in webhook processing tests.
- `ESIM_STATUS` and `SMDP_EVENT` can arrive out of order — covered in monotonic status tests.
- `DATA_USAGE` and `VALIDITY_USAGE` may omit optional fields and must not become zeroes — covered in normalization tests.
- Provider errors may use `errorMessage`, `errorMsg`, or `obj/data` envelopes — covered in client response tests.

### Task 1: Provider contract normalization

**Files:**

- Modify: `src/lib/esim-access.ts`
- Test: `src/test/esim-access.test.ts`

**Interfaces:**

- Preserve `queryEsimAccessPackages` and server provisioning APIs.
- Add the optional documented `dataType` query field and a shared response/error normalization path.

- [ ] Write failing tests for `dataType`, `errorMessage`, `errorMsg`, and `obj/data` response envelopes.
- [ ] Run the focused test and verify it fails for the missing contract behavior.
- [ ] Implement the minimal client changes, including bounded safe-read retry only where existing callers can tolerate it.
- [ ] Run the focused test and verify it passes.
- [ ] Commit the client change.

### Task 2: Webhook event contract and status mapping

**Files:**

- Modify: `src/lib/esim-access-webhooks.ts`
- Create/modify: `src/test/esim-access-webhooks.test.ts`
- Modify: `src/routes/api.webhooks.esim-access.$token.ts`

**Interfaces:**

- Export a normalized provider event type that retains documented identifiers and usage/status fields while redacting secrets.
- Map `GOT_RESOURCE`, `UNUSED_EXPIRED`, and `USED_EXPIRED` into the local lifecycle without regressing newer states.

- [ ] Write failing tests for all six event types, documented fields, `GOT_RESOURCE`, and duplicate identity.
- [ ] Run the focused test and verify the expected failures.
- [ ] Implement normalization, `CHECK_HEALTH` handling, body limits, separate webhook token validation, and durable dedupe behavior.
- [ ] Run focused webhook tests and verify they pass.
- [ ] Commit the webhook contract change.

### Task 3: Profile retrieval and lifecycle processing

**Files:**

- Modify: `src/lib/esim-provisioning-refresh.server.ts`
- Modify: `src/lib/esim-profile-protection.ts`
- Modify: `src/routes/api.webhooks.esim-access.$token.ts`
- Test: `src/test/esim-provisioning-refresh.test.ts`

**Interfaces:**

- Use the existing `refreshTravelOrderProvisioning(orderId, { force: true })` path for `ORDER_STATUS` profile retrieval.
- Persist `esimTranNo`, encrypted LPA/activation data, expiry, and provider payload without exposing plaintext.

- [ ] Write failing tests for matching a webhook by provider order/transaction, querying allocated profiles, and idempotently transitioning to `READY`.
- [ ] Run the focused test and verify it fails before the processing hook exists.
- [ ] Implement event-to-order resolution and invoke the existing refresh path for `ORDER_STATUS/GOT_RESOURCE`; update later status and usage records safely.
- [ ] Run focused provisioning tests and the existing eSIM lifecycle tests.
- [ ] Commit the lifecycle change.

### Task 4: Webhook registration command

**Files:**

- Create: `scripts/register-esim-access-webhook.mjs`
- Create/modify: `src/test/esim-access-webhook-registration.test.ts`
- Modify: `README.md`

**Interfaces:**

- Command inputs: `ESIM_ACCESS_CODE`, `ESIM_ACCESS_SECRET_KEY`, `ESIM_ACCESS_WEBHOOK_TOKEN`, `PUBLIC_BASE_URL`.
- Command writes only to eSIM Access `/api/v1/open/webhook/save`, then reads `/api/v1/open/webhook/query`; output is redacted.

- [ ] Write failing tests for exact HMAC headers, URL construction, and secret-free output.
- [ ] Run the focused test and verify the expected failures.
- [ ] Implement the script using Node built-ins and explicit nonzero exit behavior.
- [ ] Run the focused test and a dry-run/invalid-env check.
- [ ] Commit the registration tooling and operator instructions.

### Task 5: Full verification and release

**Files:**

- No source changes expected unless verification finds a concrete defect.

- [ ] Run the full Vitest suite.
- [ ] Run `git diff --check` and production build.
- [ ] Set server-only environment variables on the VPS without printing values.
- [ ] Register the webhook and read back the configured URL.
- [ ] Verify public `CHECK_HEALTH` response and service health.
- [ ] Push the verified commit to `main`; let the VPS auto-deploy.
- [ ] Verify deployed SHA, service state, public routes, webhook health, and a representative provider-event fixture.
