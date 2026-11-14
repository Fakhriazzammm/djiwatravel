import { beforeEach, describe, expect, it, vi } from "vitest";

const pool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/db/client.server", () => ({ pool }));
vi.mock("../db/client.server", () => ({ pool }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("../lib/admin-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("../lib/admin-guard.server", () => ({
  getAdminEmailHandler: async () => "ops@djiwa.test",
}));

import {
  adminCustomerDetailInput,
  adminCustomersInput,
  getAdminCustomerDetailHandler,
  getAdminCustomersHandler,
} from "@/lib/admin-customers.server";

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

  it("lists members with and without a profile and guests, with full contact details", async () => {
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
    // Contacts are shown whole (the Admin chose not to mask them).
    expect(result.rows[0]).toMatchObject({
      id: "auth-subject-123",
      email: "person@example.com",
      whatsapp: "+6281234567890",
      displayName: "Rani Putri",
    });
    expect(result.rows[1]).toMatchObject({ email: null, whatsapp: null, latestOrderAt: null });
    expect(result.rows[0]!.ref).toMatch(/^[0-9a-f]{10}$/);
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

const empty = { rows: [] };

describe("Admin customer detail", () => {
  it("returns every stored fact about a member and records that the page was opened", async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            display_name: "Rani Putri",
            email: "person@example.com",
            whatsapp: "+6281234567890",
            nationality: "ID",
            date_of_birth: "1995-04-02",
            gender: "female",
            created_at: "2026-10-01T10:00:00Z",
            updated_at: "2026-11-01T10:00:00Z",
          },
        ],
      }) // profile
      .mockResolvedValueOnce({
        rows: [
          {
            id: "o1",
            public_order_code: "B06552D2",
            status: "READY",
            total: "15000",
            currency_code: "IDR",
            paid_at: "2026-10-30T15:34:14Z",
            created_at: "2026-10-30T15:32:57Z",
            items: "Japan 1GB 7Days × 1",
          },
        ],
      }) // orders
      .mockResolvedValueOnce({
        rows: [
          {
            name: "Perth 3 hari",
            destination_name: "Australia",
            departure: "2026-11-15",
            return_date: "2026-11-17",
            archived: false,
            created_at: "2026-11-10T09:55:00Z",
          },
        ],
      }) // trips
      .mockResolvedValueOnce({
        rows: [
          {
            public_code: "TB-1",
            status: "PAID",
            total_idr: 250000,
            recipient_name: "Rani",
            recipient_whatsapp: "+6281200000000",
            city: "Bandung",
            created_at: "2026-11-05T09:00:00Z",
          },
        ],
      }) // shopping
      .mockResolvedValueOnce({
        rows: [
          {
            id: "p1",
            kind: "tips",
            status: "PUBLISHED",
            excerpt: "Datang pagi",
            created_at: "2026-11-11T09:00:00Z",
          },
        ],
      }) // feed posts
      .mockResolvedValueOnce({ rows: [{ comments: 1, likes: 2 }] }) // social
      .mockResolvedValueOnce({
        rows: [
          {
            purpose: "community",
            granted: true,
            created_at: "2026-11-14T09:00:00Z",
            source: "prompt",
          },
        ],
      }) // consents
      .mockResolvedValueOnce(empty) // contact fallback
      .mockResolvedValueOnce(empty); // audit insert

    const detail = await getAdminCustomerDetailHandler({
      data: adminCustomerDetailInput({ id: "auth-subject-123" }),
    });

    expect(detail).toMatchObject({
      id: "auth-subject-123",
      kind: "member",
      displayName: "Rani Putri",
      email: "person@example.com",
      whatsapp: "+6281234567890",
      profile: { nationality: "ID", dateOfBirth: "1995-04-02", gender: "female" },
      orders: [{ code: "B06552D2", status: "READY", total: "15000", items: "Japan 1GB 7Days × 1" }],
      trips: [{ name: "Perth 3 hari", destination: "Australia", archived: false }],
      shopping: [{ code: "TB-1", recipientWhatsapp: "+6281200000000", city: "Bandung" }],
      feeds: { comments: 1, likes: 2, posts: [{ kind: "tips", status: "PUBLISHED" }] },
      consents: [{ purpose: "community", granted: true, source: "prompt" }],
    });
    const audit = pool.query.mock.calls.at(-1)!;
    expect(String(audit[0])).toMatch(/admin_audit_logs/);
    expect(audit[1][2]).toContain("ops@djiwa.test");
    // The audit row identifies the customer by hash, never by the raw account id.
    expect(JSON.stringify(audit[1])).not.toContain("auth-subject-123");
  });

  it("falls back to the contact left on an order when the member has no profile", async () => {
    pool.query
      .mockResolvedValueOnce(empty) // profile
      .mockResolvedValueOnce({
        rows: [
          {
            id: "o1",
            status: "READY",
            total: "1",
            currency_code: "IDR",
            created_at: "2026-10-30T00:00:00Z",
          },
        ],
      })
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce({ rows: [{ comments: 0, likes: 0 }] })
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce({ rows: [{ email: "buyer@example.com", whatsapp: "+6281" }] })
      .mockResolvedValueOnce(empty);
    const detail = await getAdminCustomerDetailHandler({ data: { id: "member-x" } });
    expect(detail).toMatchObject({ email: "buyer@example.com", whatsapp: "+6281", profile: null });
  });

  it("opens a guest by the hash of their e-mail and returns null for an unknown id", async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "o9",
            status: "READY",
            total: "15000",
            currency_code: "IDR",
            created_at: "2026-10-30T00:00:00Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ email: "tamu@example.com", whatsapp: "+6282" }] })
      .mockResolvedValueOnce(empty);
    const guest = await getAdminCustomerDetailHandler({ data: { id: "guest:deadbeef" } });
    expect(guest).toMatchObject({ kind: "guest", email: "tamu@example.com", trips: [] });
    expect(pool.query.mock.calls[0]![1]).toEqual(["deadbeef"]);

    pool.query.mockReset();
    pool.query.mockResolvedValueOnce(empty).mockResolvedValueOnce(empty);
    expect(await getAdminCustomerDetailHandler({ data: { id: "guest:nobody" } })).toBeNull();

    pool.query.mockReset();
    for (let i = 0; i < 8; i++)
      pool.query.mockResolvedValueOnce(i === 5 ? { rows: [{ comments: 0, likes: 0 }] } : empty);
    expect(await getAdminCustomerDetailHandler({ data: { id: "nobody" } })).toBeNull();
    expect(await getAdminCustomerDetailHandler({ data: { id: "" } })).toBeNull();
  });
});
