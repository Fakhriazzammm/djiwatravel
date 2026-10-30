import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItineraryEditor } from "@/routes/my-trips.$tripId.$section";
import { postItinerary } from "@/lib/my-trips.fn";

vi.mock("@/lib/my-trips.fn", () => ({
  deleteBookingRecord: vi.fn(),
  deleteChecklist: vi.fn(),
  deleteExpense: vi.fn(),
  deleteItinerary: vi.fn(),
  getTripSection: vi.fn(),
  patchBudget: vi.fn(),
  patchChecklist: vi.fn(),
  postBooking: vi.fn(),
  postChecklist: vi.fn(),
  postExpense: vi.fn(),
  postItinerary: vi.fn(),
}));

afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());

describe("agenda perjalanan", () => {
  it("shows an empty planning state and opens the activity form on demand", () => {
    render(<ItineraryEditor tripId="trip-1" items={[]} onSaved={vi.fn(async () => {})} />);

    expect(screen.getByText("Belum ada aktivitas")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Tambah aktivitas" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Tambah aktivitas" })[0]);
    expect(screen.getByRole("dialog", { name: "Tambah aktivitas" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nama aktivitas")).toBeInTheDocument();
    expect(screen.getByLabelText("Tanggal")).toBeInTheDocument();
  });

  it("saves the planned activity through the existing persistence action", async () => {
    vi.mocked(postItinerary).mockResolvedValue({} as never);
    const onSaved = vi.fn(async () => {});
    render(<ItineraryEditor tripId="trip-1" items={[]} onSaved={onSaved} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Tambah aktivitas" })[0]);
    fireEvent.change(screen.getByLabelText("Nama aktivitas"), {
      target: { value: "Makan malam" },
    });
    fireEvent.change(screen.getByLabelText(/Lokasi/), { target: { value: "Shibuya" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan aktivitas" }));

    await waitFor(() =>
      expect(postItinerary).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tripId: "trip-1",
          title: "Makan malam",
          location: "Shibuya",
        }),
      }),
    );
    expect(onSaved).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Tambah aktivitas" })).not.toBeInTheDocument(),
    );
  });
});
