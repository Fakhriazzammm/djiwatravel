import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(process.cwd());
describe("Wave 4b customer notification/refund contracts", () => {
  it("migration is additive, rerunnable, and RLS protected", () => {
    const sql = readFileSync(
      resolve(root, "migrations/012_customer_notifications_refunds_wave4.sql"),
      "utf8",
    );
    for (const table of [
      "notification_events",
      "customer_notifications",
      "customer_notification_states",
      "customer_push_subscriptions",
      "notification_delivery_attempts",
      "refund_requests",
      "refund_events",
    ])
      expect(sql).toContain(`create table if not exists public.${table}`);
    expect(sql).toContain("enable row level security");
    expect(sql).not.toMatch(/create policy/i);
  });
  it("refund POST is explicitly fail closed", () => {
    const source = readFileSync(resolve(root, "src/lib/customer-refund.server.ts"), "utf8");
    expect(source).toContain("provider_refund_workflow_unavailable");
    expect(source).not.toMatch(/\binsert\s+into\b|\bupdate\s+[\w.]+\s+set\b|\bdelete\s+from\b/i);
  });
  it("notification reads derive identity and cap page size", () => {
    const source = readFileSync(resolve(root, "src/lib/customer-notifications.server.ts"), "utf8");
    expect(source).toContain("requireBetterAuthUser");
    expect(source).toContain("max(50)");
    expect(source).toContain("endpoint_hash");
  });
});
