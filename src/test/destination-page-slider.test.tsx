import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ViewPackage } from "@/lib/package-view";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      children,
      to,
      params,
      ...rest
    }: Record<string, unknown> & { children: React.ReactNode }) => (
      <a href={String(to) + (params ? JSON.stringify(params) : "")} {...(rest as object)}>
        {children}
      </a>
    ),
    useRouter: () => ({ history: { back: vi.fn() }, navigate: vi.fn() }),
  };
});
vi.mock("@/components/shell", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StickyCta: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="cta">{children}</div>
  ),
  glassIconButtonClass: "",
}));
vi.mock("@/components/geo-answer", () => ({ GeoAnswer: () => null }));

import { Route } from "@/routes/destination.$code";

const pkg = (code: string, name: string, gb: number, days: number, price: number): ViewPackage => ({
  packageCode: code,
  name,
  locationCodes: ["JP"],
  volumeBytes: gb * 1024 ** 3,
  unlimited: false,
  durationDays: days,
  priceIdr: price,
  sellable: true,
});

const packages = [
  pkg("a3", "Japan 1GB 3Days", 1, 3, 9000),
  pkg("a7", "Japan 1GB 7Days", 1, 7, 15000),
  pkg("b7", "Japan 3GB 7Days", 3, 7, 32000),
  pkg("d7", "Japan 1GB/Day 7Days", 1, 7, 52000),
  pkg("c15", "Japan 10GB 15Days", 10, 15, 95000),
  pkg("e30", "Japan 20GB 30Days", 20, 30, 189000),
];

function setup(daySlider: boolean, extra: ViewPackage[] = []) {
  vi.spyOn(Route, "useLoaderData").mockReturnValue({
    destination: { code: "jp", nameId: "Jepang", flag: "🇯🇵", region: "Asia" },
    packages: [...packages, ...extra],
    picks: [{ tag: "best_seller", pkg: packages[1]! }],
    switcher: [],
    network: "SoftBank",
    stale: false,
    stockPending: false,
    daySlider,
  } as never);
  vi.spyOn(Route, "useSearch").mockReturnValue({ availability: "all" } as never);
  const Component = Route.options.component as () => React.ReactElement;
  return render(<Component />);
}

describe("destination page (day slider)", () => {
  it("starts at the Terlaris validity and lists that tier cheapest first", () => {
    setup(true);
    const slider = screen.getByRole("slider", { name: /lama perjalanan/i });
    expect((slider as HTMLInputElement).value).toBe("7");
    const rows = within(screen.getByRole("radiogroup", { name: "Paket eSIM" })).getAllByRole(
      "radio",
    );
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([
      expect.stringContaining("1 GB data, 7 hari"),
      expect.stringContaining("3 GB data, 7 hari"),
      expect.stringContaining("1 GB data, 7 hari"),
    ]);
    expect(rows[0]!.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Terlaris")).toBeTruthy();
    expect(within(screen.getByTestId("cta")).getByText("Rp15.000")).toBeTruthy();
  });

  it("moves to the next validity tier when the slider passes a tier", () => {
    setup(true);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "10" } });
    const rows = within(screen.getByRole("radiogroup", { name: "Paket eSIM" })).getAllByRole(
      "radio",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getAttribute("aria-label")).toContain("10 GB data, 15 hari");
    expect(screen.getByText(/Masa aktif paket terdekat/).textContent).toContain("15 hari");
  });

  it("filters to daily quotas and buys the selected package", () => {
    setup(true);
    fireEvent.click(screen.getByRole("button", { name: "Harian" }));
    const rows = within(screen.getByRole("radiogroup", { name: "Paket eSIM" })).getAllByRole(
      "radio",
    );
    expect(rows).toHaveLength(1);
    const buy = within(screen.getByTestId("cta")).getByRole("link", { name: "Beli" });
    expect(buy.getAttribute("href")).toContain("d7");
  });

  it("wraps long multi-country labels instead of running into the price", () => {
    const regional: ViewPackage = {
      ...pkg("r30", "Asia 3GB 30Days", 3, 30, 76000),
      locationCodes: ["MO", "HK", "JP"],
    };
    setup(true, [regional]);
    const group = screen.getByRole("radiogroup", { name: "Paket multi-negara" });
    const row = within(group).getAllByRole("radio")[0]!;
    const label = within(row).getByText("Makau, Hong Kong, Jepang");
    expect(label.className).not.toContain("whitespace-nowrap");
    expect(label.className).toContain("break-words");
    expect(within(row).getByText("Rp76.000")).toBeTruthy();
  });

  it("falls back to range tabs when Admin turns the slider off", () => {
    setup(false);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByRole("button", { name: /4–7 hr/ })).toBeTruthy();
  });
});
