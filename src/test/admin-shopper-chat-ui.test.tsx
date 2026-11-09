import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { chatStage } from "@/lib/shopper-chat";

// Role queries over a full inbox are slow in jsdom, especially while the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });

const mock = vi.hoisted(() => ({
  list: vi.fn(),
  thread: vi.fn(),
  send: vi.fn(),
  assign: vi.fn(),
  close: vi.fn(),
  discovery: vi.fn(),
  runAdmin: vi.fn(),
  save: vi.fn(),
}));

const THREAD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const summary = (over = {}) => ({
  id: THREAD_ID,
  kind: "REQUEST" as const,
  title: "Poster A3",
  stage: chatStage({ kind: "REQUEST", requestStatus: "SEARCHING", orderStatus: null }),
  lastPreview: "Barangnya sudah terjual",
  lastAt: new Date().toISOString(),
  lastSender: "CUSTOMER" as const,
  unread: 2,
  closed: false,
  requestId: REQUEST_ID,
  orderId: null,
  orderCode: null,
  customerName: "Budi",
  assignee: null,
  dueAt: new Date(Date.now() + 11 * 60_000).toISOString(),
  icon: "link" as const,
  ...over,
});
const listData = {
  threads: [
    summary(),
    summary({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      title: "Tas hitam",
      unread: 0,
      customerName: "Sari",
      dueAt: null,
      stage: chatStage({ kind: "REQUEST", requestStatus: "NEEDS_INFO", orderStatus: null }),
    }),
  ],
  config: {
    replyTargetMinutes: 15,
    openHour: 9,
    closeHour: 21,
    templates: ["Sedang kami cari, kami kabari."],
  },
  shop: { rateIdr: 114, feePercent: 20, shippingIdr: 60000, domesticIdr: 35000 },
  now: new Date().toISOString(),
};
const threadData = (status = "SEARCHING", version = 3) => ({
  thread: summary({ unread: 0 }),
  messages: [
    {
      id: "m1",
      sender: "CUSTOMER",
      senderName: "Budi",
      body: "Barangnya sudah terjual, bisa carikan?",
      internal: false,
      at: new Date(Date.now() - 60_000).toISOString(),
      attachmentUrl: null,
      card: null,
    },
    {
      id: "m2",
      sender: "ADMIN",
      senderName: "Rani",
      body: "Catatan: penjual lain ada",
      internal: true,
      at: new Date().toISOString(),
      attachmentUrl: null,
      card: null,
    },
  ],
  request: {
    id: REQUEST_ID,
    status,
    version,
    note: "poster",
    analysis: null,
    sourceUrl: "https://jp.mercari.com/item/m33366240981",
    offer: null,
    offerExpiresAt: null,
    orderId: null,
  },
  now: new Date().toISOString(),
});

vi.mock("@/lib/shopper-chat.fn", () => ({
  getAdminChatList: mock.list,
  getAdminChatThread: mock.thread,
  sendAdminChatMessage: mock.send,
  assignAdminChat: mock.assign,
  closeAdminChat: mock.close,
}));
vi.mock("@/lib/shopper-discovery.fn", () => ({
  getAdminDiscovery: mock.discovery,
  runAdminDiscoveryAction: mock.runAdmin,
  saveAdminDiscoverySettings: mock.save,
}));
vi.mock("@/components/shopper/shopper-viewer", () => ({ ImageViewer: () => null }));
vi.mock("@/components/shopper/shopper-ui", () => ({ ProductImage: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { AdminShopperChat } from "@/components/shopper/admin-shopper-chat";

beforeEach(() => {
  vi.clearAllMocks();
  mock.list.mockResolvedValue(listData);
  mock.thread.mockResolvedValue(threadData());
  mock.send.mockResolvedValue({ messageId: "x" });
  mock.runAdmin.mockResolvedValue({ ok: true });
  mock.discovery.mockResolvedValue({
    config: {
      enabled: true,
      photoEnabled: true,
      dailyLimit: 10,
      photoDailyLimit: 5,
      dailyAiRequests: 20,
      chatEnabled: true,
      replyTargetMinutes: 15,
      openHour: 9,
      closeHour: 21,
      idleCloseDays: 7,
      dailyMessages: 80,
      templates: ["a b"],
    },
    version: 1,
    aiReady: true,
    requests: [],
    rateIdr: 114,
  });
});
afterEach(cleanup);

async function open() {
  render(<AdminShopperChat />);
  fireEvent.click(await screen.findByRole("button", { name: /Budi · Poster A3/ }));
  await screen.findByText("Barangnya sudah terjual, bisa carikan?");
}

describe("admin inbox", () => {
  it("lists the queue with counts and filters it", async () => {
    render(<AdminShopperChat />);
    expect(await screen.findByRole("button", { name: /Budi · Poster A3/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sari · Tas hitam/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Baru 1/ }));
    expect(screen.queryByRole("button", { name: /Sari · Tas hitam/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Menunggu 1/ }));
    expect(screen.getByRole("button", { name: /Sari · Tas hitam/ })).toBeTruthy();
  });

  it("shows the conversation, the tracker and the internal note", async () => {
    await open();
    expect(screen.getByText("Catatan internal")).toBeTruthy();
    expect(screen.getByText(/Tahap: Dicari/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sedang kami cari, kami kabari/ })).toBeTruthy();
  });

  it("replies to the customer and writes internal notes separately", async () => {
    await open();
    const box = screen.getByLabelText("Balas pelanggan");
    fireEvent.change(box, { target: { value: "Kami cek dulu ya." } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    await waitFor(() => expect(mock.send).toHaveBeenCalled());
    expect(mock.send.mock.calls[0]?.[0].data).toEqual({
      threadId: THREAD_ID,
      body: "Kami cek dulu ya.",
      internal: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "Catatan internal" }));
    fireEvent.change(screen.getByLabelText("Catatan internal", { selector: "textarea" }), {
      target: { value: "Cek penjual lain" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    await waitFor(() => expect(mock.send).toHaveBeenCalledTimes(2));
    expect(mock.send.mock.calls[1]?.[0].data).toMatchObject({
      internal: true,
      body: "Cek penjual lain",
    });
  });

  it("changes the stage with the written message and the request version", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Balas pelanggan"), {
      target: { value: "Boleh kirim foto lain?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Minta info" }));
    await waitFor(() => expect(mock.runAdmin).toHaveBeenCalled());
    expect(mock.runAdmin.mock.calls[0]?.[0].data).toMatchObject({
      id: REQUEST_ID,
      expectedVersion: 3,
      action: "ask",
      note: "Boleh kirim foto lain?",
    });
  });

  it("does not move the stage without a message to the customer", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Tidak ditemukan" }));
    expect(mock.runAdmin).not.toHaveBeenCalled();
  });

  it("sends a verified offer with the computed price, fee and the live version", async () => {
    await open();
    const form = screen.getByText("Kirim penawaran").closest("details")!;
    fireEvent.click(screen.getByText("Kirim penawaran"));
    const scope = within(form);
    fireEvent.change(scope.getByLabelText("Kondisi barang"), { target: { value: "Bekas baik" } });
    fireEvent.change(scope.getByLabelText("Ukuran dan warna"), { target: { value: "A3" } });
    fireEvent.change(scope.getByLabelText("Harga toko ¥"), { target: { value: "990" } });
    expect(scope.getByText("Rp 230.460")).toBeTruthy();
    const send = scope.getByRole("button", { name: "Kirim kartu penawaran" });
    expect(send).toBeDisabled();
    fireEvent.click(scope.getByRole("checkbox"));
    fireEvent.click(send);
    await waitFor(() => expect(mock.runAdmin).toHaveBeenCalled());
    expect(mock.runAdmin.mock.calls[0]?.[0].data).toMatchObject({
      id: REQUEST_ID,
      expectedVersion: 3,
      action: "offer",
      verifiedJapan: true,
      expiresHours: 24,
      offer: {
        unitJpy: 990,
        unitIdr: 112860,
        rateIdr: 114,
        feeIdr: 22600,
        domesticIdr: 35000,
        shippingIdr: 60000,
        merchant: "Mercari",
      },
    });
  });

  it("points an ordered request to the orders tab instead of offering actions", async () => {
    mock.thread.mockResolvedValue({
      ...threadData("ORDERED", 5),
      request: { ...threadData().request, status: "ORDERED", orderId: "order-1" },
    });
    await open();
    expect(screen.getByText(/Sudah menjadi pesanan/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mulai cari" })).toBeNull();
  });
});
