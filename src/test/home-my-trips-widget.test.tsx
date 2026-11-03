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

describe("Home trip card model (design A)", () => {
  const ongoing = trip({
    status: "ongoing",
    departure_date: "2026-11-03",
    return_date: "2026-11-04",
    total_budget_minor: 1_000_000_000,
    spent_minor: 0,
    booking_count: 2,
  });
  const agenda = [
    {
      id: "a1",
      trip_id: "t1",
      activity_date: "2026-11-04",
      start_time: "10:00:00",
      title: "ngopi",
      location: "Fuglen Tokyo",
      latitude: 35.67,
      longitude: 139.69,
    },
    {
      id: "a2",
      trip_id: "t1",
      activity_date: "2026-11-04",
      start_time: "13:00:00",
      title: "makan",
      location: "Saizeriya",
      latitude: 35.68,
      longitude: 139.7,
    },
  ];
  const at = (h: number, m = 0) =>
    buildHomeTripWidget(buildMyTripsHome([ongoing], agenda, []), new Date(2026, 10, 4, h, m));

  it("names the day, the next activity and how soon it starts", () => {
    expect(at(9, 35)).toMatchObject({
      dayLabel: "Hari ke-2",
      agenda: { title: "ngopi", time: "10:00", location: "Fuglen Tokyo", when: "25 mnt lagi" },
      todayAgendaCount: 2,
      bookingCount: 2,
      budget: { set: true, remainingMinor: 1_000_000_000 },
    });
  });

  it("switches to what is on now, then to the next one", () => {
    expect(at(10, 15)).toMatchObject({ agenda: { title: "ngopi", isNow: true } });
    expect(at(11, 30)).toMatchObject({ agenda: { title: "makan", when: "2 jam lagi" } });
  });

  it("numbers the pins of the agenda day for the route preview", () => {
    const view = at(9, 0);
    expect(view).toMatchObject({
      route: {
        date: "2026-11-04",
        pins: [
          { id: "a1", n: 1 },
          { id: "a2", n: 2 },
        ],
      },
    });
  });

  it("has no route when no activity has a point", () => {
    const plain = agenda.map(({ latitude: _a, longitude: _b, ...rest }) => rest);
    const view = buildHomeTripWidget(
      buildMyTripsHome([ongoing], plain, []),
      new Date(2026, 10, 4, 9),
    );
    expect(view).toMatchObject({ kind: "trip", route: null });
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
