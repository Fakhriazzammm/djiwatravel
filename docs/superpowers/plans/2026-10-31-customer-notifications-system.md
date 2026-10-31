# Customer Notifications System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a persisted, owner-scoped customer inbox with unread badge, real order/article/support events, and opt-in browser push with durable retries.

**Architecture:** Reuse `customer_notifications` as the inbox record, `customer_notification_states` for per-user read state, and `customer_push_subscriptions` for opt-in devices. Write notifications and queue push attempts idempotently; a scheduled server task drains attempts through Web Push while `public/sw.js` presents push payloads and safe same-origin navigation.

**Tech Stack:** TanStack Start, React, TypeScript, PostgreSQL via `pg`, numbered SQL migrations, Web Push/VAPID, service worker, systemd oneshot timer.

**Spec:** `docs/superpowers/specs/2026-10-31-customer-notifications-system-design.md`

## Global Constraints

- Derive customer ownership only from the verified Better Auth HttpOnly session; never accept a recipient, owner, email, or order owner from browser input.
- Keep VAPID private key and worker secret in the server environment; never put secrets in a `VITE_` variable, browser bundle, logs, tests, or commits.
- Push is opt-in and requested only after a user gesture; inbox remains usable if permission is denied or push is unavailable.
- Keep the current service worker free of fetch/cache handlers and preserve the `djiwa-notify` message behavior.
- Use an additive, rerunnable PostgreSQL migration and preserve compatibility with the existing notification tables.
- Keep push copy free of customer data, order secrets, activation data, and QR payloads; accept same-origin root-relative click paths only.
- No production migration, VAPID key provisioning, commit, push, or deployment is part of this implementation task.
- Do not add or run automated tests in this task; use focused lint, type/build checks, and source/runtime checks only.

## File Structure

- `migrations/024_customer_notification_delivery.sql` — add idempotency uniqueness and durable delivery scheduling/lease fields after confirming the migration runner and number are free.
- `src/lib/customer-notifications.server.ts` — authenticated list/count/read/read-all, subscription upsert/deactivation, guide inbox materialization, and notification insertion helpers.
- `src/lib/customer-notification-delivery.server.ts` — server-only VAPID sender, queue claim, retry/backoff, expiration cleanup, and guide push fanout.
- `src/lib/customer-notifications.fn.ts` — browser-safe `createServerFn` wrappers where route loaders need authenticated SSR data.
- `src/routes/api.customer-notifications.ts` — validated inbox, read, read-all, push-state, and push-subscription operations.
- `src/routes/api.tasks.notification-delivery.ts` — timing-safe server-only worker endpoint.
- `src/routes/index.tsx` — replace the signed-in account chip with a bell link and unread badge.
- `src/routes/notifications.tsx` — filters, read actions, pagination, push preference, guest sign-in state, and async states.
- `src/lib/travel-guides.ts` — add explicit `notifySubscribers` metadata for newly published guide events.
- `src/lib/guest-orders.server.ts`, `src/lib/member-orders.server.ts`, `src/lib/mayar-settlement.server.ts`, `src/lib/mayar-provisioning.server.ts`, `src/lib/esim-provisioning-refresh.server.ts`, `src/lib/customer-support.server.ts`, and `src/routes/api.webhooks.esim-access.$token.ts` — write idempotent notifications from authoritative state transitions or verified account linking.
- `public/sw.js` — handle Web Push and safe notification clicks while preserving local eSIM messages.
- `scripts/notification-delivery-worker.mjs`, `scripts/systemd/djiwa-notification-delivery.service`, `scripts/systemd/djiwa-notification-delivery.timer`, and `scripts/install-notification-delivery-worker.sh` — run the bounded task endpoint from systemd without exposing secrets in process arguments.
- `.env.example` and `PROJECT.md` — document required server-only VAPID/task variables and operational setup.
- `package.json` and `package-lock.json` — add a maintained Web Push sender only after checking its official documentation and compatibility.

## Review Focus

The user did not request tests; these inputs still require explicit implementation handling and later test coverage if requested:

- A request for another customer's notification ID must not change read state or reveal message data.
- A repeated webhook, worker run, or concurrent request must not create duplicate inbox rows or duplicate sends.
- A worker crash while sending must recover expired leases without losing queued work.
- 404/410 push endpoints must deactivate; transient network/429/5xx failures retry with a cap; permanent failures must stop retrying.
- Denied/unsupported permission, a shared browser endpoint, and sign-out must not silently enable push or cross-deliver between accounts.

---

### Task 1: Extend the notification schema safely

**Files:**
- Create `migrations/024_customer_notification_delivery.sql`
- Inspect `scripts/apply-migrations.sh`, current notification indexes, and production-safe role grants before finalizing SQL.

**Produces:** unique `(event_id, recipient_customer_auth_subject)` notification rows; `next_attempt_at`, `lease_expires_at`, and a bounded-worker claim index for delivery attempts. Keep all changes additive and rerunnable.

- [ ] Confirm 024 is the next unused migration number and verify the migration runner ordering.
- [ ] Add only nullable/defaulted queue fields and compatible indexes; never rewrite migration 012.
- [ ] Verify SQL syntax, RLS/runtime-role behavior, duplicate preconditions, and rollback/forward-fix notes by read-only schema inspection and migration-script review.

### Task 2: Implement authenticated inbox and push subscription operations

**Files:**
- Modify `src/lib/customer-notifications.server.ts`
- Create `src/lib/customer-notifications.fn.ts`
- Modify `src/routes/api.customer-notifications.ts`

**Interfaces:**
- `listCustomerNotifications(input)` returns `{ notifications, unread_count, next_cursor }` scoped to `getAuthenticatedUser().id`.
- `markCustomerNotificationRead(id)` and `markAllCustomerNotificationsRead()` return `{ ok: true }` and only affect that session subject.
- `registerCustomerPushSubscription(input)` and `deactivateCustomerPushSubscription(input)` validate endpoint/keys and bind the endpoint to the current subject.
- `getCustomerPushPublicKey()` returns only the configured public VAPID key.
- `createCustomerNotification(tx, input)` accepts an authoritative event key/type, recipient subject, safe copy, and validated same-origin action path; it inserts one inbox row and queues push attempts atomically.

- [ ] Add schemas for unread filtering, read-all, push state, VAPID public key, and bounded cursor/page size.
- [ ] Enforce per-subject ownership on every read/write and prevent an endpoint hash from remaining active for multiple account subjects.
- [ ] Preserve `Cache-Control: no-store`; never return endpoint hashes, endpoints, keys, or provider errors.

### Task 3: Connect order, support, and guide events to the inbox

**Files:**
- Modify the authoritative order/support modules listed in File Structure.
- Modify `src/lib/travel-guides.ts` and `src/lib/customer-notifications.server.ts` for bounded recent-guide materialization.

**Interfaces:**
- `createCustomerNotification(tx, input)` from Task 2 is the only notification write path.
- `notifyOrderTransition(orderId, status, eventKey)` loads recipient and safe display fields from the database; it ignores unlinked guest orders.
- `notifySupportReceipt(supportCaseId)` derives subject and display URL from the inserted support case.

- [ ] Emit notification events for authenticated order create/link, payment confirmed, eSIM ready, actionable provisioning failure, and expiration where the authoritative transition is written.
- [ ] Keep repeated settlement/webhook/recovery runs idempotent and avoid alerting on non-transition metadata updates.
- [ ] On inbox reads, materialize real guides published in the last 30 days for the verified subject without sending historical push.
- [ ] For a new guide with `notifySubscribers: true`, create one event per subject and queue attempts only for active opted-in subscriptions; current registry entries remain historical-only.
- [ ] Emit a support-request acknowledgement only after the support case insert succeeds.
- [ ] Ensure links use existing customer routes and contain no guest access tokens or activation data.

### Task 4: Add Web Push sender and durable worker

**Files:**
- Create `src/lib/customer-notification-delivery.server.ts`
- Create `src/routes/api.tasks.notification-delivery.ts`
- Create `scripts/notification-delivery-worker.mjs`
- Create systemd service/timer and installer under `scripts/`
- Add VAPID sender dependency and server-only environment names.

**Interfaces:**
- `drainCustomerNotificationDelivery({ batchSize, now })` claims a bounded batch and returns safe counts `{ sent, retried, deactivated, failed }`.
- The worker API accepts POST only, rejects origin/referer headers, verifies a timing-safe configured task secret, and returns safe counts only.
- `push` payload contains only `{ title, body, url }` with a validated root-relative path.

- [ ] Check official Web Push sender docs and current Node compatibility before selecting/adding the package.
- [ ] Implement VAPID initialization from server environment; missing config disables push sending without breaking inbox writes.
- [ ] Claim queue rows with PostgreSQL locking and recover expired `SENDING` leases.
- [ ] Apply bounded retry/backoff for network/429/5xx, terminal handling for permanent errors, and deactivation for 404/410.
- [ ] Implement a systemd timer using `/etc/djiwatravel.env`; do not expose secrets in process arguments or logs.
- [ ] Record worker liveness using the existing heartbeat contract and keep error summaries redacted.

### Task 5: Extend the service worker and customer experience

**Files:**
- Modify `public/sw.js`
- Modify `src/routes/index.tsx`
- Modify `src/routes/notifications.tsx`

**Interfaces:**
- Header badge refetches the authenticated unread count on navigation/focus and links to `/notifications`.
- Push controls query permission/subscription state, subscribe/unsubscribe only after explicit user action, and call the authenticated API.
- Inbox supports all/unread filters, read-one/read-all, load-more, safe internal action navigation, and user-facing unsupported/denied/retry states.

- [ ] Replace the account chip with a 44px bell control for signed-in users; keep guest auth and the bottom Profile tab.
- [ ] Show the unread badge capped at `9+` and provide a matching accessible label.
- [ ] Fix inbox loading so authenticated SSR/client routing uses the safe `.fn.ts` boundary rather than direct server imports or a server-relative fetch.
- [ ] Mark notifications read before following their same-origin action links and add a reliable read-all action.
- [ ] Add push opt-in status and controls; keep the inbox usable if permission or sender configuration is unavailable.
- [ ] Add `push` event display and same-origin `notificationclick` routing without changing the existing `djiwa-notify` handler or adding caching.

### Task 6: Document runtime configuration and perform focused verification

**Files:**
- Modify `.env.example` and `PROJECT.md`
- Build output is generated and must not be committed.

- [ ] Document server-only `DJIWA_NOTIFICATION_VAPID_PUBLIC_KEY`, `DJIWA_NOTIFICATION_VAPID_PRIVATE_KEY`, and `DJIWA_NOTIFICATION_TASK_SECRET`; include no values.
- [ ] Document the explicit worker timer installer and the production setup steps without running them on the VPS.
- [ ] Run focused ESLint on changed TypeScript files and `git diff --check`.
- [ ] Run `npm run build` and confirm `.output/server/index.mjs` is fresh.
- [ ] Inspect the final diff to confirm no other untracked/dirty files were staged or overwritten.
- [ ] Do not commit, push, configure production secrets, enable systemd timers, migrate production, or deploy unless requested.
