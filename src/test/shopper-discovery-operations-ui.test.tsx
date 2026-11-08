import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { DiscoveryRequest } from "@/lib/shopper-discovery";
const mock = vi.hoisted(() => ({
  admin: vi.fn(),
  save: vi.fn(),
  accept: vi.fn(),
  navigate: vi.fn(),
  customer: vi.fn(),
}));
const offer = {
  name: "Wool jacket",
  merchant: "Mercari seller",
  productUrl: "https://jp.mercari.com/item/m123",
  condition: "Bekas baik",
  variant: "M / hitam",
  quantity: 1,
  unitJpy: 1000,
  rateIdr: 114,
  unitIdr: 114000,
  domesticIdr: 10000,
  feeIdr: 15000,
  shippingIdr: 60000,
  note: "Stok sudah diperiksa",
};
const request: DiscoveryRequest = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sourceUrl: offer.productUrl,
  note: "Cari jaket ukuran M",
  analysis: null,
  analysisError: null,
  status: "OFFERED",
  version: 3,
  hasPhoto: false,
  photoUrl: null,
  createdAt: new Date().toISOString(),
  offer,
  offerExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  orderId: null,
  events: [],
};
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mock.navigate,
}));
vi.mock("@/lib/shopper-discovery.fn", () => ({
  getAdminDiscovery: async () => ({
    config: {
      enabled: true,
      photoEnabled: true,
      dailyLimit: 10,
      photoDailyLimit: 5,
      dailyAiRequests: 20,
    },
    version: 2,
    requests: [request],
    rateIdr: 114,
    aiReady: true,
  }),
  runAdminDiscoveryAction: mock.admin,
  saveAdminDiscoverySettings: mock.save,
  getMyDiscoveryRequests: async () => [request],
  runCustomerDiscoveryAction: mock.customer,
  acceptDiscoveryQuote: mock.accept,
}));
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
}));
import { AdminShopperDiscovery } from "@/components/shopper/admin-shopper-discovery";
import { ShopperRequests } from "@/components/shopper/shopper-requests";
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mock.admin.mockResolvedValue({ ok: true });
  mock.accept.mockResolvedValue({ orderId: "order-id", paymentUrl: null, error: null });
});
describe("request operations", () => {
  it("publishes Admin's verified JPY quote with the request version", async () => {
    render(<AdminShopperDiscovery />);
    fireEvent.click(await screen.findByRole("button", { name: /Wool jacket/ }));
    fireEvent.change(screen.getByLabelText("Pesan untuk pelanggan / alasan tindakan"), {
      target: { value: "Barang dan penjual sudah diperiksa" },
    });
    fireEvent.change(screen.getByLabelText("Harga toko satuan (JPY)"), {
      target: { value: "2000" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Saya sudah memeriksa/ }));
    fireEvent.click(screen.getByRole("button", { name: "Kirim penawaran untuk disetujui" }));
    await vi.waitFor(() => expect(mock.admin).toHaveBeenCalled());
    expect(mock.admin.mock.calls[0]?.[0].data).toMatchObject({
      expectedVersion: 3,
      verifiedJapan: true,
      action: "offer",
      offer: { unitJpy: 2000, unitIdr: 228000, rateIdr: 114 },
    });
  });
  it("requires customer approval and forwards the exact offer version plus address", async () => {
    render(<ShopperRequests />);
    fireEvent.click(await screen.findByRole("button", { name: /Wool jacket/ }));
    const pay = screen.getByRole("button", { name: "Setujui & lanjut pembayaran" });
    expect(pay).toBeDisabled();
    for (const [label, value] of [
      ["Nama penerima", "Test Customer"],
      ["WhatsApp", "628123456789"],
      ["Alamat lengkap", "Jalan Contoh Nomor 10"],
      ["Kota", "Bandung"],
      ["Kode pos", "40111"],
    ])
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Saya menyetujui/ }));
    fireEvent.click(pay);
    await vi.waitFor(() => expect(mock.navigate).toHaveBeenCalled());
    expect(mock.accept.mock.calls[0]?.[0].data).toMatchObject({
      id: request.id,
      expectedVersion: 3,
      address: { recipientName: "Test Customer", city: "Bandung" },
    });
    expect(mock.accept.mock.calls[0]?.[0].data.customer_auth_subject).toBeUndefined();
  });
});
