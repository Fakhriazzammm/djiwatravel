import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { chatStage } from "@/lib/shopper-chat";

// Role queries over a full inbox are slow in jsdom, especially while the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });

const mock = vi.hoisted(() => ({
  thread: vi.fn(),
  list: vi.fn(),
  start: vi.fn(),
  accept: vi.fn(),
  action: vi.fn(),
  navigate: vi.fn(),
  fetch: vi.fn(),
}));

const offer = {
  name: "Wool jacket",
  merchant: "Mercari",
  productUrl: "https://jp.mercari.com/item/m123",
  condition: "Bekas baik",
  variant: "M / hitam",
  quantity: 1,
  unitJpy: 1000,
  rateIdr: 114,
  unitIdr: 114000,
  domesticIdr: 35000,
  feeIdr: 22800,
  shippingIdr: 60000,
  note: "",
};
const THREAD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const stage = chatStage({ kind: "REQUEST", requestStatus: "OFFERED", orderStatus: null });
const summary = {
  id: THREAD_ID,
  kind: "REQUEST" as const,
  title: "Poster A3",
  stage,
  lastPreview: "Penawaran 1 siap",
  lastAt: new Date().toISOString(),
  lastSender: "ADMIN" as const,
  unread: 1,
  closed: false,
  requestId: REQUEST_ID,
  orderId: null,
  orderCode: null,
  customerName: "Budi",
  assignee: "Rani",
  dueAt: null,
  icon: "link" as const,
};
const at = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const data = (over = {}) => ({
  thread: { ...summary, unread: 0 },
  messages: [
    {
      id: "m1",
      sender: "CUSTOMER",
      senderName: "Budi",
      body: "",
      internal: false,
      at: at(30),
      attachmentUrl: null,
      card: {
        type: "request",
        requestId: REQUEST_ID,
        title: "Poster A3",
        note: "",
        sourceUrl: "https://jp.mercari.com/item/m1",
        analysis: null,
        hasPhoto: false,
        photoUrl: null,
      },
    },
    {
      id: "m2",
      sender: "ADMIN",
      senderName: "Rani",
      body: "Ketemu yang sama bagus",
      internal: false,
      at: at(20),
      attachmentUrl: null,
      card: null,
    },
    {
      id: "m3",
      sender: "ADMIN",
      senderName: "Rani",
      body: "",
      internal: false,
      at: at(10),
      attachmentUrl: null,
      card: {
        type: "offer",
        requestId: REQUEST_ID,
        number: 1,
        requestVersion: 4,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        offer,
        state: "open",
      },
    },
  ],
  request: {
    id: REQUEST_ID,
    status: "OFFERED",
    version: 4,
    offerExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    orderId: null,
  },
  promise: "Tim membalas rata-rata 15 mnt · 09.00–21.00 WIB",
  now: new Date().toISOString(),
  ...over,
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mock.navigate,
}));
vi.mock("@/lib/shopper-chat.fn", () => ({
  getMyChatThread: mock.thread,
  listMyChatThreads: mock.list,
  startMyChatThread: mock.start,
  getChatUnread: async () => ({ unread: 0 }),
}));
vi.mock("@/lib/shopper-discovery.fn", () => ({
  acceptDiscoveryQuote: mock.accept,
  runCustomerDiscoveryAction: mock.action,
}));
vi.mock("@/components/customer-auth", () => ({ CustomerAuth: () => <p>Masuk akun</p> }));
vi.mock("@/lib/receipt-image", () => ({ compressReceiptPhoto: async (f: Blob) => f }));
vi.mock("@/components/shell", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BackBar: ({ title, action }: { title?: string; action?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {action}
    </header>
  ),
}));
vi.mock("@/components/shopper/shopper-nav", () => ({ ShopperNav: () => null }));
vi.mock("@/components/shopper/shopper-viewer", () => ({ ImageViewer: () => null }));
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

import { ChatInbox, ChatThread } from "@/components/shopper/shopper-chat";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mock.fetch);
  Element.prototype.scrollTo = () => undefined;
  mock.thread.mockResolvedValue(data());
  mock.accept.mockResolvedValue({ orderId: "order-id", paymentUrl: null, error: null });
  mock.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ messageId: "x" }) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("customer conversation", () => {
  it("shows the tracker, the team's message and the offer card with its total", async () => {
    render(<ChatThread id={THREAD_ID} />);
    expect(await screen.findByText("Ketemu yang sama bagus")).toBeTruthy();
    for (const step of ["Dikirim", "Dicari", "Penawaran", "Bayar"])
      expect(screen.getAllByText(step).length).toBeGreaterThan(0);
    expect(screen.getByText("Penawaran 1")).toBeTruthy();
    expect(screen.getByText("Rp 231.800")).toBeTruthy();
    expect(screen.getByText(/Tahap: Penawaran/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tanya warna" })).toBeTruthy();
  });

  it("needs the shipping address and consent, then forwards the exact request version", async () => {
    render(<ChatThread id={THREAD_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: /Setuju & bayar/ }));
    const pay = screen.getByRole("button", { name: "Setujui & lanjut pembayaran" });
    expect(pay).toBeDisabled();
    for (const [label, value] of [
      ["Nama penerima", "Budi"],
      ["WhatsApp", "628123456789"],
      ["Alamat lengkap", "Jalan Contoh 10"],
      ["Kota", "Bandung"],
      ["Kode pos", "40111"],
    ])
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(pay);
    await waitFor(() => expect(mock.navigate).toHaveBeenCalled());
    expect(mock.accept.mock.calls[0]?.[0].data).toMatchObject({
      id: REQUEST_ID,
      expectedVersion: 4,
      address: { recipientName: "Budi", city: "Bandung" },
    });
  });

  it("sends a quick reply as a message and keeps the offer's expiry out of the way", async () => {
    render(<ChatThread id={THREAD_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tanya warna" }));
    await waitFor(() => expect(mock.fetch).toHaveBeenCalled());
    const [url, init] = mock.fetch.mock.calls[0]!;
    expect(url).toBe("/api/shopper-chat");
    const form = init.body as FormData;
    expect(form.get("threadId")).toBe(THREAD_ID);
    expect(form.get("body")).toBe("Tanya warna");
    expect(String(form.get("clientKey"))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sends typed text with Enter and restores it when the send fails", async () => {
    mock.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Batas pesan harian tercapai." }),
    });
    render(<ChatThread id={THREAD_ID} />);
    const box = await screen.findByLabelText("Tulis pesan");
    fireEvent.change(box, { target: { value: "Apakah ada warna lain?" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(mock.fetch).toHaveBeenCalled());
    await waitFor(() =>
      expect((screen.getByLabelText("Tulis pesan") as HTMLTextAreaElement).value).toBe(
        "Apakah ada warna lain?",
      ),
    );
  });

  it("asks a signed-out visitor to sign in", async () => {
    mock.thread.mockRejectedValue(new Error("Autentikasi diperlukan"));
    render(<ChatThread id={THREAD_ID} />);
    expect(await screen.findByText("Masuk akun")).toBeTruthy();
  });

  it("offers a new offer request when the offer has expired", async () => {
    const expired = data();
    (expired.messages[2] as { card: { state: string } }).card.state = "expired";
    mock.thread.mockResolvedValue(expired);
    render(<ChatThread id={THREAD_ID} />);
    expect(await screen.findByRole("button", { name: "Minta penawaran baru" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Setuju & bayar/ })).toBeNull();
  });
});

describe("customer inbox", () => {
  const other = {
    ...summary,
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    title: "Tas hitam",
    unread: 0,
    icon: "photo" as const,
    stage: chatStage({ kind: "REQUEST", requestStatus: "SEARCHING", orderStatus: null }),
  };
  beforeEach(() => {
    mock.list.mockResolvedValue({
      threads: [summary, other],
      promise: "Tim membalas rata-rata 15 mnt · 09.00–21.00 WIB",
      enabled: true,
    });
  });

  it("lists conversations with their stage and unread badge, and filters them", async () => {
    render(<ChatInbox />);
    expect(await screen.findByText("Poster A3")).toBeTruthy();
    expect(screen.getByText("Tas hitam")).toBeTruthy();
    expect(screen.getByText(/rata-rata 15 mnt/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Perlu dibalas/ }));
    expect(screen.getByText("Poster A3")).toBeTruthy();
    expect(screen.queryByText("Tas hitam")).toBeNull();
  });

  it("starts a new conversation and opens it", async () => {
    mock.start.mockResolvedValue({ threadId: THREAD_ID, requestId: REQUEST_ID });
    render(<ChatInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Pesan baru" }));
    fireEvent.change(screen.getByLabelText("Barang yang dicari"), {
      target: { value: "poster くら寿司 A3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kirim ke tim" }));
    await waitFor(() => expect(mock.navigate).toHaveBeenCalled());
    expect(mock.start.mock.calls[0]?.[0].data).toMatchObject({ text: "poster くら寿司 A3" });
    expect(mock.navigate.mock.calls[0]?.[0]).toMatchObject({
      to: "/titip-belanja/pesan/$id",
      params: { id: THREAD_ID },
    });
  });
});
