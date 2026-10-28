# eSIM Access Complete Integration Design

## Intent

Make Djiwa Travel's eSIM Access integration production-complete: catalogue reads, paid provisioning, webhook registration, asynchronous profile retrieval, QR/activation persistence, lifecycle status, usage/expiry updates, retries, and customer-visible readiness must agree with the current eSIM Access API contract.

## Goals

- Keep AccessCode and SecretKey server-only and never commit them to Git or expose them to the browser.
- Match the documented HMAC request contract and current package/order/query fields.
- Expose a public HTTPS webhook at `https://djiwatravel.com/api/webhooks/esim-access/<token>`.
- Accept and safely deduplicate `CHECK_HEALTH`, `ORDER_STATUS`, `ESIM_STATUS`, `SMDP_EVENT`, `DATA_USAGE`, and `VALIDITY_USAGE` events.
- On `ORDER_STATUS/GOT_RESOURCE`, query the allocated profiles by provider `orderNo`, encrypt and persist ICCID/LPA data, and transition the local order to `READY` only when an installable profile exists.
- Reconcile later status, usage, validity, and SM-DP+ events without allowing stale or regressive statuses to overwrite newer state.
- Preserve polling as a recovery path when a provider webhook is delayed or unavailable.
- Register the webhook through eSIM Access's signed `/api/v1/open/webhook/save` API and verify it with `/api/v1/open/webhook/query`.

## Non-goals

- No new payment provider or customer authentication flow.
- No destructive schema cleanup.
- No exposing provider secrets, raw activation codes, or ICCIDs in logs, admin responses, or client JavaScript.
- No provider order or top-up operation without the existing payment/idempotency gates.

## Constraints and assumptions

- Provider production base URL is `https://api.esimaccess.com`; there is no sandbox environment.
- Provider request authentication is HMAC-SHA256 over `RT-Timestamp + RT-RequestID + RT-AccessCode + requestBody`, with the SecretKey as HMAC key.
- Provider data values are bytes and timestamps are UTC.
- eSIM Access allows eight API requests per second; profile query/reconciliation must remain bounded and retry-safe.
- Existing PostgreSQL tables `esim_provisioning_orders`, `esim_profiles`, and `provider_webhook_events` are reused. The current JSON payload column is sufficient for provider-specific fields, so no schema migration is required unless verification finds a missing invariant.
- A separate random `ESIM_ACCESS_WEBHOOK_TOKEN` is preferred over deriving the public URL token from the provider SecretKey.

## Approaches

1. **Minimal webhook patch** — accept provider events and keep the current polling path responsible for profile retrieval. This is low-risk but leaves webhook delivery mostly informational and does not close the asynchronous order gap.
2. **Complete direct API integration (chosen)** — repair the existing signed client, normalize all documented events, make `ORDER_STATUS` trigger the existing provider-query persistence path, update lifecycle/usage state transactionally where possible, add tests, register the webhook through the API, and retain polling as recovery. This fits the current code and avoids introducing an additional service.
3. **MCP-only integration** — move provider reads/writes and webhook registration into the eSIM Access MCP. This would add an external runtime dependency and would not remove the need for Djiwa Travel's own public webhook endpoint, so it is not the primary production path.

## Design decisions

### Provider client

`src/lib/esim-access.ts` remains the server-only boundary. It will support the documented `dataType` package filter, normalize both `obj` and `data` response envelopes, preserve provider error messages, and use explicit timeout/retry behavior only for safe reads. Ordering remains idempotent by the existing transaction ID and is never automatically duplicated.

### Webhook authentication and envelope

The public route continues to be tokenized by path, but the token is independent from the provider SecretKey. The route accepts JSON and form-encoded payloads, handles the provider's health probe, bounds body size, normalizes the six documented event types, and deduplicates primarily by `notifyId` plus `notifyType`. Raw ICCID/EID/activation values are not written to application logs.

### Event processing

- `CHECK_HEALTH`: return a successful health response without creating an order event.
- `ORDER_STATUS/GOT_RESOURCE`: match by provider order number or transaction ID, call the provider query endpoint, persist encrypted profile data, and mark the local order ready when a valid LPA/QR payload is available.
- `ESIM_STATUS` and `SMDP_EVENT`: match by provider order/transaction/ICCID, update provider/profile status using monotonic status rules, and preserve the complete event in the durable provider-event record.
- `DATA_USAGE` and `VALIDITY_USAGE`: store normalized bytes/days/timestamps in the durable provider-event record and update the customer-facing read path without treating missing values as zero.

### Registration and operations

Add a server-side registration command/script that requires explicit environment variables, computes the documented HMAC headers, calls `/api/v1/open/webhook/save`, then reads back `/api/v1/open/webhook/query`. It must print only the configured public URL and redacted success/error metadata. VPS deployment will set the provider credentials and webhook token outside the repository, run the registration once, and verify the public health probe plus a signed test fixture locally.

## Success criteria

- Unit tests cover request signing, response/error normalization, all six webhook event types, duplicate delivery, `ORDER_STATUS` profile retrieval, status monotonicity, and redaction boundaries.
- Production webhook registration read-back returns the Djiwa Travel URL.
- A provider `CHECK_HEALTH` request returns HTTP 200.
- A representative `ORDER_STATUS` fixture causes the profile query/persistence path to run idempotently; no duplicate profile or customer order is created.
- Public routes and service health remain available after deployment, and the auto-deploy SHA matches the pushed Git commit.
