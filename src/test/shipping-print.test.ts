import { describe, expect, it } from "vitest";
import {
  billRows,
  manifestRows,
  proofRows,
  withSvgNamespace,
  type PrintOrder,
} from "../lib/shipping-print";

const order: PrintOrder = {
  code: "DJW-KR-0042",
  status: "SHIPPED",
  recipientName: "Rina Tanaka",
  phone: "+819012345678",
  postalCode: "150-0002",
  prefecture: "Tokyo",
  city: "Shibuya-ku",
  addressLine: "2-21-1 Shibuya, Apt 302",
  category: "Makanan kering",
  contents: "Keripik, kopi bubuk",
  declaredValueIdr: 650000,
  estimatedKg: 2,
  weighedKg: 2.4,
  billedKg: 2.5,
  rateIdrPerKg: 150000,
  freightIdr: 375000,
  packingIdr: 10000,
  totalIdr: 385000,
  paymentExpiresAt: "2026-11-22T03:00:00.000Z",
  paidAt: "2026-11-20T04:02:00.000Z",
  courier: "Partner Djiwa",
  trackingNumber: "EE123456789ID",
  shippedAt: "2026-11-21T07:05:00.000Z",
  createdAt: "2026-11-18T12:30:00.000Z",
};

describe("shipping documents", () => {
  it("lays the bill out as weighed, rounded, charged and total", () => {
    const rows = Object.fromEntries(billRows(order));
    expect(rows["Berat timbang"]).toBe("2,4 kg");
    expect(rows["Berat ditagih (dibulatkan)"]).toBe("2,5 kg");
    expect(rows["Ongkos kirim"]).toBe("Rp375.000");
    expect(rows["Total"]).toBe("Rp385.000");
    expect(rows["Dibayar"]).toContain("November 2026");
  });

  it("marks an unpaid bill and an unweighed parcel without inventing numbers", () => {
    const rows = Object.fromEntries(
      billRows({
        ...order,
        paidAt: null,
        weighedKg: null,
        billedKg: null,
        totalIdr: null,
        freightIdr: null,
      }),
    );
    expect(rows["Dibayar"]).toBe("Belum");
    expect(rows["Berat timbang"]).toBe("-");
    expect(rows["Total"]).toBe("Rp0");
  });

  it("puts the courier and receipt number on the shipping proof", () => {
    const rows = Object.fromEntries(proofRows(order));
    expect(rows["Kurir"]).toBe("Partner Djiwa");
    expect(rows["Nomor resi"]).toBe("EE123456789ID");
    expect(rows["Status"]).toBe("Dikirim ke Jepang");
  });

  it("numbers the manifest lines and falls back to the estimate before weighing", () => {
    const lines = manifestRows([
      order,
      { ...order, code: "DJW-KR-0043", billedKg: null, trackingNumber: null },
    ]);
    expect(lines.map((l) => l.no)).toEqual([1, 2]);
    expect(lines[0]).toMatchObject({
      code: "DJW-KR-0042",
      kg: "2,5 kg",
      tracking: "EE123456789ID",
    });
    expect(lines[1]).toMatchObject({ kg: "~2 kg", tracking: "" });
    expect(lines[0]!.city).toBe("Shibuya-ku, Tokyo");
  });
});

describe("QR image for the label", () => {
  it("adds the XML namespace a browser needs to load the QR as an image", () => {
    const react =
      '<svg height="512" width="512" viewBox="0 0 37 37" role="img"><path d="M0,0"></path></svg>';
    const fixed = withSvgNamespace(react);
    expect(fixed).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(fixed.startsWith("<svg xmlns=")).toBe(true);
    expect(fixed).toContain('viewBox="0 0 37 37"');
  });

  it("leaves markup that already has the namespace alone", () => {
    const ok = '<svg xmlns="http://www.w3.org/2000/svg" width="1"></svg>';
    expect(withSvgNamespace(ok)).toBe(ok);
  });
});
