# Admin Operations Foundation Design

## Intent

Close the highest-risk customer-to-admin gaps in Djiwa Travel. Admin must be
able to find customers, understand operational trends, respond to support,
retry failed eSIM provisioning, and record a safe refund decision without
inventing an unverified payment-provider refund API.

## Goals

- Make Customers and Analytics real guarded admin workspaces.
- Expose those workspaces, Audit log, and Team in the admin navigation.
- Let an admin reply to a customer support case and move its operational status.
- Let an admin retry a failed provisioning order through the existing server
  provisioning path, preserving idempotency and provider ownership.
- Let an admin approve or reject a refund request as an auditable decision;
  provider execution remains fail-closed until the Mayar contract is verified.

## Non-goals

- No customer identity expansion or raw contact disclosure.
- No duplicate wallet, ledger, settlement, or Mayar authority in Travel.
- No direct browser database access or provider credentials.
- No invented analytics data when the database is unavailable.

## Constraints

- Every action is guarded by `requireAdmin()` and uses a `.fn.ts` browser
  boundary with a `.server.ts` handler.
- Customer-facing results remain sourced from the existing Travel tables and
  customer session contract.
- Existing unrelated worktree changes must remain untouched.

## Approaches

1. Keep all pages read-only: lowest risk, but leaves support and provisioning
   incidents unresolved. Rejected because the selected scope requires admin
   operation, not only visibility.
2. Add minimal audited operations around existing server workflows: recommended.
   This reuses provisioning idempotency, masks customer data, and records
   support/refund actions without adding a second provider system.
3. Build a new admin service and workflow tables: rejected for this batch; it
   would expand ownership and migration risk before the existing gaps close.

## Acceptance

The admin sidebar links to live Customers, Analytics, Audit log, and Team
routes. A customer case can receive an admin reply/status update, a failed
provisioning row can be retried safely, and a refund request can record an
approve/reject decision with actor and reason. Focused tests cover guards,
privacy, action validation, and the customer-visible source-of-truth effects.
