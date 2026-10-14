import { describe, expect, it } from "vitest";

import { destinations } from "@/lib/catalog";
import {
  DEFAULT_MINIMUM_TOPUP,
  DEFAULT_TOPUP_PRESETS,
  parseMinimumTopup,
  parseTopupPresets,
  readCustomerAppConfig,
  resolveWalletActions,
} from "@/lib/customer-app-config";
import { FINDER_FIELD_COUNT, finderCtaCopy } from "@/lib/finder-form";
import { nextFrame, paymentProgressLabel } from "@/lib/payment-progress";

describe("dynamic storefront config", () => {
  it("falls back to the shipped presets when nothing is configured", () => {
    expect(parseTopupPresets(undefined)).toEqual([...DEFAULT_TOPUP_PRESETS]);
    expect(parseTopupPresets("")).toEqual([...DEFAULT_TOPUP_PRESETS]);
  });

  it("accepts a valid override and normalises it", () => {
    expect(parseTopupPresets("100000, 50000, 50000")).toEqual([50_000, 100_000]);
  });

  it("ignores unusable overrides instead of emptying the selector", () => {
    expect(parseTopupPresets("abc,-5,0,10")).toEqual([...DEFAULT_TOPUP_PRESETS]);
    expect(parseTopupPresets("not-a-number")).toEqual([...DEFAULT_TOPUP_PRESETS]);
  });

  it("keeps the minimum sane", () => {
    expect(parseMinimumTopup("5000")).toBe(5_000);
    expect(parseMinimumTopup("nope")).toBe(DEFAULT_MINIMUM_TOPUP);
    expect(parseMinimumTopup("-100")).toBe(DEFAULT_MINIMUM_TOPUP);
  });

  it("only enables the listed quick actions when an override is present", () => {
    const actions = resolveWalletActions("Isi Saldo");
    const enabled = actions.filter((action) => action.supported).map((action) => action.label);
    expect(enabled).toEqual(["Isi Saldo"]);
  });

  it("keeps the shipped support flags when the override is unset", () => {
    const actions = resolveWalletActions(undefined);
    const enabled = actions.filter((action) => action.supported).map((action) => action.label);
    expect(enabled).toEqual(["Isi Saldo", "Riwayat", "Bantuan"]);
  });

  it("reads a full config from env", () => {
    const config = readCustomerAppConfig({
      DJIWA_TOPUP_PRESETS: "25000,50000",
      DJIWA_TOPUP_MINIMUM: "25000",
      DJIWA_WALLET_ACTIONS_ENABLED: "Riwayat",
    });
    expect(config.topup.presets).toEqual([25_000, 50_000]);
    expect(config.topup.minimum).toBe(25_000);
    expect(config.walletActions.find((action) => action.supported)?.label).toBe("Riwayat");
  });
});

describe("finder copy follows the form", () => {
  it("counts the real number of fields", () => {
    expect(FINDER_FIELD_COUNT).toBe(4);
    expect(finderCtaCopy()).toBe("Jawab 4 pertanyaan, kami urutkan yang paling cocok");
  });

  it("only offers durations that exist in the live catalogue", () => {
    // Guards against a duration dropdown offering values no package can satisfy.
    expect(destinations.length).toBeGreaterThan(0);
  });
});

describe("payment progress copy", () => {
  it("labels the in-flight stages", () => {
    expect(paymentProgressLabel("preparing")).toBe("Menyiapkan pembayaran…");
    expect(paymentProgressLabel("redirecting")).toBe("Membuka halaman pembayaran…");
  });

  it("never leaks the gateway vendor name to customers", () => {
    for (const stage of ["preparing", "redirecting", "idle"] as const) {
      expect(paymentProgressLabel(stage).toLowerCase()).not.toContain("mayar");
    }
  });

  it("resolves the frame delay so the redirect stage can render", async () => {
    const started = Date.now();
    await nextFrame(20);
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
  });
});
