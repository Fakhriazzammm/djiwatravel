import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client.server", () => ({ pool: { query: vi.fn() } }));

import {
  GOOGLE_SCOPES,
  decrypt,
  encrypt,
  featuresFromScopes,
  grantedScopes,
  hasFeature,
  parseFeatures,
  redactError,
  scopesForFeatures,
  type GoogleConnection,
} from "@/lib/google-account.server";

beforeAll(() => {
  process.env["GOOGLE_CALENDAR_CLIENT_ID"] = "id";
  process.env["GOOGLE_CALENDAR_CLIENT_SECRET"] = "secret";
  process.env["GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY"] = "a".repeat(64);
});

const connection = (scopes: string[] | null, refresh: string | null = "x"): GoogleConnection => ({
  customer_auth_subject: "u1",
  access_token_encrypted: null,
  refresh_token_encrypted: refresh,
  token_expires_at: null,
  google_account_email: null,
  granted_scopes: scopes,
  drive_enabled: true,
  connected_at: null,
});

describe("Google features and scopes", () => {
  it("defaults to Calendar and ignores unknown features", () => {
    expect(parseFeatures(null)).toEqual(["calendar"]);
    expect(parseFeatures("bogus")).toEqual(["calendar"]);
    expect(parseFeatures("drive,sheets,drive")).toEqual(["drive", "sheets"]);
  });

  it("asks Drive and Sheets for the same file-level scope, never full Drive", () => {
    const scopes = scopesForFeatures(["drive", "sheets"]);
    expect(scopes).toContain(GOOGLE_SCOPES.drive);
    expect(scopes.filter((scope) => scope === GOOGLE_SCOPES.drive)).toHaveLength(1);
    expect(scopes).not.toContain("https://www.googleapis.com/auth/drive");
    expect(scopes).not.toContain("https://www.googleapis.com/auth/spreadsheets");
  });

  it("reads granted features from the scopes Google returned", () => {
    expect(featuresFromScopes([GOOGLE_SCOPES.calendar])).toEqual({
      calendar: true,
      drive: false,
      sheets: false,
    });
    expect(featuresFromScopes([GOOGLE_SCOPES.calendar, GOOGLE_SCOPES.drive])).toEqual({
      calendar: true,
      drive: true,
      sheets: true,
    });
  });

  it("treats a connection without a refresh token as having no access", () => {
    expect(grantedScopes(connection([GOOGLE_SCOPES.drive], null))).toEqual([]);
    expect(hasFeature(connection([GOOGLE_SCOPES.drive]), "drive")).toBe(true);
    expect(hasFeature(connection([GOOGLE_SCOPES.calendar]), "drive")).toBe(false);
    expect(hasFeature(null, "calendar")).toBe(false);
  });
});

describe("Token encryption", () => {
  it("round-trips and never stores the plain token", () => {
    const sealed = encrypt("ya29.secret-token");
    expect(sealed).not.toContain("secret-token");
    expect(decrypt(sealed)).toBe("ya29.secret-token");
  });

  it("uses a fresh IV each time and rejects tampering", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
    const [iv, tag, data] = encrypt("same").split(".");
    expect(() => decrypt([iv, tag, `${data}A`].join("."))).toThrow();
  });
});

describe("Error redaction", () => {
  it("removes tokens and e-mail addresses from logged errors", () => {
    const text = redactError(new Error("401 Bearer ya29.abcDEF-123 for budi@gmail.com"));
    expect(text).not.toMatch(/ya29|budi@/);
    expect(text).toContain("[redacted]");
    expect(text).toContain("[email]");
  });
});
