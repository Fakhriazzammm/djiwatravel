import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prepareShareCardActivities,
  renderShareCard,
  splitActivityNotes,
  type ShareCardActivity,
  type ShareCardInput,
} from "@/lib/share-card";

const drawn: string[] = [];
const gradient = { addColorStop: vi.fn() };
const context = {
  arc: vi.fn(),
  arcTo: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  clip: vi.fn(),
  createLinearGradient: vi.fn(() => gradient),
  createRadialGradient: vi.fn(() => gradient),
  drawImage: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn((text: string) => drawn.push(text)),
  measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
  moveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  stroke: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
  drawn.length = 0;
});

function mockCanvas() {
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
    const element = createElement(tagName);
    if (tagName === "canvas") {
      Object.defineProperties(element, {
        getContext: { value: () => context },
        toBlob: {
          value: (callback: BlobCallback) => callback(new Blob(["story"], { type: "image/png" })),
        },
      });
    }
    return element;
  }) as typeof document.createElement);
}

describe("itinerary share story", () => {
  it("orders every activity by day and time, retaining undated activities at the end", () => {
    const activities = prepareShareCardActivities(
      [
        { activity_date: "2026-11-09", start_time: "10:00", title: "Museum" },
        { activity_date: "2026-11-08", title: "Cafe" },
        { activity_date: "2026-11-08", start_time: "09:00", title: "Temple" },
        { start_time: "08:00", title: "Flexible stop" },
      ],
      (date) => date,
    );

    expect(
      activities.map(({ title, dayNumber, order, time }) => ({ title, dayNumber, order, time })),
    ).toEqual([
      { title: "Temple", dayNumber: 1, order: 1, time: "09:00" },
      { title: "Cafe", dayNumber: 1, order: 2, time: "Waktu belum diatur" },
      { title: "Museum", dayNumber: 2, order: 1, time: "10:00" },
      { title: "Flexible stop", dayNumber: 3, order: 1, time: "08:00" },
    ]);
    expect(activities[3]?.dayLabel).toBe("Tanggal belum diatur");
  });

  it("separates activity details and opening-hours warnings from itinerary notes", () => {
    expect(
      splitActivityNotes(
        "Ramen terkenal saat makan malam · Mungkin tutup di jam ini: buka 08:00-18:00 (OpenStreetMap)",
      ),
    ).toEqual({
      details: "Ramen terkenal saat makan malam",
      openingHours: "08:00–18:00",
      openingHoursSource: "OpenStreetMap",
      openingHoursWarning: "Periksa kecocokan jam kunjungan",
    });
  });

  it("creates a separate Story slide for each itinerary day", async () => {
    mockCanvas();
    const highlights: ShareCardActivity[] = [
      {
        time: "09:00–10:00",
        title: "Temple",
        place: "Tokyo",
        image: null,
        dayLabel: "8 November",
        dayNumber: 1,
        order: 1,
      },
      {
        time: "10:00–11:00",
        title: "Museum",
        place: "Ueno",
        image: null,
        dayLabel: "9 November",
        dayNumber: 2,
        order: 1,
      },
    ];

    const slides = await renderShareCard({
      title: "Tokyo",
      destination: "Jepang",
      dates: "8 November — 15 November",
      owner: "Fakhri",
      link: "djiwatravel.com/share/example",
      days: 2,
      activities: 2,
      highlights,
      logoUrl: "",
      mascotUrl: "",
    });

    expect(slides).toHaveLength(2);
    expect(drawn.some((text) => text.includes("HARI 01"))).toBe(true);
    expect(drawn.some((text) => text.includes("HARI 02"))).toBe(true);
  });

  it("renders every activity with its time, location, notes, and opening hours", async () => {
    mockCanvas();
    const highlights = Array.from({ length: 7 }, (_, index) => ({
      time: `${String(9 + index).padStart(2, "0")}:00–${String(10 + index).padStart(2, "0")}:00`,
      title: `Aktivitas ${index + 1}`,
      place: `Lokasi ${index + 1}`,
      details: `Keterangan lengkap aktivitas ${index + 1}`,
      openingHours: `${String(8 + index).padStart(2, "0")}:00–18:00`,
      image: null,
    })) as unknown as ShareCardActivity[];

    await renderShareCard({
      title: "Tokyo",
      destination: "Jepang",
      dates: "8 November — 15 November",
      owner: "Fakhri",
      link: "djiwatravel.com/share/example",
      days: 2,
      activities: 7,
      highlights,
      logoUrl: "",
      mascotUrl: "",
    } satisfies ShareCardInput);

    expect(drawn).toContain("Aktivitas 7");
    expect(drawn).toContain("10:00–11:00");
    expect(drawn).toContain("Lokasi · Lokasi 2");
    expect(drawn).toContain("Keterangan · Keterangan lengkap aktivitas 1");
    expect(drawn).toContain("Jam buka · 08:00–18:00");
  });
});
