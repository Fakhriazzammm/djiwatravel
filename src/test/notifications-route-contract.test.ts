import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("notifications route contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/routes/notifications.tsx"), "utf8");

  it("keeps the customer notification route HTTP-backed and scoped", () => {
    expect(source).toContain('createFileRoute("/notifications")');
    expect(source).toContain("getCustomerNotificationsFeed");
    expect(source).not.toMatch(/fetch\(\s*["'`]\/api\/customer-notifications\?/);
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain("unread_count");
    expect(source).toContain("Belum ada notifikasi");
    expect(source).not.toContain("pool.query");
    expect(source).not.toContain("customer-notifications.server");
    expect(source).not.toContain("ReturnType");
  });
});

describe("notification inbox + admin contract", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("customer inbox exposes archive, delete with undo, read-all and filters", () => {
    const source = read("src/routes/notifications.tsx");
    for (const needle of [
      "read_all",
      "archive",
      "delete",
      "restore",
      "Urungkan",
      "Tandai semua dibaca",
      "Arsip",
    ])
      expect(source).toContain(needle);
  });

  it("server scopes every mutation to the session subject and soft-deletes", () => {
    const source = read("src/lib/customer-notifications.server.ts");
    expect(source).toContain("mutateCustomerNotifications");
    expect(source).toContain("n.recipient_customer_auth_subject=$1");
    expect(source).toContain("deleted_at");
    expect(source).toContain("archived_at");
    expect(read("migrations/036_customer_notification_inbox_state.sql")).toContain("deleted_at");
  });

  it("admin can monitor and revoke with an audited reason", () => {
    const server = read("src/lib/admin-notifications.server.ts");
    expect(server).toContain("requireAdmin");
    expect(server).toContain("recordAdminAction");
    expect(server).toContain("notification.revoke");
    expect(read("src/components/admin-navigation.ts")).toContain("/admin/notifications");
    expect(read("src/routes/admin.notifications.tsx")).toContain("requireAdmin");
  });
});
