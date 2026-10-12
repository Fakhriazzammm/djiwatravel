import { afterEach, describe, expect, it, vi } from "vitest";

import {
  downloadReceiptPdf,
  formatReceiptAmount,
  formatReceiptDate,
  printReceiptWindow,
  receiptSteps,
  safeReceiptFileName,
} from "@/lib/receipt-print";
import { RECEIPT_CLIP_PATH } from "@/components/receipt-printer";

// The receipt is a legal-ish document handed to the customer, so its formatting is pinned.
describe("receipt amounts", () => {
  it("formats rupiah the way the rest of the app does", () => {
    expect(formatReceiptAmount(15000)).toBe("Rp15.000");
    expect(formatReceiptAmount(1234567)).toBe("Rp1.234.567");
  });

  it("never prints a negative or fractional amount", () => {
    expect(formatReceiptAmount(-500)).toBe("Rp0");
    expect(formatReceiptAmount(15000.4)).toBe("Rp15.000");
  });
});

describe("receipt dates", () => {
  it("renders WIB regardless of the device timezone", () => {
    // 2026-10-10T16:00:00Z is 23:00 on the same day in WIB (+07:00).
    expect(formatReceiptDate(Date.UTC(2026, 9, 10, 16, 0, 0))).toBe("10 Oktober 2026, 23:00 WIB");
  });

  it("rolls into the next WIB day when the UTC time is late", () => {
    // 2026-10-10T18:30:00Z is 01:30 on 11 October in WIB.
    expect(formatReceiptDate(Date.UTC(2026, 9, 10, 18, 30, 0))).toBe("11 Oktober 2026, 01:30 WIB");
  });
});

describe("receipt file names", () => {
  it("builds a readable, safe file name", () => {
    expect(safeReceiptFileName("1358333E6DF625DD2CDB5DF3")).toBe(
      "struk-djiwa-travel-1358333E6DF625DD2CDB5DF3.pdf",
    );
  });

  it("strips anything that could break a file system", () => {
    expect(safeReceiptFileName("../../etc/passwd")).toBe("struk-djiwa-travel-etcpasswd.pdf");
    expect(safeReceiptFileName("")).toBe("struk-djiwa-travel-pesanan.pdf");
  });
});

describe("installation tutorial", () => {
  it("covers both install and first-use in the destination country", () => {
    const steps = receiptSteps();
    expect(steps.length).toBeGreaterThanOrEqual(4);
    expect(steps.join(" ")).toMatch(/QR/i);
    expect(steps.join(" ")).toMatch(/Roaming/i);
    expect(steps.join(" ")).toMatch(/sebelum berangkat/i);
  });
});

describe("receipt paper edge", () => {
  it("uses a torn polygon so the paper looks cut, not rectangular", () => {
    expect(RECEIPT_CLIP_PATH.startsWith("polygon(0 0, 100% 0")).toBe(true);
    expect(RECEIPT_CLIP_PATH.endsWith(")")).toBe(true);
  });
});


describe("receipt actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports unsupported printing instead of claiming success", () => {
    const result = printReceiptWindow({ defaultView: null } as unknown as Document);

    expect(result).toEqual({
      ok: false,
      message: "Browser ini tidak mendukung cetak. Gunakan Unduh PDF.",
    });
  });

  it("reports a blocked print dialog", () => {
    const print = vi.fn(() => { throw new Error("blocked"); });
    const result = printReceiptWindow({ defaultView: { print } } as unknown as Document);

    expect(print).toHaveBeenCalledOnce();
    expect(result).toEqual({
      ok: false,
      message: "Dialog cetak diblokir browser. Gunakan Unduh PDF.",
    });
  });

  it("reports an actionable fallback when PDF download APIs are unavailable", async () => {
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: undefined,
    });

    const result = await downloadReceiptPdf({
      brand: "Djiwa Travel",
      title: "Struk pembayaran eSIM",
      code: "ORDER123",
      statusLabel: "Menunggu pembayaran",
      fields: [{ label: "Total", value: "Rp15.000" }],
      footer: [],
      fileName: "struk-djiwa-travel-ORDER123.pdf",
    });

    expect(result).toEqual({
      ok: false,
      message: "Browser tidak mendukung unduhan PDF. Gunakan tombol cetak.",
    });
  });
});
