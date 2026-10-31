import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin settings schema recovery migration", () => {
  it("restores the server-owned tables skipped by the recorded admin migration", () => {
    const path = "migrations/027_restore_admin_settings.sql";
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;

    const sql = readFileSync(path, "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.admin_users");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.admin_audit_logs");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.admin_settings");
    expect(sql).toContain("ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY");
    expect(sql).not.toContain("CREATE POLICY");
  });
});
