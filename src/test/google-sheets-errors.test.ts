import { describe, expect, it } from "vitest";
import { friendlySheetError } from "@/lib/google-sheets-errors";

describe("What a traveler is told when a Sheets sync failed", () => {
  it("says it is on Djiwa's side when the Sheets API is not enabled for the app", () => {
    const message = friendlySheetError(
      "Google Sheets buat 403: Google Sheets API has not been used in project 559298319721 before or it is disabled.",
    );
    expect(message).toContain("belum siap di sisi Djiwa");
    expect(message).toContain("aman");
    expect(message).not.toMatch(/559298319721|403/);
  });

  it("asks to reconnect when access was revoked, and explains rate limits", () => {
    expect(friendlySheetError("Akses Google dicabut atau kedaluwarsa")).toContain(
      "dihubungkan ulang",
    );
    expect(friendlySheetError("Google Sheets tulis 429: quota exceeded")).toContain("membatasi");
  });

  it("falls back to a calm generic line", () => {
    expect(friendlySheetError(null)).toContain("Coba lagi");
    expect(friendlySheetError("???")).toContain("Data kamu aman");
  });
});
