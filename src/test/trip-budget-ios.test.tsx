import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetEditor, ExpenseEditor } from "@/components/trip-budget-ios";
import { deleteExpense, patchBudget } from "@/lib/my-trips.fn";

vi.mock("@/lib/my-trips.fn", () => ({
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
        items={[{ id: "c1", name: "Flights", allocated_minor: 0, spent_minor: 0 }]}
        currency="IDR"
        summary={summary}
        onSaved={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByRole("button", { name: "Kurangi batas Penerbangan" })).toBeDisabled();
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
