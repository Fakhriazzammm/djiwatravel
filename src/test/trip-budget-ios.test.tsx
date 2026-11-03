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
