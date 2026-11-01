import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHomeTripWidget, buildMyTripsHome, type MyTripsHomeTrip } from "../lib/my-trips-home";

const trip = (over: Partial<MyTripsHomeTrip> = {}): MyTripsHomeTrip => ({
  id: "t1",
  name: "Tokyo Trip",
  destination_name: "Jepang",
  status: "upcoming",
  departure_date: "2026-11-13",
  return_date: "2026-11-20",
  travelers_count: 2,
  primary_currency: "IDR",
  total_budget_minor: 0,
  spent_minor: 0,
  checklist_total: 8,
  checklist_done: 5,
  ...over,
});
const NOW = new Date(2026, 10, 1, 9, 0, 0);

describe("Home My Trips widget model", () => {
  it("is empty without a focus trip", () => {
    expect(buildHomeTripWidget(buildMyTripsHome([], [], []), NOW)).toEqual({ kind: "empty" });
  });

  it("counts down to departure and names the next checklist step", () => {
    const home = buildMyTripsHome(
      [trip()],
      [],
      [
        { id: "c1", trip_id: "t1", title: "Passport", is_completed: true },
        { id: "c2", trip_id: "t1", title: "eSIM installation", is_completed: false },
      ],
    );
    const view = buildHomeTripWidget(home, NOW);
    expect(view).toMatchObject({
      kind: "trip",
      countdown: "H-12",
      checklistDone: 5,
      checklistTotal: 8,
      nextStep: { label: "Aktifkan eSIM" },
    });
  });

  it("shows the next agenda item while the trip is ongoing", () => {
    const home = buildMyTripsHome(
      [trip({ status: "ongoing", departure_date: "2026-10-30" })],
      [
        {
          trip_id: "t1",
          activity_date: "2026-11-01",
          start_time: "10:30:00",
          title: "Senso-ji",
        },
      ],
      [],
    );
    const view = buildHomeTripWidget(home, NOW);
    expect(view).toMatchObject({
      countdown: "Sedang berlangsung",
      nextStep: { label: "Senso-ji", hint: "Pukul 10:30" },
    });
  });
});

describe("Home integration contract", () => {
  const home = readFileSync("src/routes/index.tsx", "utf8");
  it("gates the widget on the admin flag and reuses the Explore service grid", () => {
    expect(home).toContain("homeConfig.myTripsWidgetEnabled");
    expect(home).toContain("<HomeMyTripsWidget");
    expect(home).toContain("<ServiceCategoryGrid waitlist />");
    expect(readFileSync("src/routes/explore.tsx", "utf8")).toContain("<ServiceCategoryGrid />");
  });
  it("renders the compact empty strip with a single Mulai call to action", () => {
    const widget = readFileSync("src/components/home-my-trips-widget.tsx", "utf8");
    expect(widget).toContain("Susun trip pertamamu");
    expect(widget).toContain("Pilih destinasi");
    expect(widget).toContain('signedIn ? "/my-trips/new" : "/my-trips"');
    expect(widget).not.toContain("Rencanakan perjalananmu");
  });
  it("exposes the admin toggle", () => {
    expect(readFileSync("src/components/admin-home-esim-panel.tsx", "utf8")).toContain(
      "myTripsWidgetEnabled",
    );
  });
});
