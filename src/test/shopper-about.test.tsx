import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ShopperAbout, FeeExplainer } from "@/components/shopper/shopper-about";
import { DEFAULT_SHOPPER_CONFIG, parseShopperConfig } from "@/lib/personal-shopper";

describe("prohibited list config", () => {
  it("has a default list and accepts an edited one", () => {
    expect(DEFAULT_SHOPPER_CONFIG.prohibited.length).toBeGreaterThan(0);
    const next = parseShopperConfig({ ...DEFAULT_SHOPPER_CONFIG, prohibited: ["  Parfum  "] });
    expect(next.prohibited).toEqual(["Parfum"]);
    expect(parseShopperConfig({ prohibited: [] }).prohibited).toEqual([]);
  });

  it("rejects bad lists", () => {
    expect(() => parseShopperConfig({ prohibited: "x" })).toThrow();
    expect(() => parseShopperConfig({ prohibited: ["a"] })).toThrow();
    expect(() => parseShopperConfig({ prohibited: Array(13).fill("Barang") })).toThrow();
    expect(() => parseShopperConfig({ prohibited: [5] })).toThrow();
  });

  it("older saved settings without the field keep the defaults", () => {
    expect(parseShopperConfig({ feePercent: 12 }).prohibited).toEqual(
      DEFAULT_SHOPPER_CONFIG.prohibited,
    );
  });
});

describe("ShopperAbout", () => {
  it("is collapsed first, then lists what can and cannot be sent", () => {
    render(<ShopperAbout config={DEFAULT_SHOPPER_CONFIG} />);
    expect(screen.queryByText("Cara kerjanya")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Apa saja yang bisa dititip/ }));
    expect(screen.getByText("Cara kerjanya")).toBeTruthy();
    expect(screen.getByText(/Biaya perjalanan tim kami ke\s+Jepang sudah termasuk/)).toBeTruthy();
    expect(screen.getByText("Tas")).toBeTruthy();
    expect(screen.getByText(DEFAULT_SHOPPER_CONFIG.prohibited[0]!)).toBeTruthy();
  });

  it("hides the prohibited block when Admin empties the list", () => {
    render(<ShopperAbout config={{ ...DEFAULT_SHOPPER_CONFIG, prohibited: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: /Apa saja yang bisa dititip/ }));
    expect(screen.queryByText(/Tidak bisa/)).toBeNull();
  });
});

describe("FeeExplainer", () => {
  it("explains the fee with the configured percent", () => {
    render(<FeeExplainer config={{ ...DEFAULT_SHOPPER_CONFIG, feePercent: 20 }} hasMarket />);
    fireEvent.click(screen.getByRole("button", { name: /Biaya ini untuk apa/ }));
    expect(screen.getByText(/Jasa titip 20%/)).toBeTruthy();
    expect(screen.getByText(/Kirim dalam Jepang/)).toBeTruthy();
    expect(screen.getByText(/tiket pesawat, hotel, transportasi/)).toBeTruthy();
  });
});
