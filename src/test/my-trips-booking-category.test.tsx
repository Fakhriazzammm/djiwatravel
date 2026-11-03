import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookingEditor } from "@/routes/my-trips.$tripId.$section";
import { postBooking } from "@/lib/my-trips.fn";

vi.mock("@/lib/my-trips.fn", () => ({
  deleteBookingRecord: vi.fn(),
  deleteBudgetCategoryRecord: vi.fn(),
  deleteChecklist: vi.fn(),
  deleteExpense: vi.fn(),
  deleteItinerary: vi.fn(),
  getTripSection: vi.fn(),
  patchBudget: vi.fn(),
  patchChecklist: vi.fn(),
  postBooking: vi.fn(async () => ({})),
  postBudgetCategory: vi.fn(),
  postChecklist: vi.fn(),
  postExpense: vi.fn(),
  postItinerary: vi.fn(),
}));

afterEach(cleanup);

describe("booking category dropdown", () => {
  it("offers the traveler's own categories plus Lainnya and saves the chosen one", async () => {
    render(
      <BookingEditor
        tripId="t1"
        items={[]}
        categories={[
          { id: "c1", name: "Flights", allocated_minor: 0, currency: "IDR" },
          { id: "c2", name: "Oleh-oleh", allocated_minor: 0, currency: "IDR" },
        ]}
        onSaved={vi.fn(async () => {})}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tambah pemesanan" }));
    const select = await screen.findByRole("combobox", { name: "Kategori" });
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.value)).toEqual([
      "Penerbangan",
      "Oleh-oleh",
      "Lainnya",
    ]);
    fireEvent.change(select, { target: { value: "Oleh-oleh" } });
    fireEvent.change(screen.getByPlaceholderText("Nama booking"), { target: { value: "Toko" } });
    fireEvent.click(screen.getByRole("button", { name: "Tambah booking" }));
    await waitFor(() =>
      expect(postBooking).toHaveBeenCalledWith({
        data: expect.objectContaining({ tripId: "t1", category: "Oleh-oleh", title: "Toko" }),
      }),
    );
  });
});
