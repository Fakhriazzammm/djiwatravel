import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TripTicket, type TicketData } from "@/components/trip-ticket";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/my-trips/t1" className={className}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const trip: TicketData = {
  id: "t1",
  name: "Bali 5 Hari",
  destination_name: "Bali",
  departure_date: null,
  return_date: null,
  travelers_count: 2,
  status: "upcoming",
  total_budget_minor: 0,
  spent_minor: 0,
  checklist_total: 4,
  checklist_done: 1,
};

describe("TripTicket", () => {
  it("shows the trip, traveler count, preparation progress and a date prompt", () => {
    render(<TripTicket trip={trip} title="Bali 5 Hari" />);
    expect(screen.getByRole("heading", { name: "Bali 5 Hari" })).toBeInTheDocument();
    expect(screen.getByText(/2 traveler/)).toBeInTheDocument();
    expect(screen.getByText("TANGGAL")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progres persiapan" })).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
  });

  it("marks a finished trip and hides progress", () => {
    render(
      <TripTicket
        trip={{ ...trip, status: "past", departure_date: "2020-01-01", return_date: "2020-01-02" }}
        title="Bali 5 Hari"
      />,
    );
    expect(screen.getByText("SELESAI")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
