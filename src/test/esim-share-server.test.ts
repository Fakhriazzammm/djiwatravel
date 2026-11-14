import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@/db/client.server";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminEmailHandler } from "@/lib/admin-guard.server";
import { readStoredUsageForOrders } from "@/lib/esim-stored-usage.server";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import {
  claimSharedEsimHandler,
  createEsimShareLinkHandler,
  getAdminEsimShareStateHandler,
  getEsimShareStateHandler,
  loadSharedEsim,
  revokeAdminEsimShareHandler,
  revokeEsimShareLinkHandler,
} from "@/lib/esim-share.server";

vi.mock("@/db/client.server", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("@/lib/customer-session.fn", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin-guard.server", () => ({ getAdminEmailHandler: vi.fn() }));
vi.mock("@/lib/esim-stored-usage.server", () => ({ readStoredUsageForOrders: vi.fn() }));
vi.mock("@/lib/esim-secret-crypto", () => ({
  encryptEsimSecret: vi.fn((value: string) => `enc:${value}`),
  decryptEsimSecret: vi.fn((value: string) => value.replace(/^enc:/, "")),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
}));

const query = vi.mocked(pool.query);
const connect = vi.mocked(pool.connect);
const authenticate = vi.mocked(getAuthenticatedUser);
const adminGuard = vi.mocked(requireAdmin);
const adminEmail = vi.mocked(getAdminEmailHandler);
const storedUsage = vi.mocked(readStoredUsageForOrders);
const readCookie = vi.mocked(getCookie);
const writeCookie = vi.mocked(setCookie);

const ownerId = "better-auth-owner";
const recipientId = "better-auth-recipient";
const otherRecipientId = "different-recipient";
const orderId = "11111111-1111-4111-8111-111111111111";
const token = "a".repeat(32);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

const snapshot = {
  name: "Jepang 10GB",
  locationCodes: ["JP"],
  durationDays: 7,
  volumeBytes: 10_000_000_000,
};

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    order_id: orderId,
    order_status: "READY",
    public_order_code: "DJW-1",
    esim_activation_expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    package_snapshot: snapshot,
    package_name_snapshot: snapshot.name,
    provider_package_code: "JP-10GB",
    provider_order_no: "PO-1",
    profile_status: "RELEASED",
    installable: true,
    qr_payload_encrypted: "enc:LPA:1$smdp.example$ABC123",
    activation_code_encrypted: "enc:ABC123",
    smdp_address: "smdp.example",
    activated_at: null,
    profile_expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    ...overrides,
  };
}

function ownerRow(overrides: Record<string, unknown> = {}) {
  return {
    ...orderRow(),
    share_id: null,
    token_encrypted: null,
    share_created_at: null,
    claimed_at: null,
    claim_hash: null,
    view_count: 0,
    last_opened_at: null,
    ...overrides,
  };
}

function shareRow(overrides: Record<string, unknown> = {}) {
  return {
    ...orderRow(),
    share_id: "22222222-2222-4222-8222-222222222222",
    token_encrypted: `enc:${token}`,
    share_created_at: "2026-11-01T00:00:00.000Z",
    revoked_at: null,
    claimed_at: null,
    claim_hash: null,
    claimed_by_subject: null,
    view_count: 0,
    last_opened_at: null,
    ...overrides,
  };
}

type Row = Record<string, unknown>;
function isSql(statement: string, fragment: string) {
  return statement.toLowerCase().includes(fragment.toLowerCase());
}

/** Route each SQL statement by shape, so tests describe the contract instead of call order. */
function routeQueries(handlers: {
  config?: () => Row[];
  owner?: () => Row[];
  share?: () => Row[];
  admin?: () => Row[];
  claim?: (params: unknown[]) => Row[];
  revoke?: (params: unknown[]) => Row[];
  touch?: () => Row[];
}) {
  query.mockImplementation((async (text: unknown, params?: unknown[]) => {
    const sql = String(text);
    if (isSql(sql, "select value_json, version from public.admin_settings"))
      return { rows: handlers.config ? handlers.config() : [] };
    if (isSql(sql, "select value_json, version from public.admin_settings for update"))
      return { rows: handlers.config ? handlers.config() : [] };
    if (isSql(sql, "s.token_hash = $1")) return { rows: handlers.share ? handlers.share() : [] };
    if (isSql(sql, "where o.id = $1 and o.customer_auth_subject = $2"))
      return { rows: handlers.owner ? handlers.owner() : [] };
    if (isSql(sql, "where o.id = $1")) return { rows: handlers.admin ? handlers.admin() : [] };
    if (isSql(sql, "set claimed_at = now(), claimed_by_subject = $2"))
      return { rows: handlers.claim ? handlers.claim(params ?? []) : [] };
    if (isSql(sql, "set revoked_at = now(), revoked_by = $2, revoke_reason = 'owner'"))
      return { rows: handlers.revoke ? handlers.revoke(params ?? []) : [] };
    if (isSql(sql, "set view_count = view_count + 1")) return { rows: handlers.touch?.() ?? [] };
    if (isSql(sql, "insert into public.admin_audit_logs")) return { rows: [] };
    return { rows: [] };
  }) as never);
}

describe("eSIM share owner contract", () => {
  beforeEach(() => {
    query.mockReset();
    connect.mockReset();
    authenticate.mockReset();
    adminGuard.mockReset();
    adminEmail.mockReset();
    storedUsage.mockReset();
    readCookie.mockReset();
    writeCookie.mockReset();
    authenticate.mockResolvedValue({ id: ownerId, email: "owner@example.test" });
  });

  it("returns the owner link scoped by the verified session subject", async () => {
    routeQueries({
      config: () => [{ value_json: { enabled: true }, version: 2 }],
      owner: () => [
        ownerRow({
          share_id: "share-1",
          token_encrypted: `enc:${token}`,
          share_created_at: "2026-11-01T00:00:00.000Z",
          claimed_at: "2026-11-03T00:00:00.000Z",
          claim_hash: null,
          claimed_by_subject: recipientId,
        }),
      ],
    });

    const state = await getEsimShareStateHandler({ data: { orderId } });

    expect(state).toMatchObject({ enabled: true, eligible: true });
    expect(state.link?.token).toBe(token);
    expect(state.link?.claimed).toBe(true);
    expect(state.link).not.toHaveProperty("claimed_by_subject");
    const ownerCall = query.mock.calls.find(([sql]) => isSql(String(sql), "s.id as share_id"));
    expect(ownerCall?.[1]).toEqual([orderId, ownerId]);
  });

  it("refuses an order the session does not own", async () => {
    routeQueries({ config: () => [{ value_json: { enabled: true } }], owner: () => [] });

    await expect(getEsimShareStateHandler({ data: { orderId } })).rejects.toThrow(
      "eSIM tidak ditemukan",
    );
  });

  it("creates a hashed link and revokes the previous one in one transaction", async () => {
    routeQueries({
      config: () => [{ value_json: { enabled: true }, version: 1 }],
      owner: () => [ownerRow()],
    });
    const statements: string[] = [];
    const inserted: unknown[][] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        statements.push(sql);
        if (isSql(sql, "insert into public.esim_share_links")) {
          inserted.push(params ?? []);
          return { rows: [{ created_at: "2026-11-02T00:00:00.000Z" }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    connect.mockResolvedValue(client as never);

    const created = await createEsimShareLinkHandler({ data: { orderId } });

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(statements[0]).toBe("begin");
    expect(statements[1]).toContain("revoked_at = now()");
    expect(inserted[0]?.[0]).toBe(orderId);
    expect(inserted[0]?.[1]).toBe(hash(created.token));
    expect(inserted[0]?.[1]).not.toBe(created.token);
    expect(inserted[0]?.[2]).toBe(`enc:${created.token}`);
    expect(inserted[0]?.[3]).toBe(ownerId);
    expect(statements.at(-1)).toBe("commit");
    expect(inserted[0]).toBeDefined();
  });

  it("does not create a link when the admin kill switch is off", async () => {
    routeQueries({ config: () => [{ value_json: { enabled: false } }] });

    await expect(createEsimShareLinkHandler({ data: { orderId } })).rejects.toThrow(
      "dinonaktifkan",
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it("does not create a link for an ended package", async () => {
    routeQueries({
      config: () => [{ value_json: { enabled: true } }],
      owner: () => [ownerRow({ order_status: "REFUNDED" })],
    });

    await expect(createEsimShareLinkHandler({ data: { orderId } })).rejects.toThrow(
      "sudah berakhir",
    );
  });

  it("revokes only a link inside an owned order", async () => {
    routeQueries({ revoke: () => [{ id: "share-1" }] });

    const result = await revokeEsimShareLinkHandler({ data: { orderId } });

    expect(result).toEqual({ revoked: true });
    const call = query.mock.calls.find(([sql]) => isSql(String(sql), "revoke_reason = 'owner'"));
    expect(call?.[1]).toEqual([orderId, ownerId]);
    expect(String(call?.[0])).toContain("o.customer_auth_subject = $2");
  });
});

describe("public eSIM share landing", () => {
  beforeEach(() => {
    query.mockReset();
    storedUsage.mockReset();
    authenticate.mockReset();
    authenticate.mockResolvedValue({ id: recipientId, email: "recipient@example.test" });
    readCookie.mockReset();
    writeCookie.mockReset();
    readCookie.mockReturnValue(undefined);
  });

  it("shows only a preview before the first explicit claim", async () => {
    routeQueries({
      config: () => [{ value_json: { enabled: true } }],
      share: () => [shareRow()],
    });

    const landing = await loadSharedEsim(token);

    expect(landing.state).toBe("available");
    if (landing.state !== "available") return;
    expect(landing.preview.packageName).toBe(snapshot.name);
    expect(landing.preview.locationCodes).toEqual(["JP"]);
    expect(landing).not.toHaveProperty("view");
    expect(storedUsage).not.toHaveBeenCalled();
  });

  it("does not reveal the QR to a browser that did not claim the link", async () => {
    routeQueries({
      config: () => [{ value_json: { enabled: true } }],
      share: () => [
        shareRow({ claimed_at: "2026-11-01T01:00:00.000Z", claim_hash: hash("other") }),
      ],
    });

    await expect(loadSharedEsim(token, "attacker")).resolves.toEqual({
      state: "claimed_elsewhere",
    });
    expect(storedUsage).not.toHaveBeenCalled();
  });

  it("opens the QR and usage for the browser holding the claim cookie", async () => {
    routeQueries({
      config: () => [{ value_json: { enabled: true } }],
      share: () => [shareRow({ claimed_at: "2026-11-01T01:00:00.000Z", claim_hash: hash(token) })],
      touch: () => [],
    });
    storedUsage.mockResolvedValue(
      new Map([
        [
          "PO-1",
          { totalBytes: 10_000_000_000, usedBytes: 2_000_000_000, measuredAtMs: 1_700_000_000_000 },
        ],
      ]),
    );

    const landing = await loadSharedEsim(token, token);

    expect(landing.state).toBe("open");
    if (landing.state !== "open") return;
    expect(landing.view.esim).toEqual({
      lpa: "LPA:1$smdp.example$ABC123",
      smdp: "smdp.example",
      activationCode: "ABC123",
    });
    expect(landing.view.claimMode).toBe("browser");
    expect(landing.view.usage).toEqual({
      totalBytes: 10_000_000_000,
      usedBytes: 2_000_000_000,
      remainingBytes: 8_000_000_000,
      measuredAt: 1_700_000_000_000,
    });
  });

  it("treats revoked, disabled and ended links as unavailable", async () => {
    routeQueries({
      config: () => [{ value_json: { enabled: true } }],
      share: () => [shareRow({ revoked_at: "2026-11-01T01:00:00.000Z" })],
    });
    await expect(loadSharedEsim(token)).resolves.toEqual({ state: "unavailable" });

    routeQueries({ config: () => [{ value_json: { enabled: false } }], share: () => [shareRow()] });
    await expect(loadSharedEsim(token)).resolves.toEqual({ state: "unavailable" });

    routeQueries({
      config: () => [{ value_json: { enabled: true } }],
      share: () => [
        shareRow({ profile_status: "USED_UP", profile_expires_at: null, activated_at: null }),
      ],
    });
    await expect(loadSharedEsim(token)).resolves.toEqual({ state: "unavailable" });
  });

  it("claims once for the verified account without creating a browser cookie", async () => {
    let storedSubject = "";
    routeQueries({
      config: () => [{ value_json: { enabled: true } }],
      claim: (params) => {
        storedSubject = String(params[1] ?? "");
        return [{ id: "share-1" }];
      },
      share: () => [
        shareRow({
          claimed_at: "2026-11-01T01:00:00.000Z",
          claimed_by_subject: storedSubject || recipientId,
          claim_hash: null,
        }),
      ],
      touch: () => [],
    });
    storedUsage.mockResolvedValue(new Map());

    const landing = await claimSharedEsimHandler({ data: { token } });

    expect(landing.state).toBe("open");
    if (landing.state !== "open") return;
    expect(landing.view.claimMode).toBe("account");
    expect(storedSubject).toBe(recipientId);
    expect(writeCookie).not.toHaveBeenCalled();
    const claimCall = query.mock.calls.find(([sql]) =>
      isSql(String(sql), "set claimed_at = now(), claimed_by_subject = $2"),
    );
    expect(claimCall?.[1]).toEqual([hash(token), recipientId]);
    expect(String(claimCall?.[0])).toContain("claimed_at is null");
  });

  it("opens an account claim in another browser without its original claim cookie", async () => {
    routeQueries({
      config: () => [{ value_json: { enabled: true } }],
      share: () => [
        shareRow({
          claimed_at: "2026-11-01T01:00:00.000Z",
          claimed_by_subject: recipientId,
          claim_hash: null,
        }),
      ],
      touch: () => [],
    });
    storedUsage.mockResolvedValue(new Map());

    const landing = await loadSharedEsim(token);

    expect(landing.state).toBe("open");
    if (landing.state !== "open") return;
    expect(landing.view.claimMode).toBe("account");
    expect(readCookie).toHaveBeenCalled();
    expect(storedUsage).toHaveBeenCalledWith(["PO-1"]);
    expect(writeCookie).not.toHaveBeenCalled();
  });

  it("does not reveal an account claim to another or signed-out account", async () => {
    routeQueries({
      config: () => [{ value_json: { enabled: true } }],
      share: () => [
        shareRow({
          claimed_at: "2026-11-01T01:00:00.000Z",
          claimed_by_subject: recipientId,
          claim_hash: null,
        }),
      ],
    });
    authenticate.mockResolvedValue({ id: otherRecipientId, email: "other@example.test" });

    await expect(loadSharedEsim(token)).resolves.toEqual({ state: "claimed_elsewhere" });
    authenticate.mockRejectedValue(new Error("Autentikasi diperlukan"));
    await expect(loadSharedEsim(token)).resolves.toEqual({ state: "claimed_elsewhere" });
    expect(storedUsage).not.toHaveBeenCalled();
  });

  it("fails closed for an already-claimed row with no account or legacy cookie proof", async () => {
    routeQueries({
      config: () => [{ value_json: { enabled: true } }],
      share: () => [shareRow({ claimed_at: "2026-11-01T01:00:00.000Z" })],
    });

    await expect(loadSharedEsim(token)).resolves.toEqual({ state: "claimed_elsewhere" });
  });

  it("returns the winner state when this account loses the atomic claim race", async () => {
    routeQueries({
      config: () => [{ value_json: { enabled: true } }],
      claim: () => [],
      share: () => [
        shareRow({
          claimed_at: "2026-11-01T01:00:00.000Z",
          claimed_by_subject: otherRecipientId,
          claim_hash: null,
        }),
      ],
    });

    await expect(claimSharedEsimHandler({ data: { token } })).resolves.toEqual({
      state: "claimed_elsewhere",
    });
    expect(writeCookie).not.toHaveBeenCalled();
  });
});

describe("admin eSIM share operations", () => {
  beforeEach(() => {
    query.mockReset();
    adminGuard.mockReset();
    adminEmail.mockReset();
    adminGuard.mockResolvedValue(undefined);
    adminEmail.mockResolvedValue("admin@example.test");
  });

  it("reads a share state without the owner token", async () => {
    routeQueries({
      config: () => [{ value_json: { enabled: true } }],
      admin: () => [
        ownerRow({
          share_id: "share-1",
          token_encrypted: `enc:${token}`,
          share_created_at: "2026-11-01T00:00:00.000Z",
          claimed_at: "2026-11-03T00:00:00.000Z",
          claim_hash: null,
          claimed_by_subject: recipientId,
          view_count: 3,
        }),
      ],
    });

    const state = await getAdminEsimShareStateHandler({ data: { orderId } });

    expect(state).toMatchObject({ enabled: true, eligible: true });
    expect(state?.link?.viewCount).toBe(3);
    expect(state?.link?.claimed).toBe(true);
    expect(state?.link).not.toHaveProperty("token");
    expect(state?.link).not.toHaveProperty("claimed_by_subject");
    const call = query.mock.calls.find(([sql]) => isSql(String(sql), "s.id as share_id"));
    expect(call?.[1]).toEqual([orderId]);
  });

  it("revokes through the admin path and writes an audit row", async () => {
    routeQueries({ revoke: () => [{ id: "share-1" }] });
    query.mockImplementation((async (text: unknown) => {
      const sql = String(text);
      if (isSql(sql, "set revoked_at = now(), revoked_by = $2, revoke_reason = 'admin'"))
        return { rows: [{ id: "share-1" }] };
      if (isSql(sql, "insert into public.admin_audit_logs")) return { rows: [] };
      return { rows: [] };
    }) as never);

    const result = await revokeAdminEsimShareHandler({ data: { orderId } });

    expect(result).toEqual({ revoked: true });
    expect(
      query.mock.calls.some(([sql]) => isSql(String(sql), "insert into public.admin_audit_logs")),
    ).toBe(true);
    const revoke = query.mock.calls.find(([sql]) => isSql(String(sql), "revoke_reason = 'admin'"));
    expect(revoke?.[1]).toEqual([orderId, "admin@example.test"]);
  });
});
