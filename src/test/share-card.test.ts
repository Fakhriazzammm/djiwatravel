import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prepareShareCardActivities,
  renderShareCard,
  renderBrandCard,
  splitActivityNotes,
  type ShareCardActivity,
  type ShareCardInput,
} from "@/lib/share-card";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn(async () => null as unknown) }));
vi.mock("@/lib/better-auth-client", () => ({ getBetterAuthSession: getSession }));

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
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  getSession.mockResolvedValue(null);
  drawn.length = 0;
});

function mockCanvas() {
  vi.stubGlobal(
    "Image",
    class {
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    },
  );
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

  it("keeps multiple itinerary days together in exactly one Story image", async () => {
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

    expect(slides).toHaveLength(1);
    expect(drawn.some((text) => text.includes("8 November"))).toBe(true);
    expect(drawn.some((text) => text.includes("9 November"))).toBe(true);
    expect(drawn).toContain("Temple");
    expect(drawn).toContain("Museum");
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
    expect(drawn.some((text) => text.includes("Lokasi 2"))).toBe(true);
    expect(drawn.some((text) => text.includes("Keterangan lengkap aktivitas 1"))).toBe(true);
    expect(drawn.some((text) => text.includes("Buka 08:00–18:00"))).toBe(true);
  });

  const input: ShareCardInput = {
    title: "Tokyo",
    destination: "Jepang",
    dates: "8–15 November 2026",
    owner: "Fakhri",
    link: "djiwatravel.com/share/example",
    days: 0,
    activities: 0,
    highlights: [],
    logoUrl: "",
    mascotUrl: "",
  };

  it("labels the owner as member but attributes each export to the current generator and time", async () => {
    mockCanvas();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T03:04:05Z"));
    getSession.mockResolvedValue({ user: { id: "u2", name: "Nadia Putri" } });
    await renderShareCard(input);
    const first = drawn.join(" ");
    expect(first).toContain("Fakhri · Member Djiwa Travel");
    expect(first).toContain("Bawa Djiwamu Lebih Jauh");
    expect(first).toContain("Desain ini digenerate otomatis di aplikasi Djiwa Travel");
    expect(first).toMatch(/oleh Nadia.*10 November 2026.*10[.:]04[.:]05 WIB/);
    expect(first).not.toContain("oleh Fakhri");
    drawn.length = 0;
    vi.setSystemTime(new Date("2026-11-11T05:06:07Z"));
    getSession.mockResolvedValue({ user: { id: "u3", name: "Bima" } });
    await renderShareCard(input);
    expect(drawn.join(" ")).toMatch(/oleh Bima.*11 November 2026.*12[.:]06[.:]07 WIB/);
    expect(drawn.join(" ")).not.toContain("Nadia");
  });

  it("does not attribute a guest export or failed session read to the trip owner", async () => {
    mockCanvas();
    getSession.mockRejectedValue(new Error("offline"));
    await renderShareCard(input);
    expect(drawn.join(" ")).toContain("oleh Pengunjung");
    expect(drawn.join(" ")).not.toContain("oleh Fakhri");
  });

  it("places the agenda below a long trip header rather than overlapping its metadata", async () => {
    mockCanvas();
    vi.spyOn(context, "measureText").mockImplementation((text: string) => {
      const font = (context as unknown as { font: string }).font;
      const size = Number(font.match(/(\d+)px/)?.[1] || 30);
      return { width: text.length * size * (text.includes("W") ? 0.9 : 0.5) };
    });
    await renderShareCard({
      ...input,
      title: "W".repeat(120),
      days: 1,
      highlights: [
        {
          title: "Temple",
          time: "09:00–10:00",
          place: "Tokyo",
          image: null,
          dayLabel: "8 November",
        },
      ],
    });
    const calls = context.fillText.mock.calls as unknown as [string, number, number][];
    const stats = calls.filter(([text]) => text.includes("hari beragenda")).at(-1)!;
    const day = calls.find(([text]) => text === "8 November")!;
    expect(day[2]).toBeGreaterThan(stats[2] + 40);
  });

  it("retains category and derived duration without missing-data boilerplate", async () => {
    mockCanvas();
    const highlights = prepareShareCardActivities(
      [
        {
          title: "Museum",
          activity_date: "2026-11-09",
          start_time: "11:30",
          end_time: "14:00",
          activity_category: "attraction",
          location: "Ueno",
        },
      ],
      (day) => day,
    );
    await renderShareCard({ ...input, highlights });
    expect(drawn.join(" ")).toContain("2 jam 30 mnt");
    expect(drawn.join(" ")).toContain("Wisata");
    expect(drawn.join(" ")).not.toContain("Belum ada keterangan tambahan");
    expect(drawn.join(" ")).not.toContain("Belum dicantumkan");
  });

  it("splits a huge agenda over several Story images without losing any activity", async () => {
    mockCanvas();
    const highlights = Array.from({ length: 100 }, (_, i) => ({
      time: "10:00–11:00",
      title: `Agenda ${i}`,
      place: "Tokyo",
      image: null,
    }));
    const blobs = await renderShareCard({ ...input, highlights });
    expect(blobs.length).toBeGreaterThan(1);
    const text = drawn.join(" ");
    for (const i of [0, 50, 99]) expect(text).toContain(`Agenda ${i}`);
    expect(text).toContain(`Gambar 2 dari ${blobs.length}`);
  });

  it("applies the approved slogan and current generator attribution to non-itinerary cards", async () => {
    mockCanvas();
    getSession.mockResolvedValue({ user: { id: "u1", name: "Rani" } });
    await renderBrandCard({
      kicker: "Panduan",
      title: "Panduan Jepang",
      link: "djiwatravel.com/guides/jepang",
      logoUrl: "",
      mascotUrl: "",
    });
    expect(drawn.join(" ")).toContain("Bawa Djiwamu Lebih Jauh");
    expect(drawn.join(" ")).toContain("oleh Rani");
  });
});
