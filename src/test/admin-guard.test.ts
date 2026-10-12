import { describe, expect, it } from "vitest";

import { adminEmails, isAdminEmail, normalizeAdminEmail } from "@/lib/admin-guard.server";

const env = { ADMIN_EMAILS: "fakhriazzamm@gmail.com, Ops@Djiwa.Travel " } as NodeJS.ProcessEnv;

// The admin area holds operational data and has no other gate yet, so the allowlist rules are
// pinned here: parsing, case folding, whitespace, and above all failing closed.
describe("admin allowlist", () => {
  it("normalizes the exact configured admin identity", () => {
    expect(normalizeAdminEmail("  FakhriAzzamm@Gmail.com ")).toBe("fakhriazzamm@gmail.com");
  });
  it("parses a comma-separated list", () => {
    expect(adminEmails(env)).toEqual(["fakhriazzamm@gmail.com", "ops@djiwa.travel"]);
  });

  it("returns nothing when the variable is unset or blank", () => {
    expect(adminEmails({} as NodeJS.ProcessEnv)).toEqual([]);
    expect(adminEmails({ ADMIN_EMAILS: " , ," } as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("accepts allow-listed emails regardless of case or padding", () => {
    expect(isAdminEmail("fakhriazzamm@gmail.com", env)).toBe(true);
    expect(isAdminEmail("  FakhriAzzamm@Gmail.com ", env)).toBe(true);
  });

  it("rejects everyone else", () => {
    expect(isAdminEmail("someone@else.com", env)).toBe(false);
    expect(isAdminEmail("", env)).toBe(false);
    expect(isAdminEmail(null, env)).toBe(false);
    expect(isAdminEmail(undefined, env)).toBe(false);
  });

  it("fails closed when no allowlist is configured", () => {
    expect(isAdminEmail("fakhriazzamm@gmail.com", {} as NodeJS.ProcessEnv)).toBe(false);
  });
});
