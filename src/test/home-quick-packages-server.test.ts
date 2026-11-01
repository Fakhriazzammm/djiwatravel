import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_HOME_ESIM_CONFIG } from "@/lib/home-esim-config";
import { getHomeQuickPackagesHandler } from "@/lib/home-quick-packages.server";
import { getDestinationPackagesHandler } from "@/lib/destination-packages.server";
import { readHomeEsimConfig } from "@/lib/home-esim-config.server";
import { pool } from "../db/client.server";

vi.mock("../db/client.server", () => ({ pool: { query: vi.fn() } }));
vi.mock("@/lib/destination-packages.server", () => ({ getDestinationPackagesHandler: vi.fn() }));
vi.mock("@/lib/home-esim-config.server", () => ({ readHomeEsimConfig: vi.fn() }));

const pkg = (packageCode: string, days: number, priceIdr: number) => ({
  packageCode,
  name: packageCode,
  locationCodes: ["JP"],
  volumeBytes: 3_000_000_000,
  unlimited: false,
  durationDays: days,
  priceIdr,
  sellable: true,
});

const destination = { code: "JP", nameId: "Jepang", region: "Asia" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getDestinationPackagesHandler).mockResolvedValue({
    destination,
    packages: [pkg("A-7D", 7, 49_000), pkg("B-15D", 15, 89_000), pkg("C-30D", 30, 149_000)],
    stale: false,
    soldOut: 0,
    balanceUnknown: false,
    stockPending: false,
  } as never);
  vi.mocked(readHomeEsimConfig).mockResolvedValue({ config: DEFAULT_HOME_ESIM_CONFIG, version: 1 });
  vi.mocked(pool.query).mockResolvedValue({ rows: [{ code: "A-7D", sold: 8 }] } as never);
});

describe("getHomeQuickPackagesHandler", () => {
  it("uses paid-order counts for Terlaris and never exposes cost fields", async () => {
    const result = await getHomeQuickPackagesHandler("jp");
    expect(getDestinationPackagesHandler).toHaveBeenCalledWith("jp");
    expect(result?.picks.map((pick) => `${pick.tag}:${pick.pkg.packageCode}`)).toEqual([
      "best_seller:A-7D",
      "best_deal:C-30D",
    ]);
    expect(JSON.stringify(result)).not.toMatch(/providerCost|markup|snapshot/i);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/PAYMENT_CONFIRMED/);
    expect(sql).not.toMatch(/DRAFT|PAYMENT_PENDING/);
    expect(params[0]).toEqual(["A-7D", "B-15D", "C-30D"]);
  });

  it("applies the Admin pin saved for this destination", async () => {
    vi.mocked(readHomeEsimConfig).mockResolvedValue({
      config: {
        ...DEFAULT_HOME_ESIM_CONFIG,
        packageHighlights: { JP: { bestSellerPackageCode: "B-15D" } },
      },
      version: 2,
    });
    const result = await getHomeQuickPackagesHandler("JP");
    expect(result?.picks[0]).toMatchObject({
      tag: "best_seller",
      pinned: true,
      pkg: { packageCode: "B-15D" },
    });
  });

  it("still returns automatic picks when the sales query fails", async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error("db down"));
    const result = await getHomeQuickPackagesHandler("JP");
    expect(result?.picks).toHaveLength(2);
  });

  it("returns null for an unknown destination", async () => {
    vi.mocked(getDestinationPackagesHandler).mockResolvedValue(null);
    expect(await getHomeQuickPackagesHandler("ZZ")).toBeNull();
  });
});

describe("Home quick-buy wiring", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("shares one checkout form and one loader between the page and the bottom sheet", () => {
    expect(read("src/routes/checkout.$id.tsx")).toContain("<CheckoutForm");
    expect(read("src/components/esim-checkout-sheet.tsx")).toContain('variant="sheet"');
    expect(read("src/components/esim-checkout-sheet.tsx")).toContain("loadCheckout");
    expect(read("src/routes/checkout.$id.tsx")).toContain("loadCheckout");
  });

  it("lets Admin pin picks through the same homeEsim record the customer reads", () => {
    const panel = read("src/components/admin-home-esim-panel.tsx");
    expect(panel).toContain("AdminHomePackageHighlights");
    expect(panel).toContain("packageHighlights");
    expect(read("src/lib/home-quick-packages.server.ts")).toContain("readHomeEsimConfig");
  });
});
