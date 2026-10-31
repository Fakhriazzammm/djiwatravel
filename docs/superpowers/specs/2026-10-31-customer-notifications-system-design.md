# Customer Notifications System Design

## Intent

Replace the signed-in customer chip in the home header with a notification bell that opens `/notifications`. Build a durable customer inbox and opt-in browser push so customers can follow real order, travel-guide, and support updates while the site is open or closed.

The project already has a notification page, an authenticated read API, read-state storage, push-subscription storage, delivery-attempt storage, and a root-scoped service worker. The missing pieces are event producers, unread badge and push controls, actual Web Push delivery, and a retry worker. Extend those foundations instead of creating a second notification system.

## Goals

- Show a labelled bell with an unread count for signed-in customers in the home header; clicking it opens `/notifications`.
- Keep the Profile tab as the profile entry point. Guests retain the existing sign-in action; the inbox explains sign-in when a guest opens it.
- Show real, persisted notifications in Indonesian for order lifecycle changes, newly published travel guides, and support-request receipt.
- Support read/unread state, an unread filter, a mark-all-read action, pagination, and clear loading, empty, error, and retry states.
- Let a customer explicitly enable or disable browser push from the inbox. Explain unsupported browsers and denied permission without blocking inbox use.
- Deliver privacy-conscious Web Push through the existing service worker, with safe internal navigation, durable attempt tracking, bounded retry, and expired-subscription cleanup.
- Use only the authenticated Better Auth subject for inbox ownership. Guest orders become eligible only after the existing verified order-claim flow links them to an account.
- Keep push content free of QR codes, activation codes, email, phone, or other order/customer secrets.

## Non-goals

- Email, SMS, WhatsApp, wallet, or payment-provider notifications.
- Browser push before the customer opts in.
- Fabricated/demo notifications or notifications for orders that are not linked to the signed-in customer.
- A general campaign-management console or cross-project notification service.
- Changing Djiwa Pay, central Better Auth, or the existing ownership contract.

## Approaches

1. **Inbox only:** complete the persisted inbox and order/article event producers, without browser push. This is the smallest scope and fits the current storage, but it does not notify a customer while the site is closed.
2. **Inbox plus opt-in browser push — selected:** add Web Push registration and delivery to the same persisted event stream, using the existing `public/sw.js`, subscription table, and delivery-attempt table. It adds VAPID configuration and a scheduled retry worker, while the inbox remains the reliable record if delivery is unavailable.
3. **Client-only notifications:** synthesize messages in the page and use the Notification API directly. This cannot reliably deliver while the site is closed and would duplicate the existing inbox state, so it does not meet the request.

The user selected approach 2, including browser push while the page is closed.

## Current source and constraints

- Home header: `src/routes/index.tsx`; only authenticated users currently see the selected account chip. `src/components/shell.tsx` keeps Profile in the bottom tab bar.
- Inbox page and API: `src/routes/notifications.tsx` and `src/routes/api.customer-notifications.ts`.
- Server read/read-state and push registration: `src/lib/customer-notifications.server.ts`. It derives the Better Auth subject server-side and caps page size at 50.
- Existing database foundation: migration `012_customer_notifications_refunds_wave4.sql` creates `notification_events`, `customer_notifications`, `customer_notification_states`, `customer_push_subscriptions`, and `notification_delivery_attempts`. RLS is enabled without policies; runtime role access must be verified before relying on the tables.
- Existing service worker: `public/sw.js` handles app messages and notification clicks but has no `push` event handler. Keep its no-cache/no-fetch behavior.
- Order source transitions include payment settlement in `src/lib/mayar-settlement.server.ts`, provisioning failures in `src/lib/mayar-provisioning.server.ts`, and eSIM readiness/failure in `src/lib/esim-provisioning-refresh.server.ts` and `src/routes/api.webhooks.esim-access.$token.ts`.
- New-order creation is guest-first in `src/lib/guest-orders.server.ts`; verified account linking is in `src/lib/member-orders.server.ts`. Never infer ownership from an email or browser-supplied subject.
- Guide content is the static registry in `src/lib/travel-guides.ts`, including `publishedAt`. New guide publication is a source change, not a CMS event.
- PostgreSQL migrations are numbered and applied by `scripts/apply-migrations.sh`; the current migration inventory reaches 023, with historical duplicate numbers. Use the next verified unused number after checking the runner and target schema.
- No Web Push sender or VAPID configuration was found. Production service environment is `/etc/djiwatravel.env`. The repository has no notification-delivery timer; a new worker trigger must be shipped and enabled as part of the operational setup.

## User flows

### Home and inbox

1. A signed-in user sees a 44px-minimum icon button with a bell and an unread badge (cap the displayed value at `9+`). Its accessible name includes the unread count and it links to `/notifications`.
2. The inbox shows newest first, with type label, title, summary, full date/time, read state, and an internal action link when available.
3. Opening a notification action marks it read before navigation. Users can also mark one or all as read and filter unread items.
4. The inbox initially reconciles current linked orders and currently published guides into real rows, so existing customers do not start with an empty inbox merely because event writers are new. This one-time reconciliation is idempotent and does not send historical push.
5. For an unauthenticated visitor, `/notifications` presents a sign-in action and a brief explanation; it does not query or reveal customer notification data.

### Push preference

1. The inbox presents a clear “Aktifkan notifikasi browser” control and a plain explanation of what can appear on the device.
2. Ask for permission only after an explicit click. Register or reuse `/sw.js`, subscribe with the public VAPID key, and send the endpoint and required keys to the authenticated API.
3. Disabling push calls `unsubscribe()` and deactivates the matching server subscription. Failed registration leaves in-app notifications working and displays a retryable explanation.
4. On browsers that require an installed PWA, explain that requirement. Do not repeatedly request denied permission.

### Notification production and delivery

- **Order:** emit an idempotent in-app notification after a verified account order is created/claimed, payment is confirmed, eSIM provisioning becomes ready, or provisioning reaches a customer-actionable failure/expiry. A repeated webhook or retry must not create duplicate rows or pushes. For a guest order, defer account notification until verified claim; do not search recipients by email.
- **Travel guide:** make the guide registry the publication source. When a guide is newly added, create one publication event, create inbox rows for known recipients, and queue push attempts for active opted-in subscriptions. On the first deployment, seed existing guides as historical inbox items without sending a push burst. A new guide is eligible for push only after this baseline.
- **Support:** after a support request is durably created for the authenticated subject, add one acknowledgement with a link to `/support`. Do not invent status updates until an authoritative support-status writer is identified.
- **Delivery:** write event, recipient notification, and push attempts atomically. A scheduled worker claims a bounded batch, sends Web Push, records success/failure, deactivates subscriptions rejected as expired, and retries transient errors with capped exponential backoff. The in-app row is never rolled back when push fails.
- Push title/body are concise and generic (for example, “Status pesanan diperbarui”); the notification click opens a same-origin route such as `/notifications`, `/support`, or the owning order page.

### Recipient discovery for guide notifications

Better Auth user discovery is outside the Travel database, so do not enumerate or copy the central user directory. On an authenticated inbox read, materialize the currently published guides from the last 30 days for that one verified subject as historical inbox items; this does not send push. For a newly added guide, the guide registry includes an explicit `notifySubscribers` publication flag. The worker creates idempotent per-subject inbox rows and push attempts for active subscriptions only. Existing guides omit the flag, preventing a first-deploy push burst. Inbox-only recipients are discovered when they open the inbox; push recipients are discovered through their opted-in subscriptions.

## Architecture and data contract

- Keep `customer_notifications` as the canonical inbox row and `customer_notification_states` as per-customer read state.
- Keep `notification_events.event_key` as the idempotency key. Use stable keys derived from the authoritative order/support event or guide slug plus publication version.
- Add an additive migration for the unique `(event_id, recipient_customer_auth_subject)` key and delivery-queue fields/indexes needed for `next_attempt_at`, lease recovery, and bounded claim. Preserve the old columns and API behavior during rollout.
- In `customer-notifications.server.ts`, centralize validated event insertion, list/count pagination, mark-one/all-read, push subscription upsert/deactivation, and push-status reads. Every customer path obtains the Better Auth user server-side.
- Add a server-only Web Push sender. The private VAPID key stays in `/etc/djiwatravel.env`; the public key is returned through a safe authenticated/public-key API response. Never log endpoints, keys, raw push payloads, or provider responses that can contain subscription URLs.
- Extend `public/sw.js` with `push` and `notificationclick` handling. Validate click targets as same-origin root-relative URLs and retain the existing message event for eSIM-ready local alerts.
- Add an authenticated task route and a bounded drain function for new-article fanout and pending/retry push attempts. Protect the task route with a timing-safe server-only secret, reject browser-originated requests, and record a worker heartbeat.
- Add a systemd oneshot/timer pair that calls the task route on a short interval using an environment file, without placing secrets in command-line arguments. Installation must be explicit and idempotent. The interval and service environment must be verified on the VPS during release.
- Suggested delivery states: `PENDING`, `SENDING`, `SENT`, `RETRY`, and `GAVE_UP`. Recover expired `SENDING` leases. Retry network errors and 429/5xx responses with a capped schedule; deactivate a 404/410 subscription; treat other permanent 4xx responses as terminal. Bound batch size and per-run duration.
- The existing `customer_push_subscriptions` table can contain multiple devices per user. On registration, ensure one endpoint cannot remain active for two different account subjects on a shared browser.

## Migration and rollout contract

- Database: PostgreSQL via the Travel `pg` pool; numbered SQL runner. Existing app and new app versions may overlap during a deployment.
- Preflight: inspect active migration tracking, existing notification row counts/indexes, runtime role grants/RLS bypass behavior, and production backup/restore policy. Row counts and role behavior are currently unknown and must be verified before execution.
- Expand: add nullable/defaulted delivery fields and compatible uniqueness/indexes first. Do not rewrite migration 012 or remove its columns.
- Deploy code: read old rows safely; event creation and delivery must be retryable and idempotent. Seed existing guide/order notices in bounded batches with no historical push.
- Operational setup: provide VAPID public/private keys and a task secret through the server environment; enable the notification worker timer only after a read-back health check. Do not commit any generated key.
- Recovery: failed migrations stop before code swap; failed push sends remain queued or move to `GAVE_UP` with a safe reason. Roll back app code if needed while keeping the additive schema. Do not promise schema rollback after new rows exist; use a forward fix.
- Stop conditions: migration error or unexpected lock/latency, worker backlog rising without progress, or notification API returning ownership/permission errors. Reconciliation compares event key counts to inbox rows and pending/retry/sent attempt counts.

## Security, privacy, and accessibility

- The only recipient identity is `getAuthenticatedUser().id`; never accept owner IDs, emails, order owner, or recipient from request JSON.
- Every order event loads ownership/status from the database and writes only for `customer_auth_subject`.
- Validate type, title/body length, event key, internal route, push endpoint, and subscription key shapes. Reject external click URLs and cross-owner read attempts.
- Do not expose push endpoints or cryptographic keys in customer API reads. Use `Cache-Control: no-store` for account data.
- Pair badge color with a numeric/accessibility label. Keep touch targets at least 44px, visible focus, reduced-motion-safe feedback, and useful states for unsupported, denied, empty, and failed delivery.

## Verification plan

- Focused tests for notification event idempotency, cross-owner denial, initial order/guide reconciliation, order state transitions, read-one/read-all, unread filters/count, cursor pagination, subscription enable/disable, shared-endpoint ownership, and worker retry/expiry/dead-letter behavior.
- Service-worker tests for push payload fallback and safe same-origin click routing while preserving the existing `djiwa-notify` message flow.
- UI tests for header badge and destination, guest sign-in state, inbox filters/actions, push permission states, and retry/error/empty states.
- Local PostgreSQL migration verification and runtime-role read/write checks; do not use SQLite assumptions.
- Build and focused tests before release. For a later authorized release, verify migration ledger, VAPID/task env presence without printing values, timer active/next run, worker heartbeat, localhost/public routes, public bundle identity, opt-in flow, and a controlled test push to a consenting test subscription.
- No production database, push permission, commit, push, or deployment is included in this design approval step.
