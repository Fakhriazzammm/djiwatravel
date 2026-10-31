import { beforeEach, describe, expect, it, vi } from "vitest";
const { query, requireAdmin } = vi.hoisted(() => ({ query: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("../db/client.server", () => ({ pool: { query } }));
vi.mock("../lib/admin-guard", () => ({ requireAdmin }));
vi.mock("../lib/admin-guard.server", () => ({ getAdminEmailHandler: vi.fn() }));
import { getAdminSupportThreadHandler } from "../lib/admin-support.server";
const caseId = "00000000-0000-4000-8000-000000000001";
describe("admin support thread", () => {
  beforeEach(() => vi.resetAllMocks());
  it("requires admin before reading and returns the customer-visible conversation", async () => {
    query.mockResolvedValue({
      rows: [
        { id: "m1", author_type: "customer", body: "Butuh bantuan", created_at: "2026-01-01" },
      ],
    });
    const result = await getAdminSupportThreadHandler({ data: { caseId } });
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(result.messages[0]?.body).toBe("Butuh bantuan");
    expect(query.mock.calls[0][0]).toMatch(/author_type\s+in\s*\('customer',\s*'admin'\)/i);
    expect(query.mock.calls[0][1]).toEqual([caseId]);
  });
  it("does not read messages if admin authorization fails", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized"));
    await expect(getAdminSupportThreadHandler({ data: { caseId } })).rejects.toThrow(
      "Unauthorized",
    );
    expect(query).not.toHaveBeenCalled();
  });
});
