import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetEditor, ExpenseEditor } from "@/components/trip-budget-ios";
import {
  deleteBudgetCategoryRecord,
  deleteExpense,
  patchBudget,
  postBudgetCategory,
} from "@/lib/my-trips.fn";

vi.mock("@/lib/my-trips.fn", () => ({
  postBudgetCategory: vi.fn(async () => ({})),
  deleteBudgetCategoryRecord: vi.fn(async () => ({})),
  patchBudget: vi.fn(async () => ({})),
  postExpense: vi.fn(),
  deleteExpense: vi.fn(async () => ({})),
}));

vi.mock("@/lib/expense-items.fn", () => ({
  getExpenseDetail: vi.fn(async () => null),
  saveExpenseItem: vi.fn(),
  removeExpenseItem: vi.fn(),
  updateExpenseInfo: vi.fn(),
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const summary = {
  allocatedMinor: 0,
  spentMinor: 0,
  uncategorizedSpentMinor: 0,
  uncategorizedCount: 0,
  budgetMinor: 1_000_000_00,
};

describe("budget iOS editor", () => {
  it("saves a category limit after the stepper settles", async () => {
    const onSaved = vi.fn(async () => {});
    render(
      <BudgetEditor
        tripId="t1"
        items={[{ id: "c1", name: "Flights", allocated_minor: 0, spent_minor: 0 }]}
        currency="IDR"
        summary={summary}
        onSaved={onSaved}
      />,
    );
    const plus = screen.getByRole("button", { name: "Tambah batas Penerbangan" });
    fireEvent.click(plus);
    fireEvent.click(plus);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(patchBudget).toHaveBeenCalledTimes(1);
    expect(patchBudget).toHaveBeenCalledWith({ data: { id: "c1", allocatedMinor: 20_000_000 } });
    expect(onSaved).toHaveBeenCalled();
  });

  it("does not let the limit go below zero", () => {
    render(
      <BudgetEditor
        tripId="t1"
        items={[{ id: "c1", name: "Flights", allocated_minor: 0, spent_minor: 0 }]}
        currency="IDR"
        summary={summary}
        onSaved={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByRole("button", { name: "Kurangi batas Penerbangan" })).toBeDisabled();
  });
});

describe("budget categories", () => {
  const item = { id: "c1", name: "Visa", allocated_minor: 0, spent_minor: 0 };

  it("adds a category", async () => {
    vi.useRealTimers();
    render(
      <BudgetEditor
        tripId="t1"
        items={[item]}
        currency="IDR"
        summary={summary}
        onSaved={vi.fn(async () => {})}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tambah kategori" }));
    fireEvent.change(await screen.findByLabelText("Nama kategori"), {
      target: { value: "Oleh-oleh" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Tambah kategori" }).at(-1)!);
    await waitFor(() =>
      expect(postBudgetCategory).toHaveBeenCalledWith({
        data: { tripId: "t1", name: "Oleh-oleh" },
      }),
    );
  });

  it("deletes a category after confirmation", async () => {
    vi.useRealTimers();
    render(
      <BudgetEditor
        tripId="t1"
        items={[item]}
        currency="IDR"
        summary={summary}
        onSaved={vi.fn(async () => {})}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Opsi kategori Visa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hapus kategori" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hapus" }));
    await waitFor(() =>
      expect(deleteBudgetCategoryRecord).toHaveBeenCalledWith({ data: { id: "c1" } }),
    );
  });
});

describe("expense iOS editor", () => {
  it("groups expenses by day and confirms before deleting", async () => {
    vi.useRealTimers();
    const onSaved = vi.fn(async () => {});
    render(
      <ExpenseEditor
        tripId="t1"
        currency="IDR"
        categories={[{ id: "c1", name: "Food & Drinks", allocated_minor: 0, currency: "IDR" }]}
        items={[
          {
            id: "e1",
            description: "Makan siang",
            transaction_date: "2026-12-12",
            category_id: "c1",
            category_name: "Food & Drinks",
            original_amount_minor: 8_500_000,
            original_currency: "IDR",
            converted_amount_minor: 8_500_000,
            converted_currency: "IDR",
          },
        ]}
        onSaved={onSaved}
      />,
    );
    expect(screen.getByText("Makan siang")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Makan siang/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Hapus pengeluaran" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hapus" }));
    await waitFor(() => expect(deleteExpense).toHaveBeenCalledWith({ data: { id: "e1" } }));
  });
});

describe("Biaya entry points for scan struk", () => {
  const scan = {
    available: true,
    savePhoto: true,
    maxPhotos: 10,
    maxMb: 6,
    dailyLimit: 30,
    remaining: 30,
  };
  const categories = [{ id: "c1", name: "Food & Drinks", allocated_minor: 0, currency: "IDR" }];

  it("shows the Scan button and a manual + button when scanning is available", () => {
    vi.useRealTimers();
    render(
      <ExpenseEditor
        tripId="t1"
        currency="IDR"
        categories={categories}
        items={[]}
        onSaved={vi.fn(async () => {})}
        receiptScan={scan}
      />,
    );
    expect(screen.queryByText("Ada banyak struk?")).toBeNull();
    expect(screen.getByRole("button", { name: "Scan struk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Catat manual" })).toBeInTheDocument();
  });

  it("keeps the plain Catat button when Admin turned scanning off", () => {
    vi.useRealTimers();
    render(
      <ExpenseEditor
        tripId="t1"
        currency="IDR"
        categories={categories}
        items={[]}
        onSaved={vi.fn(async () => {})}
      />,
    );
    expect(screen.queryByText("Ada banyak struk?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Scan struk" })).toBeNull();
    expect(screen.getByRole("button", { name: /Catat/ })).toBeInTheDocument();
  });

  it("opens the scanner from the Scan button and marks scanned expenses", async () => {
    vi.useRealTimers();
    render(
      <ExpenseEditor
        tripId="t1"
        currency="IDR"
        categories={categories}
        items={[
          {
            id: "e1",
            description: "Fuglen Tokyo",
            transaction_date: "2026-11-04",
            category_id: "c1",
            category_name: "Food & Drinks",
            original_amount_minor: 14_948_000,
            original_currency: "JPY",
            converted_amount_minor: 14_948_000,
            converted_currency: "IDR",
            from_scan: true,
            receipt_scan_id: "scan-1",
          },
        ]}
        onSaved={vi.fn(async () => {})}
        receiptScan={scan}
      />,
    );
    expect(screen.getByText(/dari scan/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Fuglen Tokyo/ }));
    expect(await screen.findByRole("button", { name: "Lihat foto struk" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    fireEvent.click(screen.getByRole("button", { name: "Scan struk" }));
    expect(await screen.findByRole("dialog", { name: "Kamera scan struk" })).toBeInTheDocument();
  });

  it("shows the floating Scan button on the Anggaran tab too", () => {
    vi.useRealTimers();
    render(
      <BudgetEditor
        tripId="t1"
        items={[]}
        currency="IDR"
        summary={summary}
        onSaved={vi.fn(async () => {})}
        receiptScan={scan}
      />,
    );
    expect(screen.getByRole("button", { name: "Scan struk" })).toBeInTheDocument();
  });
});
