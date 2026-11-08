import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({ submit: vi.fn(), fetch: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/shopper-discovery.fn", () => ({
  getDiscoveryStatus: async () => ({ enabled: true }),
  runCustomerDiscoveryAction: mock.submit,
}));
vi.mock("@/components/customer-auth", () => ({ CustomerAuth: () => <p>Masuk akun</p> }));
vi.mock("@/lib/receipt-image", () => ({ compressReceiptPhoto: async (f: Blob) => f }));
vi.mock("@/components/shopper/shopper-ui", () => ({
  ShopperSheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <section>
        <h2>{title}</h2>
        {children}
      </section>
    ) : null,
  ProductImage: () => null,
}));
import { ShopperDiscovery } from "@/components/shopper/shopper-discovery";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mock.fetch);
  mock.submit.mockResolvedValue({ ok: true });
});
describe("design A discovery", () => {
  it("accepts an external store reference and submits it for team review", async () => {
    mock.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        products: [],
        analysis: null,
        message: "Tim akan membantu",
        exact: false,
        market: null,
      }),
    });
    render(<ShopperDiscovery onProduct={vi.fn()} onMarket={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tempel link" }));
    fireEvent.change(screen.getByLabelText("Link produk"), {
      target: { value: "https://jp.mercari.com/item/m123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cari barang" }));
    await screen.findByText("Tim akan membantu");
    const form = mock.fetch.mock.calls[0]?.[1].body as FormData;
    expect(form.get("url")).toBe("https://jp.mercari.com/item/m123");
    expect(form.get("customer_auth_subject")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Minta bantuan cari" }));
    await screen.findByText("Permintaan terkirim");
    expect(mock.submit.mock.calls[0]?.[0].data).toMatchObject({
      action: "submit",
      expectedVersion: 1,
    });
  });
  it("asks for sign-in without submitting a manual request when unauthenticated", async () => {
    mock.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Masuk terlebih dahulu" }),
    });
    render(<ShopperDiscovery onProduct={vi.fn()} onMarket={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tempel link" }));
    fireEvent.change(screen.getByLabelText("Link produk"), {
      target: { value: "https://jp.mercari.com/item/m123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cari barang" }));
    await screen.findByText("Masuk akun");
    expect(mock.submit).not.toHaveBeenCalled();
  });
  it("does not send a photo search without a selected photo", async () => {
    render(<ShopperDiscovery onProduct={vi.fn()} onMarket={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Cari dari foto" }));
    fireEvent.click(screen.getByRole("button", { name: "Cari barang" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Pilih foto"));
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("shows a priced marketplace card and hands it to the market sheet", async () => {
    const market = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      site: "mercari",
      sourceUrl: "https://jp.mercari.com/item/m99035619244",
      name: "ユニクロ ダウン",
      priceJpy: 2999,
      imageUrl: null,
      conditionText: "目立った傷や汚れなし",
      sizeText: "XL(LL)",
      sold: false,
      needsVariant: false,
      maxQuantity: 1,
    };
    mock.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        products: [],
        analysis: null,
        message: "Harga dihitung otomatis",
        exact: false,
        market,
      }),
    });
    const onMarket = vi.fn();
    render(<ShopperDiscovery onProduct={vi.fn()} onMarket={onMarket} rate={114} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tempel link" }));
    fireEvent.change(screen.getByLabelText("Link produk"), {
      target: { value: "https://jp.mercari.com/item/m99035619244" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cari barang" }));
    const card = await screen.findByRole("button", { name: /ユニクロ ダウン/ });
    expect(card.textContent).toContain("¥2.999");
    expect(card.textContent).toContain("Rp 341.886");
    // A priced item is the main action; asking the team is tucked away until needed.
    expect(screen.queryByRole("button", { name: "Minta bantuan cari" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Titip barang ini" }));
    expect(onMarket).toHaveBeenCalledWith(market);
  });
  it("offers team help right away when the marketplace item is sold", async () => {
    mock.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        products: [],
        analysis: null,
        message: "Barang ini sudah terjual.",
        exact: false,
        market: {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          site: "mercari",
          sourceUrl: "https://jp.mercari.com/item/m44776908724",
          name: "ダウン",
          priceJpy: 5500,
          imageUrl: null,
          conditionText: null,
          sizeText: null,
          sold: true,
          needsVariant: false,
          maxQuantity: 1,
        },
      }),
    });
    render(<ShopperDiscovery onProduct={vi.fn()} onMarket={vi.fn()} rate={114} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tempel link" }));
    fireEvent.change(screen.getByLabelText("Link produk"), {
      target: { value: "https://jp.mercari.com/item/m44776908724" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cari barang" }));
    await screen.findByRole("button", { name: "Minta bantuan cari" });
    expect(screen.queryByRole("button", { name: "Titip barang ini" })).toBeNull();
  });
});
