import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { deleteExpense, postExpense } from "@/lib/my-trips.fn";
import { getReceiptFxRate, saveScannedExpenses } from "@/lib/receipt-scan.fn";
import type { ReceiptScanResponse, ReceiptScanStatus } from "@/lib/receipt-scan";

vi.mock("@/lib/my-trips.fn", () => ({
  deleteExpense: vi.fn(async () => ({})),
  postExpense: vi.fn(async () => ({ id: "exp-manual" })),
}));
vi.mock("@/lib/receipt-scan.fn", () => ({
  getReceiptFxRate: vi.fn(async () => ({
    rate: 101,
    rateDate: "2026-11-04",
    source: "ECB via Frankfurter",
  })),
  saveScannedExpenses: vi.fn(async () => ({ expenseIds: ["e1", "e2"] })),
}));
vi.mock("@/lib/receipt-image", async (original) => ({
  ...(await original<typeof import("@/lib/receipt-image")>()),
  compressReceiptPhoto: vi.fn(async (blob: Blob) => blob),
}));
vi.mock("@/lib/receipt-queue-store", () => ({
  saveQueuedReceipt: vi.fn(async () => null),
  removeQueuedReceipt: vi.fn(async () => null),
  loadQueuedReceipts: vi.fn(async () => []),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

type SavedPayload = { tripId: string; items: Record<string, unknown>[] };
const savedPayload = () =>
  (vi.mocked(saveScannedExpenses).mock.calls[0]![0] as unknown as { data: SavedPayload }).data;
const status: ReceiptScanStatus = {
  available: true,
  savePhoto: true,
  maxPhotos: 3,
  maxMb: 6,
  dailyLimit: 30,
  remaining: 12,
};
const categories = [
  { id: "cat-food", name: "Food & Drinks" },
  { id: "cat-shop", name: "Shopping" },
];
const today = new Date();
const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

const ready = (
  scanId: string,
  merchant: string,
  total: number,
  items: { name: string; amount: number }[],
  over: Record<string, unknown> = {},
): ReceiptScanResponse => ({
  ok: true,
  scanId,
  status: "ready",
  read: {
    isReceipt: true,
    readable: true,
    merchant,
    date: day,
    currency: "JPY",
    total,
    items,
    categoryGuess: null,
    uncertain: [],
    region: null,
    reason: null,
    ...over,
  },
  validation: { itemsSum: total, difference: 0, matches: true, issues: [], status: "ready" },
  categoryId: "cat-food",
  photoStored: true,
  escalated: false,
  remaining: 10,
});

let replies: ReceiptScanResponse[] = [];

beforeEach(() => {
  replies = [];
  let n = 0;
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: vi.fn(() => `blob:${n++}`), revokeObjectURL: vi.fn() }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(replies.shift()), { status: 200 })),
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const file = (name: string) =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });
const renderScanner = (over: Partial<Parameters<typeof ReceiptScanner>[0]> = {}) => {
  const onClose = vi.fn();
  const onChanged = vi.fn(async () => undefined);
  render(
    <ReceiptScanner
      tripId="11111111-1111-4111-8111-111111111111"
      tripCurrency="IDR"
      categories={categories}
      status={status}
      budget={{ budgetMinor: 1_000_000_000, spentMinor: 40_000_000 }}
      onClose={onClose}
      onChanged={onChanged}
      {...over}
    />,
  );
  return { onClose, onChanged };
};
const addFiles = async (...names: string[]) => {
  await act(async () => {
    fireEvent.change(await screen.findByTestId("receipt-gallery-input"), {
      target: { files: names.map(file) },
    });
  });
};

describe("ReceiptScanner (prototype 2 to 6)", () => {
  it("falls back to the gallery when the camera is not available", async () => {
    renderScanner();
    expect(await screen.findByText("Kamera belum diizinkan")).toBeTruthy();
    expect(screen.getByText("Pilih dari galeri")).toBeTruthy();
    expect(screen.getByLabelText("Ambil foto")).toHaveProperty("disabled", true);
  });

  it("reads photos in the background and shows the queue", async () => {
    replies = [
      ready("s1", "Fuglen Tokyo", 1480, [
        { name: "Cold brew", amount: 680 },
        { name: "Cheesecake", amount: 800 },
      ]),
      ready("s2", "Lawson Shibuya", 640, [
        { name: "A", amount: 220 },
        { name: "B", amount: 180 },
        { name: "C", amount: 240 },
      ]),
    ];
    renderScanner();
    await addFiles("a.jpg", "b.jpg");
    fireEvent.click(await screen.findByText("Selesai · 2"));
    expect(await screen.findByText("Struk perjalanan")).toBeTruthy();
    expect(await screen.findByText("2 dari 2")).toBeTruthy();
    expect(screen.getByText("Fuglen Tokyo")).toBeTruthy();
    expect(screen.getAllByText("Siap")).toHaveLength(2);
    expect(screen.getByText("Tinjau 2 yang siap")).toBeTruthy();
  });

  it("reviews, fixes a missed item, saves everything and can undo", async () => {
    replies = [
      ready("s1", "Fuglen Tokyo", 1480, [
        { name: "Cold brew", amount: 680 },
        { name: "Cheesecake", amount: 800 },
      ]),
      {
        ...ready("s2", "Ichiran Shibuya", 1290, [
          { name: "Ramen", amount: 890 },
          { name: "Telur", amount: 280 },
        ]),
        status: "check",
        validation: {
          itemsSum: 1170,
          difference: 120,
          matches: false,
          issues: ["Jumlah item tidak sama dengan total"],
          status: "check",
        },
      } as ReceiptScanResponse,
    ];
    const { onClose, onChanged } = renderScanner();
    await addFiles("a.jpg", "b.jpg");
    fireEvent.click(await screen.findByText("Selesai · 2"));
    fireEvent.click(await screen.findByText("Tinjau 2 yang siap"));

    expect(await screen.findByText("Tinjau 2 struk")).toBeTruthy();
    expect(screen.getByText("¥680 + ¥800 = ¥1.480, cocok dengan total")).toBeTruthy();
    expect(screen.getByText(/Item ¥1\.170, total ¥1\.290\. Selisih ¥120/)).toBeTruthy();
    expect(screen.getByText("Simpan foto struk")).toBeTruthy();

    // the doubtful receipt: open it, add the missed item
    fireEvent.click(screen.getByText("Cek"));
    expect(await screen.findByText("Cek item")).toBeTruthy();
    expect(screen.getByText("Selisih ¥120")).toBeTruthy();
    fireEvent.click(screen.getByText("Item terlewat? Tambah"));
    await waitFor(() => expect(screen.getByText("Cocok dengan total")).toBeTruthy());
    fireEvent.click(screen.getByText("Selesai cek"));

    fireEvent.click(await screen.findByText("Simpan semua"));
    await waitFor(() => expect(saveScannedExpenses).toHaveBeenCalledTimes(1));
    const payload = savedPayload();
    expect(payload.tripId).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]).toMatchObject({
      scanId: "s1",
      description: "Fuglen Tokyo",
      originalAmountMinor: 148000,
      originalCurrency: "JPY",
      exchangeRate: 101,
      convertedAmountMinor: 14948000,
      convertedCurrency: "IDR",
      categoryId: "cat-food",
      keepPhoto: true,
      edited: false,
    });
    expect(payload.items[1]).toMatchObject({
      scanId: "s2",
      edited: true,
      originalAmountMinor: 129000,
    });
    expect(getReceiptFxRate).toHaveBeenCalledWith({ data: { from: "JPY", to: "IDR", date: day } });

    expect(await screen.findByText("2 pengeluaran tersimpan")).toBeTruthy();
    expect(screen.getByText("Foto struk terlampir di tiap catatan")).toBeTruthy();
    expect(onChanged).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Batalkan"));
    await waitFor(() => expect(deleteExpense).toHaveBeenCalledTimes(2));
    expect(deleteExpense).toHaveBeenCalledWith({ data: { id: "e1" } });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("drops the photo when the traveler turns 'Simpan foto struk' off", async () => {
    replies = [ready("s1", "Lawson", 640, [{ name: "A", amount: 640 }])];
    renderScanner();
    await addFiles("a.jpg");
    fireEvent.click(await screen.findByText("Selesai · 1"));
    fireEvent.click(await screen.findByText("Tinjau 1 yang siap"));
    fireEvent.click(await screen.findByLabelText("Simpan foto struk"));
    fireEvent.click(screen.getByText("Simpan semua"));
    await waitFor(() => expect(saveScannedExpenses).toHaveBeenCalled());
    expect(savedPayload().items[0]!["keepPhoto"]).toBe(false);
  });

  it("skips a receipt from the review and does not save it", async () => {
    replies = [
      ready("s1", "A", 100, [{ name: "x", amount: 100 }]),
      ready("s2", "B", 200, [{ name: "y", amount: 200 }]),
    ];
    renderScanner();
    await addFiles("a.jpg", "b.jpg");
    fireEvent.click(await screen.findByText("Selesai · 2"));
    fireEvent.click(await screen.findByText("Tinjau 2 yang siap"));
    const cards = await screen.findAllByTestId("review-card");
    fireEvent.click(within(cards[1]!).getByText("Lewati struk ini"));
    expect(await screen.findByText("Dilewati, tidak ikut disimpan")).toBeTruthy();
    fireEvent.click(screen.getByText("Simpan semua"));
    await waitFor(() => expect(saveScannedExpenses).toHaveBeenCalled());
    expect(savedPayload().items).toHaveLength(1);
  });

  it("offers retake or manual entry for an unreadable photo and a skip for a non-receipt", async () => {
    replies = [
      {
        ok: true,
        scanId: "s1",
        status: "unreadable",
        read: null,
        validation: null,
        categoryId: null,
        photoStored: false,
        escalated: false,
        remaining: 9,
      },
      {
        ok: true,
        scanId: "s2",
        status: "not_receipt",
        read: null,
        validation: null,
        categoryId: null,
        photoStored: false,
        escalated: false,
        remaining: 8,
      },
    ];
    renderScanner();
    await addFiles("a.jpg", "b.jpg");
    fireEvent.click(await screen.findByText("Selesai · 2"));
    expect(await screen.findByText("Kurang jelas")).toBeTruthy();
    expect(screen.getByText("Bukan struk")).toBeTruthy();
  });

  it("limits photos per session and reports the daily limit", async () => {
    const { toast } = await import("sonner");
    replies = [
      ready("s1", "A", 1, [{ name: "x", amount: 1 }]),
      ready("s2", "B", 1, [{ name: "x", amount: 1 }]),
      ready("s3", "C", 1, [{ name: "x", amount: 1 }]),
    ];
    renderScanner();
    await addFiles("1.jpg", "2.jpg", "3.jpg", "4.jpg");
    expect(toast.message).toHaveBeenCalledWith(expect.stringContaining("3 foto pertama"));
    expect(await screen.findByText("Selesai · 3")).toBeTruthy();
  });

  it("keeps a photo for later when the phone has no signal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    renderScanner();
    await addFiles("a.jpg");
    fireEvent.click(await screen.findByText("Selesai · 1"));
    expect(await screen.findByText("Menunggu sinyal")).toBeTruthy();
    expect(screen.getByText(/menunggu sinyal\. Foto tersimpan di perangkat/)).toBeTruthy();
  });

  it("lets the traveler fill a failed read by hand and saves it through the normal expense call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, code: "unavailable", message: "gagal" }), {
            status: 500,
          }),
      ),
    );
    renderScanner();
    await addFiles("a.jpg");
    fireEvent.click(await screen.findByText("Selesai · 1"));
    fireEvent.click(await screen.findByText("Tinjau struk bermasalah"));
    expect(await screen.findByText("Struk belum terbaca")).toBeTruthy();
    fireEvent.click(screen.getByText("Isi manual"));
    fireEvent.change(await screen.findByLabelText("Toko"), { target: { value: "Warung Bu Tini" } });
    fireEvent.change(screen.getByLabelText("Total struk"), { target: { value: "25000" } });
    fireEvent.click(screen.getByText("Selesai cek"));
    fireEvent.click(await screen.findByText("Simpan semua"));
    await waitFor(() => expect(postExpense).toHaveBeenCalledTimes(1));
    expect(
      (vi.mocked(postExpense).mock.calls[0]![0] as unknown as { data: object }).data,
    ).toMatchObject({
      description: "Warung Bu Tini",
      originalAmountMinor: 2_500_000,
      originalCurrency: "IDR",
      convertedAmountMinor: 2_500_000,
      convertedCurrency: "IDR",
    });
    expect(saveScannedExpenses).not.toHaveBeenCalled();
  });
});
