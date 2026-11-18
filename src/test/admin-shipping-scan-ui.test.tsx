import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mock = vi.hoisted(() => ({ scan: vi.fn(), act: vi.fn() }));
vi.mock("@/lib/shipping.fn", () => ({
  scanShipping: mock.scan,
  runAdminShippingAction: mock.act,
}));

import { AdminShippingScan } from "@/components/shipping/admin-shipping-scan";

const order = (status: string, extra: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-000000000042",
  code: "DJW-KR-0042",
  status,
  statusLabel: status === "RECEIVED" ? "Diterima di drop point" : "Menunggu diantar",
  recipientName: "Rina Tanaka",
  prefecture: "Tokyo",
  contents: "Makanan kering: Keripik",
  estimatedKg: 2,
  photoCount: 1,
  photoShort: false,
  photoReview: "PENDING",
  receivedAt: null,
  ...extra,
});

afterEach(() => {
  cleanup();
  mock.scan.mockReset();
  mock.act.mockReset();
});

function setup(initialCode: string | null = null) {
  const onOpen = vi.fn();
  const onChanged = vi.fn();
  render(<AdminShippingScan initialCode={initialCode} onOpen={onOpen} onChanged={onChanged} />);
  return { onOpen, onChanged };
}

const type = (value: string) => {
  fireEvent.change(screen.getByLabelText("Kode pengiriman"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Cari" }));
};

describe("Admin scan screen", () => {
  it("falls back to typing when the browser cannot read QR, with the keyboard field ready", () => {
    setup();
    expect(screen.getByLabelText("Kode pengiriman")).toBeTruthy();
    expect(screen.getByText(/Browser ini belum bisa membaca QR/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Terima", selected: true })).toBeTruthy();
  });

  it("receives a parcel from a scan, shows a big result and offers the next move", async () => {
    mock.scan.mockResolvedValue({
      found: true,
      outcome: "received",
      order: order("RECEIVED", { receivedAt: "2026-11-20T03:12:00.000Z" }),
    });
    const { onOpen, onChanged } = setup();
    type("https://djiwatravel.com/admin/shipping?scan=DJW-KR-0042");
    expect(await screen.findByText("Diterima")).toBeTruthy();
    expect(mock.scan).toHaveBeenCalledWith({ data: { code: "DJW-KR-0042", mode: "receive" } });
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByText("DJW-KR-0042")).toBeTruthy();
    expect(screen.getByText(/Pelanggan sudah dikabari/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Timbang sekarang" }));
    expect(onOpen).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000042", "weigh");
  });

  it("undoes a receive in one tap and says so", async () => {
    mock.scan.mockResolvedValue({ found: true, outcome: "received", order: order("RECEIVED") });
    mock.act.mockResolvedValue({ ok: true });
    setup();
    type("DJW-KR-0042");
    fireEvent.click(await screen.findByRole("button", { name: "Urungkan terima" }));
    await waitFor(() => expect(screen.getByText("Penerimaan diurungkan")).toBeTruthy());
    expect(mock.act).toHaveBeenCalledWith({
      data: { orderId: "00000000-0000-4000-8000-000000000042", action: "undo_receive" },
    });
  });

  it("warns on a repeat and on a parcel that must not be processed, and never offers a form", async () => {
    mock.scan.mockResolvedValueOnce({
      found: true,
      outcome: "already",
      order: order("RECEIVED", { receivedAt: "2026-11-20T02:00:00.000Z" }),
    });
    setup();
    type("DJW-KR-0042");
    expect(await screen.findByText("Sudah diterima sebelumnya")).toBeTruthy();
    expect(screen.getByText(/Tidak ada yang diubah/)).toBeTruthy();

    mock.scan.mockResolvedValueOnce({
      found: true,
      outcome: "blocked",
      order: order("REJECTED", { code: "DJW-KR-0043" }),
    });
    type("DJW-KR-0043");
    expect(await screen.findByText("Jangan diproses: ditolak")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Timbang sekarang" })).toBeNull();
  });

  it("reports an unknown code and a QR that is not ours, in plain words", async () => {
    mock.scan.mockResolvedValueOnce({ found: false, reason: "unknown", code: "DJW-KR-9999" });
    setup();
    type("DJW-KR-9999");
    expect(await screen.findByText("Kode tidak ada di sistem")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Scan berikutnya" }));
    type("halo");
    expect(await screen.findByText("QR bukan label Djiwa")).toBeTruthy();
    expect(mock.scan).toHaveBeenCalledTimes(1); // junk never reaches the server
  });

  it("in Timbang mode only looks the parcel up and opens it at the weigh form", async () => {
    mock.scan.mockResolvedValue({ found: true, outcome: "found", order: order("RECEIVED") });
    const { onOpen } = setup();
    fireEvent.click(screen.getByRole("tab", { name: "Timbang" }));
    type("DJW-KR-0042");
    await waitFor(() =>
      expect(onOpen).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000042", "weigh"),
    );
    expect(mock.scan).toHaveBeenCalledWith({ data: { code: "DJW-KR-0042", mode: "lookup" } });
  });

  it("a link from the phone's Camera app only looks up, then waits for one tap", async () => {
    mock.scan.mockResolvedValue({ found: true, outcome: "found", order: order("AWAITING_DROP") });
    const { onChanged } = setup("DJW-KR-0042");
    expect(await screen.findByText("Menunggu diantar")).toBeTruthy();
    expect(mock.scan).toHaveBeenCalledWith({ data: { code: "DJW-KR-0042", mode: "lookup" } });
    expect(onChanged).not.toHaveBeenCalled();

    // One tap on "Terima" then does the receive.
    mock.scan.mockResolvedValue({ found: true, outcome: "received", order: order("RECEIVED") });
    fireEvent.click(screen.getByRole("button", { name: "Terima di drop point" }));
    expect(await screen.findByText("Diterima")).toBeTruthy();
    expect(mock.scan).toHaveBeenLastCalledWith({ data: { code: "DJW-KR-0042", mode: "receive" } });
    expect(onChanged).toHaveBeenCalled();
  });
});
