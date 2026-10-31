# eSIM and after-sales implementation plan

**Goal:** Make device readiness, installation, order recovery and support clearer across customer and admin while preserving payment and provider boundaries.

**Architecture:** Extend existing shared customer components and operational read/action paths. Keep refund execution fail-closed unless a verified provider contract supports it. Preserve existing uncommitted work.

## Surface matrix

| Journey | Customer entry/result | Admin operation | Source and permissions | States and proof |
| --- | --- | --- | --- | --- |
| Device and install | Checkout readiness and eSIM installation instructions | Support team uses the same guidance to troubleshoot; no configurable catalog required | Advisory device checks; no IMEI collection or compatibility guarantee | Incomplete checks and platform differences; focused component tests |
| Order and provisioning | Order status, next action and recovery | Order/provisioning status and authorized retry | Server-owned payment and provider state; owner-scoped customer reads and protected admin actions | Pending, ready, failed and unavailable; focused lifecycle tests |
| Support and refund | Help request and transparent refund availability | Protected support queue and refund decisions | Customer session ownership; provider execution remains disabled until verified | Loading, empty, error and explicit no automatic refund; contract tests |

## Tasks

- [ ] Trace current implementation and existing tests, then improve device readiness, installation and troubleshooting without storing sensitive codes.
- [ ] Improve customer and admin order/provisioning clarity and recovery where existing contracts support it.
- [ ] Improve support and refund clarity and operations without inventing payment-provider capabilities.
- [ ] Run focused tests, full suite and build; review diff and report remaining provider or operational dependencies.
