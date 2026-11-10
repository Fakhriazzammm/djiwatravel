import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProposalCard } from "@/components/trip-assistant-cards";
import type { AgendaChange, ProposalView } from "@/lib/trip-assistant";

const item = (over: Partial<AgendaChange>): AgendaChange => ({
  op: "add",
  itemId: null,
  title: "Senso-ji",
  date: "2026-12-10",
  startTime: "09:30",
  endTime: "11:30",
  location: "Asakusa, Tokyo",
  category: "sightseeing",
  estimatedCostMinor: null,
  place: "Senso-ji",
  note: null,
  lat: 35.71,
  lng: 139.79,
  hours: null,
  placeKind: "atraksi",
  ...over,
});
const proposal = (status: ProposalView["status"]): ProposalView => ({
  id: "p1",
  kind: "agenda",
  title: "Itinerary 3 hari di Tokyo",
  status,
  previous: {},
  payload: {
    kind: "agenda",
    items: [
      item({}),
      item({
        title: "Makan siang: Sushi Dai",
        place: "Sushi Dai",
        placeKind: "makan",
        startTime: "12:30",
      }),
      item({ title: "Manual", place: null, placeKind: null, startTime: "15:00" }),
    ],
  },
});
const base = {
  currency: "IDR",
  busy: false,
  onApply: vi.fn(),
  onUndo: vi.fn(),
  onDismiss: vi.fn(),
};

describe("itinerary card from the full plan", () => {
  it("labels each place by kind and offers 'Ganti tempat' only on map places while open", () => {
    const onSwap = vi.fn();
    render(<ProposalCard {...base} proposal={proposal("proposed")} onSwap={onSwap} />);
    expect(screen.getByText(/Wisata · Asakusa, Tokyo/)).toBeInTheDocument();
    expect(screen.getByText(/Makan · Asakusa, Tokyo/)).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /Ganti tempat/ });
    expect(buttons).toHaveLength(2); // the manual row has no map place
    fireEvent.click(screen.getByRole("button", { name: "Ganti tempat: Makan siang: Sushi Dai" }));
    expect(onSwap).toHaveBeenCalledWith(1);
  });
  it("hides the swap buttons once the proposal is applied", () => {
    render(<ProposalCard {...base} proposal={proposal("applied")} onSwap={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Ganti tempat/ })).toBeNull();
  });
});
