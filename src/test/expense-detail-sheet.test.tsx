import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpenseDetailSheet } from "@/components/expense-detail-sheet";
import type { ExpenseDetail } from "@/lib/expense-items";
import { getExpenseDetail, removeExpenseItem, saveExpenseItem } from "@/lib/expense-items.fn";

vi.mock("@/lib/expense-items.fn", () => ({
  getExpenseDetail: vi.fn(),
  saveExpenseItem: vi.fn(),
  removeExpenseItem: vi.fn(),
  updateExpenseInfo: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const detail = (items: ExpenseDetail["items"], total = 203_500): ExpenseDetail => ({
  id: "e1",
  tripId: "t1",
  description: "Notre Socielle",
  transactionDate: "2026-11-04",
  categoryId: null,
  categoryName: "Makan & minum",
  originalCurrency: "IDR",
  originalAmountMinor: total,
  convertedCurrency: "IDR",
  convertedAmountMinor: total,
  exchangeRate: null,
  notes: null,
  receiptScanId: "s1",
  items,
});

const row = {
  id: "e1",
  description: "Notre Socielle",
  converted_amount_minor: 203_500,
  converted_currency: "IDR",
  original_currency: "IDR",
  receipt_scan_id: "s1",
};

const renderSheet = (overrides: Partial<Parameters<typeof ExpenseDetailSheet>[0]> = {}) =>
  render(
    <ExpenseDetailSheet
      row={row}
      tripCurrency="IDR"
      categories={[]}
      onClose={vi.fn()}
      onChanged={vi.fn(async () => {})}
      onShowPhoto={vi.fn()}
      onDelete={vi.fn()}
      {...overrides}
    />,
  );

describe("Expense detail sheet", () => {
  it("lists each item with its price and what the items do not explain", async () => {
    vi.mocked(getExpenseDetail).mockResolvedValue(
      detail(
        [
          { id: "i1", name: "Croissant", amountMinor: 90_000, position: 0 },
          { id: "i2", name: "Latte", amountMinor: 100_000, position: 1 },
        ],
        203_500,
      ),
    );
    renderSheet();
    expect(await screen.findByText("Croissant")).toBeInTheDocument();
    expect(screen.getByText("Latte")).toBeInTheDocument();
    expect(screen.getByText(/Pajak, layanan/)).toBeInTheDocument();
  });

  it("edits one item and shows the new total from the server", async () => {
    vi.mocked(getExpenseDetail).mockResolvedValue(
      detail([{ id: "i1", name: "Croissant", amountMinor: 90_000, position: 0 }]),
    );
    vi.mocked(saveExpenseItem).mockResolvedValue(
      detail([{ id: "i1", name: "Croissant", amountMinor: 50_000, position: 0 }], 163_500),
    );
    const onChanged = vi.fn(async () => {});
    renderSheet({ onChanged });
    fireEvent.click(await screen.findByRole("button", { name: "Ubah Croissant" }));
    fireEvent.change(screen.getByLabelText("Harga item"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(saveExpenseItem).toHaveBeenCalledWith({
        data: { expenseId: "e1", itemId: "i1", name: "Croissant", amountMinor: 50_000 },
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("adds an item", async () => {
    vi.mocked(getExpenseDetail).mockResolvedValue(detail([]));
    vi.mocked(saveExpenseItem).mockResolvedValue(
      detail([{ id: "i9", name: "Air mineral", amountMinor: 10_000, position: 0 }], 213_500),
    );
    renderSheet();
    fireEvent.click(await screen.findByRole("button", { name: "Tambah item" }));
    fireEvent.change(screen.getByLabelText("Nama item"), { target: { value: "Air mineral" } });
    fireEvent.change(screen.getByLabelText("Harga item"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(saveExpenseItem).toHaveBeenCalledWith({
        data: { expenseId: "e1", name: "Air mineral", amountMinor: 10_000 },
      }),
    );
  });

  it("deletes one item after confirming", async () => {
    vi.mocked(getExpenseDetail).mockResolvedValue(
      detail([{ id: "i1", name: "Croissant", amountMinor: 90_000, position: 0 }]),
    );
    vi.mocked(removeExpenseItem).mockResolvedValue(detail([], 113_500));
    renderSheet();
    fireEvent.click(await screen.findByRole("button", { name: "Ubah Croissant" }));
    fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hapus", hidden: false }));
    await waitFor(() =>
      expect(removeExpenseItem).toHaveBeenCalledWith({ data: { expenseId: "e1", itemId: "i1" } }),
    );
  });

  it("rejects an empty name or price without calling the server", async () => {
    vi.mocked(getExpenseDetail).mockResolvedValue(detail([]));
    renderSheet();
    fireEvent.click(await screen.findByRole("button", { name: "Tambah item" }));
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(saveExpenseItem).not.toHaveBeenCalled();
  });

  it("keeps delete and photo available while the detail is still loading", () => {
    vi.mocked(getExpenseDetail).mockReturnValue(new Promise(() => {}));
    const onDelete = vi.fn();
    renderSheet({ onDelete });
    fireEvent.click(screen.getByRole("button", { name: "Hapus pengeluaran" }));
    expect(onDelete).toHaveBeenCalledWith(row);
    expect(screen.getByRole("button", { name: "Lihat foto struk" })).toBeInTheDocument();
  });
});
