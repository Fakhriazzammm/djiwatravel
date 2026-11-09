import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItineraryEditor } from "@/routes/my-trips.$tripId.$section";
import { postItinerary, postTripShare } from "@/lib/my-trips.fn";

vi.mock("@/lib/my-trips.fn", () => ({
  deleteBookingRecord: vi.fn(),
  deleteBudgetCategoryRecord: vi.fn(),
  postBudgetCategory: vi.fn(),
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
  patchItinerary: vi.fn(),
  postTripShare: vi.fn(),
  deleteTripShare: vi.fn(),
  getTripShare: vi.fn(),
}));

afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());

describe("agenda perjalanan", () => {
  it("shows an empty planning state and opens the activity form on demand", () => {
    render(<ItineraryEditor tripId="trip-1" items={[]} onSaved={vi.fn(async () => {})} />);

    expect(screen.getByText("Belum ada aktivitas")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Tambah aktivitas" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Tambah aktivitas" })[0]!);
    expect(screen.getByRole("form", { name: "Tambah aktivitas" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nama aktivitas")).toBeInTheDocument();
    expect(screen.getByLabelText("Tanggal")).toBeInTheDocument();
  });

  it("saves the planned activity through the existing persistence action", async () => {
    vi.mocked(postItinerary).mockResolvedValue({} as never);
    const onSaved = vi.fn(async () => {});
    render(<ItineraryEditor tripId="trip-1" items={[]} onSaved={onSaved} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Tambah aktivitas" })[0]!);
    fireEvent.change(screen.getByLabelText("Nama aktivitas"), {
      target: { value: "Makan malam" },
    });
    fireEvent.change(screen.getByLabelText(/Cari tempat/), { target: { value: "Shibuya" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

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
      expect(screen.queryByRole("form", { name: "Tambah aktivitas" })).not.toBeInTheDocument(),
    );
  });

  it("shares the itinerary from the Agenda with the same sheet as Ringkas", async () => {
    const trip = {
      name: "Jepang",
      destination_name: "Jepang",
      departure_date: "2026-11-08",
      return_date: "2026-11-15",
    };
    const onSaved = vi.fn(async () => {});
    vi.mocked(postTripShare).mockResolvedValue({} as never);
    render(
      <ItineraryEditor tripId="trip-1" trip={trip} items={[]} share={null} onSaved={onSaved} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bagikan itinerary" }));
    expect(await screen.findByText(/Tautan baca-saja berisi nama perjalanan/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Buat tautan/i }));
    await waitFor(() => expect(postTripShare).toHaveBeenCalledWith({ data: { tripId: "trip-1" } }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("shows the existing share link and has no share button without a trip", async () => {
    render(
      <ItineraryEditor
        tripId="trip-1"
        trip={{
          name: "Jepang",
          destination_name: "Jepang",
          departure_date: null,
          return_date: null,
        }}
        items={[]}
        share={{ token: "abc".repeat(12), createdAt: "2026-11-09T00:00:00Z" }}
        onSaved={vi.fn(async () => {})}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bagikan itinerary" }));
    const link = (await screen.findByLabelText("Tautan itinerary")) as HTMLInputElement;
    expect(link.value).toContain("abcabcabc");
    cleanup();
    render(<ItineraryEditor tripId="trip-1" items={[]} onSaved={vi.fn(async () => {})} />);
    expect(screen.queryByRole("button", { name: "Bagikan itinerary" })).toBeNull();
  });
});
