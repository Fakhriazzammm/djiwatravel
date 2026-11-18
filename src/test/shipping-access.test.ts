import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  email: "" as string | null,
  staff: null as { name: string; hubs: string[]; active: boolean } | null,
}));
vi.mock("../db/client.server", () => ({
  pool: { query: async () => ({ rows: h.staff ? [h.staff] : [] }) },
}));
vi.mock("@/lib/admin-guard.server", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin-guard.server")>()),
  getAdminEmailHandler: async () => h.email,
}));

import {
  actorOf,
  assertActionAllowed,
  assertHub,
  currentOps,
  requireOps,
} from "../lib/shipping-access.server";

beforeEach(() => {
  process.env["ADMIN_EMAILS"] = "boss@djiwa.test";
  h.email = "";
  h.staff = null;
});

describe("who may work on shipments", () => {
  it("lets Admin (the allowlist) work everywhere", async () => {
    h.email = "Boss@Djiwa.test";
    const ops = await currentOps();
    expect(ops).toMatchObject({ isAdmin: true, hubs: ["TASIK", "BANDUNG", "JAKARTA"] });
    expect(() => assertHub(ops!, "JAKARTA")).not.toThrow();
    expect(() => assertActionAllowed(ops!, "cancel", "PAID")).not.toThrow();
  });

  it("lets an active registered staff member in, limited to their hubs", async () => {
    h.email = "asep@djiwa.test";
    h.staff = { name: "Asep", hubs: ["BANDUNG"], active: true };
    const ops = (await currentOps())!;
    expect(ops).toMatchObject({ isAdmin: false, hubs: ["BANDUNG"], name: "Asep" });
    expect(actorOf(ops)).toBe("Asep (petugas)");
    expect(() => assertHub(ops, "BANDUNG")).not.toThrow();
    expect(() => assertHub(ops, "TASIK")).toThrow("tidak terdaftar untuk lokasi");
  });

  it("keeps out strangers, signed-out visitors and deactivated staff", async () => {
    h.email = "stranger@x.co";
    expect(await currentOps()).toBeNull();
    await expect(requireOps()).rejects.toThrow("belum terdaftar");
    h.email = null;
    expect(await currentOps()).toBeNull();
    h.email = "asep@djiwa.test";
    h.staff = { name: "Asep", hubs: ["TASIK"], active: false };
    expect(await currentOps()).toBeNull();
  });

  it("gives drop point staff the door tasks and nothing that moves money or settings", async () => {
    h.email = "asep@djiwa.test";
    h.staff = { name: "Asep", hubs: ["TASIK"], active: true };
    const ops = (await currentOps())!;
    for (const action of ["bill", "reject", "photo_approve", "photo_redo", "undo_receive"])
      expect(() => assertActionAllowed(ops, action, "RECEIVED")).not.toThrow();
    expect(() => assertActionAllowed(ops, "advance", "AWAITING_DROP")).not.toThrow();
    for (const action of ["cancel", "note", "check_payment", "resend_finance", "delete_photo"])
      expect(() => assertActionAllowed(ops, action, "PAID")).toThrow("hanya untuk Admin");
    // receiving is the only "advance" staff have: arrival in Japan and completion stay with Admin
    expect(() => assertActionAllowed(ops, "advance", "SHIPPED")).toThrow("hanya untuk Admin");
  });

  it("gives Bandung and Jakarta staff no single-shipment actions at all", async () => {
    h.email = "ujang@djiwa.test";
    h.staff = { name: "Ujang", hubs: ["BANDUNG", "JAKARTA"], active: true };
    const ops = (await currentOps())!;
    for (const action of ["advance", "bill", "reject", "photo_approve", "cancel"])
      expect(() => assertActionAllowed(ops, action, "RECEIVED")).toThrow("hanya untuk Admin");
  });
});

describe("the admin console stays closed to staff", () => {
  const dir = resolve(process.cwd(), "src/routes");
  const pages = readdirSync(dir).filter(
    (f) => /^admin\..+\.tsx$/.test(f) && f !== "admin.login.tsx",
  );

  it("has admin pages to check", () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  for (const page of pages) {
    it(`${page} is guarded by the admin allowlist, not by the staff table`, () => {
      const source = readFileSync(resolve(dir, page), "utf8");
      expect(source).toMatch(/requireAdmin\(\)/);
      expect(source).not.toMatch(/shipping-access|requireOps|currentOps/);
    });
  }

  it("keeps the staff identity check out of the admin guard itself", () => {
    const guard = readFileSync(resolve(process.cwd(), "src/lib/admin-guard.server.ts"), "utf8");
    expect(guard).not.toMatch(/shipping_staff/);
  });
});
