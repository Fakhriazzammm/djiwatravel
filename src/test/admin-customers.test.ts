import { beforeEach, describe, expect, it, vi } from "vitest";

const pool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/db/client.server", () => ({ pool }));
vi.mock("../db/client.server", () => ({ pool }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("../lib/admin-guard", () => ({ requireAdmin: vi.fn() }));

import { adminCustomersInput, getAdminCustomersHandler } from "@/lib/admin-customers.server";

const row = (patch: Record<string, unknown>) => ({
  subject: "auth-subject-123",
  kind: "member",
  email: "person@example.com",
  whatsapp: "+6281234567890",
  display_name: "Rani Putri",
  profile_complete: true,
  order_count: 2,
  latest_order_at: "2026-11-02T10:00:00Z",
  trip_count: 1,
  feed_post_count: 0,
  last_activity_at: "2026-11-02T10:00:00Z",
  first_seen_at: "2026-10-01T10:00:00Z",
  total: 3,
  ...patch,
});

beforeEach(() => pool.query.mockReset());

describe("Admin customer list", () => {
  it("normalises its input: trimmed search, known filters only, capped paging", () => {
    expect(adminCustomersInput({ q: "  rani  ", kind: "guest", limit: 9999 })).toEqual({
      q: "rani",
      kind: "guest",
      limit: 200,
    });
    expect(adminCustomersInput({ kind: "hack" })).toMatchObject({ kind: "all", limit: 50 });
    expect(adminCustomersInput()).toEqual({ q: "", kind: "all", limit: 50 });
  });

  it("lists members with and without a profile and guests, masked, with no raw subject", async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          row({}),
          row({
            subject: "auth-subject-456",
            email: null,
            whatsapp: null,
            display_name: null,
            profile_complete: false,
            order_count: 0,
            latest_order_at: null,
          }),
          row({
            subject: "guest:abc",
            kind: "guest",
            display_name: null,
            profile_complete: false,
            trip_count: 0,
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: 3, member: 2, guest: 1, no_profile: 1 }] });

    const result = await getAdminCustomersHandler({ data: adminCustomersInput({}) });

    expect(result.total).toBe(3);
    expect(result.counts).toEqual({ all: 3, member: 2, guest: 1, noProfile: 1 });
    expect(result.rows.map((r) => [r.kind, r.profileComplete])).toEqual([
      ["member", true],
      ["member", false],
      ["guest", false],
    ]);
    expect(result.rows[0]).toMatchObject({
      email: "p•••••@example.com",
      displayName: "Rani Putri",
    });
    expect(result.rows[1]).toMatchObject({ email: null, whatsapp: null, latestOrderAt: null });
    expect(result.rows[0]!.ref).toMatch(/^[0-9a-f]{10}$/);
    expect(new Set(result.rows.map((r) => r.ref)).size).toBe(3);
    const text = JSON.stringify(result);
    expect(text).not.toContain("auth-subject");
    expect(text).not.toContain("person@example.com");
    expect(text).not.toContain("+6281234567890");
  });

  it("passes the search, filter and page size as parameters, never into the SQL text", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0, member: 0, guest: 0, no_profile: 0 }] });
    await getAdminCustomersHandler({
      data: adminCustomersInput({ q: "'; drop table x;--", kind: "noprofile", limit: 20 }),
    });
    const [listSql, listParams] = pool.query.mock.calls[0]!;
    expect(listParams).toEqual(["'; drop table x;--", "noprofile", 20]);
    expect(String(listSql)).not.toContain("drop table");
    expect(String(listSql)).toMatch(/customer_profiles/);
    expect(String(listSql)).toMatch(/guest_order_access/);
  });
});
