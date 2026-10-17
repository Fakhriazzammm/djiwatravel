import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("notifications route contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/routes/notifications.tsx"), "utf8");

  it("keeps the customer notification route HTTP-backed and scoped", () => {
    expect(source).toContain('createFileRoute("/notifications")');
    expect(source).toContain("/api/customer-notifications?limit=50&unreadOnly=false");
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain("unread_count");
    expect(source).toContain("Belum ada notifikasi");
    expect(source).not.toContain("pool.query");
    expect(source).not.toContain("customer-notifications.server");
    expect(source).not.toContain("ReturnType");
  });
});
