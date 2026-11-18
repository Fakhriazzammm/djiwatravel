import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mock = vi.hoisted(() => ({
  scan: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  depart: vi.fn(),
  arrive: vi.fn(),
  unload: vi.fn(),
  problem: vi.fn(),
  order: vi.fn(),
  action: vi.fn(),
  queue: vi.fn(),
}));
vi.mock("@/lib/shipping-ops.fn", () => ({
  scanOps: mock.scan,
  listBatches: mock.list,
  createBatch: mock.create,
  getBatch: mock.get,
  departBatch: mock.depart,
  arriveBatch: mock.arrive,
  unloadFromBatch: mock.unload,
  markShippingProblem: mock.problem,
  getOpsOrder: mock.order,
  listHubQueue: mock.queue,
}));
vi.mock("@/lib/shipping.fn", () => ({ runAdminShippingAction: mock.action }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ShippingOpsApp } from "@/components/shipping/ops/ops-app";
import type { OpsMe } from "@/components/shipping/ops/ops-types";

const config = {
  dropPoint: {
    name: "Djiwa Tasikmalaya",
    address: "Jl. Bojong Tengah",
    hours: "09.00",
    mapUrl: "",
  },
  hubs: {
    BANDUNG: { name: "Gudang Djiwa Bandung", address: "Bandung" },
    JAKARTA: { name: "Hub Djiwa Jakarta", address: "Jakarta" },
  },
  eta: { toBandungDays: 1, toJakartaDays: 1, toJapanMinDays: 5, toJapanMaxDays: 7 },
  transport: ["Mobil Djiwa", "Ekspedisi"],
  couriers: ["Partner Djiwa"],
};
const me = (hubs: OpsMe["hubs"], isAdmin = false): OpsMe => ({
  signedIn: true,
  registered: true,
  email: "p@x.co",
  name: "Asep",
  isAdmin,
  hubs,
  config,
});

const order = (status: string, extra: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-000000000042",
  code: "DJW-KR-0042",
  status,
  statusLabel: status,
  recipientName: "Rina Tanaka",
  prefecture: "Tokyo",
  contents: "Makanan kering: Keripik",
  estimatedKg: 2,
  billedKg: 2.5,
  photoCount: 1,
  photoShort: false,
  photoReview: "PENDING",
  currentHub: null,
  batchCode: null,
  problemNote: null,
  sinceAt: null,
  here: "TASIK",
  ...extra,
});
const parcel = (outcome: string, status: string, extra: Record<string, unknown> = {}) => ({
  found: true,
  kind: "parcel",
  outcome,
  message: null,
  order: order(status),
  ...extra,
});

const emptyList = { open: [], incoming: [], outgoing: [], recent: [] };

beforeEach(() => {
  mock.queue.mockResolvedValue([]);
  mock.list.mockResolvedValue({ open: [], incoming: [], outgoing: [], recent: [] });
});

afterEach(() => {
  cleanup();
  Object.values(mock).forEach((m) => m.mockReset());
  try {
    window.localStorage.clear();
  } catch {
    /* jsdom storage may be unavailable */
  }
});

const type = (value: string) => {
  fireEvent.change(screen.getByLabelText("Kode pengiriman"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Cari" }));
};
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

describe("field app: hubs and scan modes", () => {
  it("shows only the hubs the account works at, and each hub has its own modes", () => {
    render(<ShippingOpsApp me={me(["BANDUNG", "JAKARTA"])} initialCode={null} />);
    expect(screen.queryByRole("tab", { name: "Tasikmalaya" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Bandung", selected: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Check-in" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Muat ke Jakarta" })).toBeTruthy();
    tab("Jakarta");
    expect(screen.getByRole("tab", { name: "Serah ke Jepang" })).toBeTruthy();
  });

  it("checks a parcel in at Bandung and says how far the batch is", async () => {
    mock.scan.mockResolvedValue(
      parcel("checked_in", "AT_BANDUNG", {
        progress: { checked: 9, total: 14 },
        batchCode: "BCH-0007",
      }),
    );
    render(<ShippingOpsApp me={me(["BANDUNG"])} initialCode={null} />);
    type("DJW-KR-0042");
    expect(await screen.findByText("Check-in di Bandung")).toBeTruthy();
    expect(mock.scan).toHaveBeenCalledWith({
      data: { code: "DJW-KR-0042", hub: "BANDUNG", mode: "checkin" },
    });
    expect(screen.getByText(/9 dari 14 paket di batch ini sudah ter-scan/)).toBeTruthy();
  });

  it("receives at Tasikmalaya and opens the weigh form in one tap", async () => {
    mock.scan.mockResolvedValue(parcel("received", "RECEIVED"));
    mock.order.mockResolvedValue({
      ...order("RECEIVED"),
      rateIdrPerKg: 150000,
      minKg: 1,
      roundKg: 0.5,
      proofPhotoIds: [],
      photoIds: [],
      minPhotos: 1,
    });
    render(<ShippingOpsApp me={me(["TASIK"])} initialCode={null} />);
    type("DJW-KR-0042");
    expect(await screen.findByText("Diterima di Tasikmalaya")).toBeTruthy();
    expect(mock.scan).toHaveBeenCalledWith({
      data: { code: "DJW-KR-0042", hub: "TASIK", mode: "receive" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Timbang sekarang" }));
    const weight = await screen.findByPlaceholderText("2,4");
    fireEvent.change(weight, { target: { value: "2,4" } });
    expect(screen.getByText(/dibulatkan 2,5 kg/)).toBeTruthy();
    expect(screen.getByText("Total Rp375.000")).toBeTruthy();
    mock.action.mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: "Kirim tagihan" }));
    await waitFor(() =>
      expect(mock.action).toHaveBeenCalledWith({
        data: {
          orderId: "00000000-0000-4000-8000-000000000042",
          action: "bill",
          weighedKg: 2.4,
          packingIdr: 0,
        },
      }),
    );
  });

  it("explains a refused load instead of failing silently", async () => {
    mock.list.mockResolvedValue(emptyList);
    mock.scan.mockResolvedValue(
      parcel("not_ready", "RECEIVED", { message: "Belum dibayar, belum boleh dimuat" }),
    );
    render(<ShippingOpsApp me={me(["TASIK"])} initialCode={null} />);
    tab("Muat ke Bandung");
    expect(screen.getByText(/Belum ada batch terbuka/)).toBeTruthy();
    type("DJW-KR-0042");
    expect(await screen.findByText("Belum bisa dimuat")).toBeTruthy();
    expect(screen.getByText("Belum dibayar, belum boleh dimuat")).toBeTruthy();
  });
});

describe("field app: batches", () => {
  const batchFull = (extra: Record<string, unknown> = {}) => ({
    id: "11111111-1111-4111-8111-111111111111",
    code: "BCH-0007",
    fromHub: "TASIK",
    toHub: "BANDUNG",
    status: "OPEN",
    carrier: "Mobil Djiwa",
    tracking: null,
    partnerKg: null,
    note: null,
    createdBy: "Asep",
    departedAt: null,
    arrivedAt: null,
    createdAt: "2026-11-20T03:00:00.000Z",
    total: 2,
    checked: 0,
    kg: 4.6,
    items: [
      {
        id: "a",
        code: "DJW-KR-0042",
        recipientName: "Rina T.",
        city: "Shibuya-ku, Tokyo",
        contents: "Makanan",
        kg: 2.5,
        status: "PAID",
        checked: false,
      },
      {
        id: "b",
        code: "DJW-KR-0044",
        recipientName: "Kenji S.",
        city: "Osaka",
        contents: "Pakaian",
        kg: 2.1,
        status: "PAID",
        checked: false,
      },
    ],
    ...extra,
  });

  it("opens a batch, loads by scan with its id, and sends it off with one tap", async () => {
    mock.list.mockResolvedValue(emptyList);
    mock.create.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", code: "BCH-0007" });
    mock.get.mockResolvedValue(batchFull());
    render(<ShippingOpsApp me={me(["TASIK"])} initialCode={null} />);
    tab("Batch");
    fireEvent.click(await screen.findByRole("button", { name: "Buka batch" }));
    await waitFor(() =>
      expect(mock.create).toHaveBeenCalledWith({
        data: { fromHub: "TASIK", carrier: "Mobil Djiwa" },
      }),
    );
    expect(await screen.findByText("BCH-0007")).toBeTruthy();
    expect(screen.getByText(/2 paket · 4,6 kg/)).toBeTruthy();

    // scan loads into this batch
    fireEvent.click(screen.getByRole("button", { name: "Lanjut scan muat" }));
    expect(screen.getByText(/Memuat ke BCH-0007/)).toBeTruthy();
    mock.scan.mockResolvedValue(
      parcel("loaded", "PAID", { batchCode: "BCH-0007", loaded: { total: 3, kg: 6.6 } }),
    );
    type("DJW-KR-0050");
    expect(await screen.findByText("Dimuat ke BCH-0007")).toBeTruthy();
    expect(mock.scan).toHaveBeenCalledWith({
      data: {
        code: "DJW-KR-0050",
        hub: "TASIK",
        mode: "load",
        batchId: "11111111-1111-4111-8111-111111111111",
      },
    });

    // depart from the batch screen (the list shows the open batch)
    mock.list.mockResolvedValue({ ...emptyList, open: [{ ...batchFull(), items: undefined }] });
    tab("Batch");
    fireEvent.click(await screen.findByRole("button", { name: /BCH-0007/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Berangkat (2 paket)" }));
    mock.depart.mockResolvedValue({ ok: true, count: 2, status: "TO_BANDUNG" });
    await waitFor(() =>
      expect(mock.depart).toHaveBeenCalledWith({
        data: { batchId: "11111111-1111-4111-8111-111111111111" },
      }),
    );
  });

  it("closes the receiving end: all fine in one tap, or flags the missing with a note", async () => {
    const incoming = batchFull({
      status: "DEPARTED",
      checked: 1,
      items: [
        {
          id: "a",
          code: "DJW-KR-0042",
          recipientName: "Rina T.",
          city: "Tokyo",
          contents: "M",
          kg: 2.5,
          status: "TO_BANDUNG",
          checked: true,
        },
        {
          id: "b",
          code: "DJW-KR-0049",
          recipientName: "Kenji S.",
          city: "Osaka",
          contents: "P",
          kg: 1.1,
          status: "TO_BANDUNG",
          checked: false,
        },
      ],
    });
    mock.list.mockResolvedValue({
      ...emptyList,
      incoming: [{ ...incoming, items: undefined }],
    });
    mock.get.mockResolvedValue(incoming);
    mock.arrive.mockResolvedValue({ ok: true, count: 1 });
    render(<ShippingOpsApp me={me(["BANDUNG"])} initialCode={null} />);
    tab("Batch");
    fireEvent.click(await screen.findByRole("button", { name: /BCH-0007/ }));
    expect(await screen.findByText(/1 paket belum ter-scan: DJW-KR-0049/)).toBeTruthy();

    // the finish button needs a note first
    const finish = screen.getByRole("button", { name: "Selesai bongkar, tandai yang hilang" });
    expect((finish as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Catatan paket tidak ada"), {
      target: { value: "Tidak ada di mobil" },
    });
    fireEvent.click(finish);
    await waitFor(() =>
      expect(mock.arrive).toHaveBeenCalledWith({
        data: {
          batchId: "11111111-1111-4111-8111-111111111111",
          mode: "finish",
          note: "Tidak ada di mobil",
        },
      }),
    );
  });

  it("makes the Japan hand-over ask for the master receipt, and arrival there is Admin's", async () => {
    const jp = batchFull({
      fromHub: "JAKARTA",
      toHub: "JAPAN",
      carrier: "Partner Djiwa",
      total: 1,
      items: [batchFull().items[0]],
    });
    mock.list.mockResolvedValue({ ...emptyList, open: [{ ...jp, items: undefined }] });
    mock.get.mockResolvedValue(jp);
    render(<ShippingOpsApp me={me(["JAKARTA"])} initialCode={null} />);
    tab("Batch");
    fireEvent.click(await screen.findByRole("button", { name: /BCH-0007/ }));
    expect(await screen.findByText("Resi master")).toBeTruthy();
    expect(screen.getByLabelText(/Berat partner/)).toBeTruthy();
    cleanup();

    mock.get.mockResolvedValue({ ...jp, status: "DEPARTED", tracking: "EE99ID" });
    mock.list.mockResolvedValue({
      ...emptyList,
      outgoing: [{ ...jp, status: "DEPARTED", items: undefined }],
    });
    render(<ShippingOpsApp me={me(["JAKARTA"])} initialCode={null} />);
    tab("Batch");
    fireEvent.click(await screen.findByRole("button", { name: /BCH-0007/ }));
    expect(await screen.findByText("Tiba di Jepang dicatat oleh Admin.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tiba di Jepang (semua paket)" })).toBeNull();
    cleanup();

    mock.list.mockResolvedValue({
      ...emptyList,
      outgoing: [{ ...jp, status: "DEPARTED", items: undefined }],
    });
    render(<ShippingOpsApp me={me(["TASIK", "BANDUNG", "JAKARTA"], true)} initialCode={null} />);
    tab("Jakarta");
    tab("Batch");
    fireEvent.click(await screen.findByRole("button", { name: /BCH-0007/ }));
    expect(
      await screen.findByRole("button", { name: "Tiba di Jepang (semua paket)" }),
    ).toBeTruthy();
    void within;
  });
});

describe("field app: bottom bar", () => {
  const queueItem = (status: string, code: string, extra: Record<string, unknown> = {}) => ({
    id: `id-${code}`,
    code,
    status,
    statusLabel: status,
    recipientName: "Rina Tanaka",
    prefecture: "Tokyo",
    contents: "Makanan kering: Keripik",
    kg: 2.5,
    updatedAt: "2026-11-20T03:00:00.000Z",
    openBatchCode: null,
    ...extra,
  });

  it("has the four buttons for this screen only, and Scan is home", () => {
    render(<ShippingOpsApp me={me(["TASIK"])} initialCode={null} />);
    const bar = screen.getByRole("navigation", { name: "Menu petugas" });
    expect(
      within(bar)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Scan", "Antrian", "Batch", "Lainnya"]);
    expect(within(bar).getByRole("tab", { name: "Scan", selected: true })).toBeTruthy();
  });

  it("badges what needs attention: the to-do list and batches on their way here", async () => {
    mock.queue.mockResolvedValue([
      queueItem("RECEIVED", "DJW-KR-0001"),
      queueItem("PAID", "DJW-KR-0002"),
      queueItem("PAYMENT_PENDING", "DJW-KR-0003"), // waiting for the customer: not a task
    ]);
    mock.list.mockResolvedValue({
      open: [],
      incoming: [
        {
          id: "b1",
          code: "BCH-0001",
          fromHub: "TASIK",
          toHub: "BANDUNG",
          status: "DEPARTED",
          carrier: "x",
          tracking: null,
          partnerKg: null,
          note: null,
          createdBy: "a",
          departedAt: null,
          arrivedAt: null,
          createdAt: "2026-11-20T03:00:00.000Z",
          total: 1,
          checked: 0,
          kg: 2,
        },
      ],
      outgoing: [],
      recent: [],
    });
    render(<ShippingOpsApp me={me(["BANDUNG"])} initialCode={null} />);
    expect(await screen.findByRole("tab", { name: "Batch, 1 perlu perhatian" })).toBeTruthy();
    expect(await screen.findByRole("tab", { name: "Antrian, 2 perlu perhatian" })).toBeTruthy();
  });

  it("shows the hub's to-do list with the one button that fits each parcel", async () => {
    mock.queue.mockResolvedValue([
      queueItem("AWAITING_DROP", "DJW-KR-0001"),
      queueItem("RECEIVED", "DJW-KR-0002"),
      queueItem("PAID", "DJW-KR-0003"),
      queueItem("PAYMENT_PENDING", "DJW-KR-0004"),
    ]);
    render(<ShippingOpsApp me={me(["TASIK"])} initialCode={null} />);
    tab("Antrian");
    expect(await screen.findByText("Akan datang · 1")).toBeTruthy();
    expect(screen.getByText("Perlu ditimbang · 1")).toBeTruthy();
    expect(screen.getByText("Menunggu pembayaran · 1")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Terima" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Timbang" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Muat" })).toHaveLength(1);

    // receive without the camera
    mock.scan.mockResolvedValue(parcel("received", "RECEIVED"));
    fireEvent.click(screen.getByRole("button", { name: "Terima" }));
    await waitFor(() =>
      expect(mock.scan).toHaveBeenCalledWith({
        data: { code: "DJW-KR-0001", hub: "TASIK", mode: "receive" },
      }),
    );

    // loading needs an open batch first
    fireEvent.click(screen.getByRole("button", { name: "Muat" }));
    expect(mock.scan).toHaveBeenCalledTimes(1);
  });

  it("checks in an incoming parcel from the list when the QR is unreadable", async () => {
    mock.queue.mockResolvedValue([queueItem("TO_BANDUNG", "DJW-KR-0007")]);
    mock.scan.mockResolvedValue(parcel("checked_in", "AT_BANDUNG"));
    render(<ShippingOpsApp me={me(["BANDUNG"])} initialCode={null} />);
    tab("Antrian");
    expect(await screen.findByText("Dalam perjalanan ke sini · 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check-in" }));
    await waitFor(() =>
      expect(mock.scan).toHaveBeenCalledWith({
        data: { code: "DJW-KR-0007", hub: "BANDUNG", mode: "checkin" },
      }),
    );
  });

  it("Lainnya: staff get Keluar, Admin gets the way back to the other Kirim Barang tabs", () => {
    const { unmount } = render(<ShippingOpsApp me={me(["TASIK"])} initialCode={null} />);
    tab("Lainnya");
    expect(screen.getByText("p@x.co · Petugas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keluar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Akun petugas" })).toBeNull();
    unmount();

    const onAdminTab = vi.fn();
    render(
      <ShippingOpsApp
        me={me(["TASIK", "BANDUNG", "JAKARTA"], true)}
        initialCode={null}
        onAdminTab={onAdminTab}
      />,
    );
    tab("Lainnya");
    expect(screen.queryByRole("button", { name: "Keluar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Akun petugas" }));
    expect(onAdminTab).toHaveBeenCalledWith("staff");
    fireEvent.click(screen.getByRole("button", { name: "Pengaturan" }));
    expect(onAdminTab).toHaveBeenCalledWith("settings");
  });

  it("stops the camera screen when you leave Scan, and Scan comes back in the hub's first mode", () => {
    render(<ShippingOpsApp me={me(["TASIK"])} initialCode={null} />);
    expect(screen.getByLabelText("Kode pengiriman")).toBeTruthy();
    tab("Antrian");
    expect(screen.queryByLabelText("Kode pengiriman")).toBeNull();
    tab("Scan");
    expect(screen.getByRole("tab", { name: "Terima", selected: true })).toBeTruthy();
  });
});
