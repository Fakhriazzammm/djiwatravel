import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, connect, getUser } = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  getUser: vi.fn(),
}));
const caseId = "00000000-0000-4000-8000-000000000001";
vi.mock("../db/client.server", () => ({ pool: { query, connect } }));
vi.mock("../lib/customer-session.fn", () => ({ getAuthenticatedUser: getUser }));

import { getCustomerCaseThread, mutateCustomerSupport } from "../lib/customer-support.server";

describe("customer support thread", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getUser.mockResolvedValue({ id: "customer-a" });
  });

  it("returns only customer-visible messages for a case owned by the authenticated customer", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: caseId }] });
    query.mockResolvedValueOnce({
      rows: [
        {
          id: "message-1",
          case_id: caseId,
          author_type: "admin",
          body: "Kami bantu",
          created_at: "2026-01-01",
        },
      ],
    });
    const result = await getCustomerCaseThread(caseId);
    expect(result.messages[0]?.body).toBe("Kami bantu");
    expect(query.mock.calls[0][1]).toEqual([caseId, "customer-a"]);
    expect(query.mock.calls[1][0]).toMatch(/author_type\s+in\s*\('customer',\s*'admin'\)/i);
    expect(query.mock.calls[1][1]).toEqual([caseId, "customer-a"]);
  });

  it("rejects a case that is not owned by the signed-in customer", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(getCustomerCaseThread(caseId)).rejects.toThrow("Support case tidak ditemukan");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("reopens a case when its owner replies so the admin can see it needs attention", async () => {
    const tx = vi.fn(async (sql: string) => {
      if (sql.startsWith("select * from support_cases")) return { rows: [{ id: caseId }] };
      if (sql.startsWith("insert into support_case_messages"))
        return {
          rows: [
            {
              id: "m1",
              case_id: caseId,
              author_type: "customer",
              body: "Masih belum berhasil",
              created_at: "2026-01-01",
            },
          ],
        };
      return { rows: [] };
    });
    connect.mockResolvedValue({ query: tx, release: vi.fn() });
    await mutateCustomerSupport({ action: "reply", case_id: caseId, body: "Masih belum berhasil" });
    const update = tx.mock.calls.find(([sql]) => sql.startsWith("update support_cases"));
    expect(update?.[0]).toMatch(/status\s*=\s*'open'/i);
  });
});
