import { describe, expect, it } from "vitest";

import { formatWhatsapp, isValidWhatsapp, normalizeWhatsapp, WHATSAPP_PATTERN } from "@/lib/phone";

// Customers type the local form and the stack stores the international one; these cases pin
// the conversion so checkout, profile and the server schema cannot disagree.
describe("normalizeWhatsapp", () => {
  it("converts the local 0… form", () => {
    expect(normalizeWhatsapp("08123456789")).toBe("628123456789");
  });

  it("converts the bare 8… form", () => {
    expect(normalizeWhatsapp("8123456789")).toBe("628123456789");
  });

  it("keeps an already international number", () => {
    expect(normalizeWhatsapp("628123456789")).toBe("628123456789");
  });

  it("strips separators and a leading plus", () => {
    expect(normalizeWhatsapp("+62 812-3456-789")).toBe("628123456789");
    expect(normalizeWhatsapp("0812 3456 789")).toBe("628123456789");
    expect(normalizeWhatsapp("(0812) 345.678")).toBe("62812345678");
  });

  it("returns an empty string when there is nothing to dial", () => {
    expect(normalizeWhatsapp("")).toBe("");
    expect(normalizeWhatsapp("abc")).toBe("");
  });
});

describe("isValidWhatsapp", () => {
  it("accepts both local and international forms", () => {
    expect(isValidWhatsapp("08123456789")).toBe(true);
    expect(isValidWhatsapp("628123456789")).toBe(true);
  });

  it("rejects short, empty and non-numeric input", () => {
    expect(isValidWhatsapp("0812")).toBe(false);
    expect(isValidWhatsapp("")).toBe(false);
    expect(isValidWhatsapp("abcdefghi")).toBe(false);
  });

  it("exposes the same pattern the server schema uses", () => {
    expect(WHATSAPP_PATTERN.test(normalizeWhatsapp("08123456789"))).toBe(true);
  });
});

describe("formatWhatsapp", () => {
  it("renders a readable international form", () => {
    expect(formatWhatsapp("08123456789")).toBe("+62 812-3456-789");
  });
});
