import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TripAssistant } from "@/components/trip-assistant";
import {
  applyTripAssistantProposal,
  dismissTripAssistantProposal,
  loadTripAssistant,
  sendTripAssistantMessage,
  streamTripAssistantMessage,
  undoTripAssistantProposal,
} from "@/lib/trip-assistant.fn";
import { getReceiptScanStatus } from "@/lib/receipt-scan.fn";
import type { AssistantMessage } from "@/lib/trip-assistant";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a data-link {...(rest as object)}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/receipt-scan.fn", () => ({ getReceiptScanStatus: vi.fn() }));
vi.mock("@/components/receipt-scanner", () => ({
  ReceiptScanner: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>SCANNER TERBUKA</button>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trip-assistant.fn", () => ({
  loadTripAssistant: vi.fn(),
  sendTripAssistantMessage: vi.fn(),
  streamTripAssistantMessage: vi.fn(),
  resetTripAssistant: vi.fn(),
  applyTripAssistantProposal: vi.fn(),
  undoTripAssistantProposal: vi.fn(),
  dismissTripAssistantProposal: vi.fn(),
}));

const nudgeInput = {
  today: "2026-11-09",
  departureDate: "2026-11-07",
  returnDate: "2026-11-12",
  itineraryDates: ["2026-11-08"],
  checklistOpen: 6,
  budgetSet: false,
  budgetAllocated: false,
  bookingsActive: 0,
};
const available = {
  available: true as const,
  guest: false,
  remaining: 12,
  dailyLimit: 30,
  canAgenda: true,
  canBudget: true,
};
const assistantMsg = (over: Partial<AssistantMessage> = {}): AssistantMessage => ({
  id: "m2",
  role: "assistant",
  content: "Saya usul begini.",
  chips: null,
  proposal: null,
  createdAt: "2026-11-09T01:00:00.000Z",
  ...over,
});
const proposal = {
  id: "p1",
  kind: "agenda" as const,
  title: "Hari ke-3",
  status: "proposed" as const,
  previous: {},
  payload: {
    kind: "agenda" as const,
    items: [
      {
        op: "add" as const,
        itemId: null,
        title: "Sarapan Tsukiji",
        date: "2026-11-09",
        startTime: "08:30",
        endTime: null,
        location: "Tsukiji",
        category: "food",
        estimatedCostMinor: null,
        place: null,
        note: null,
        lat: null,
        lng: null,
        hours: null,
      },
    ],
  },
};

const INTRO = [
  { id: "agenda", lead: "Ini agenda 8 Nov:", node: <div>KARTU AGENDA</div> },
  { id: "budget", lead: "Posisi anggaranmu:", node: <div>KARTU ANGGARAN</div> },
];

function setup(over: Partial<React.ComponentProps<typeof TripAssistant>> = {}) {
  const onChanged = vi.fn(async () => {});
  const onAvailability = vi.fn();
  render(
    <TripAssistant
      tripId="trip-1"
      destination="Japan"
      currency="IDR"
      nudgeInput={nudgeInput}
      onChanged={onChanged}
      onAdd={vi.fn()}
      onAvailability={onAvailability}
      intro={INTRO}
      {...over}
    >
      <div>KARTU STATIS</div>
    </TripAssistant>,
  );
  return { onChanged, onAvailability };
}

describe("TripAssistant", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    // Most tests are about the conversation, so the staged intro counts as already seen.
    window.sessionStorage.setItem("djiwa-assistant-intro-trip-1", "1");
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the static cards (not the chat) when the assistant is off", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({
      status: { available: false, reason: "off" },
      messages: [],
    });
    const { onAvailability } = setup();
    await waitFor(() => expect(onAvailability).toHaveBeenCalledWith(false));
    expect(screen.getByText("KARTU STATIS")).toBeInTheDocument();
    expect(screen.queryByText("KARTU AGENDA")).toBeNull();
    expect(screen.queryByLabelText("Pesan untuk asisten")).toBeNull();
  });

  it("keeps the agenda card inside the conversation, with a greeting and quick actions", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
    const { onAvailability } = setup();
    await waitFor(() => expect(onAvailability).toHaveBeenCalledWith(true));
    expect(screen.getByText("KARTU AGENDA")).toBeInTheDocument();
    expect(screen.getByText(/asisten perjalananmu ke Japan/)).toBeInTheDocument();
    expect(screen.getByText(/Anggaran perjalanan belum diatur/)).toBeInTheDocument();
    // The most urgent nudge (budget) is the first quick action.
    expect(
      screen.getAllByRole("button", {
        name: /Atur anggaran|Buat itinerary|Rapikan agenda|Cek checklist/,
      })[0],
    ).toHaveTextContent("Atur anggaran");
  });

  it("sends a typed message and a quick action with its intent, and shows the answer", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
    vi.mocked(sendTripAssistantMessage).mockResolvedValue({
      status: "ok",
      remaining: 11,
      messages: [
        {
          id: "m1",
          role: "user",
          content: "halo",
          chips: null,
          proposal: null,
          createdAt: "2026-11-09T01:00:00.000Z",
        },
        assistantMsg({
          content: "Mau hari yang mana?",
          chips: { options: ["Hari ke-3", "Hari ke-4"], multi: false },
        }),
      ],
    });
    setup();
    const input = await screen.findByLabelText("Pesan untuk asisten");
    fireEvent.change(input, { target: { value: "halo" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() =>
      expect(sendTripAssistantMessage).toHaveBeenCalledWith({
        data: { tripId: "trip-1", text: "halo" },
      }),
    );
    expect(await screen.findByText("Mau hari yang mana?")).toBeInTheDocument();

    vi.mocked(sendTripAssistantMessage).mockResolvedValue({
      status: "ok",
      remaining: 10,
      messages: [assistantMsg({ id: "m3", content: "Oke." })],
    });
    fireEvent.click(screen.getByRole("button", { name: "Hari ke-3" }));
    await waitFor(() =>
      expect(sendTripAssistantMessage).toHaveBeenLastCalledWith({
        data: { tripId: "trip-1", text: "Hari ke-3" },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Buat itinerary" }));
    await waitFor(() =>
      expect(sendTripAssistantMessage).toHaveBeenLastCalledWith({
        data: {
          tripId: "trip-1",
          text: "Buatkan itinerary untuk hari yang masih kosong.",
          intent: "plan",
        },
      }),
    );
  });

  it("lets a multi-select question collect several answers and send them together", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({
      status: available,
      messages: [
        assistantMsg({
          content: "Minatmu apa?",
          chips: { options: ["Kuliner", "Belanja", "Budaya"], multi: true },
        }),
      ],
    });
    vi.mocked(sendTripAssistantMessage).mockResolvedValue({
      status: "ok",
      remaining: 9,
      messages: [assistantMsg({ id: "m4" })],
    });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Kuliner" }));
    fireEvent.click(screen.getByRole("button", { name: "Budaya" }));
    fireEvent.click(screen.getByRole("button", { name: "Kirim (2)" }));
    await waitFor(() =>
      expect(sendTripAssistantMessage).toHaveBeenCalledWith({
        data: { tripId: "trip-1", text: "Kuliner, Budaya" },
      }),
    );
  });

  it("applies a proposal, refreshes the trip, and can undo it", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({
      status: available,
      messages: [assistantMsg({ proposal })],
    });
    vi.mocked(applyTripAssistantProposal).mockResolvedValue({ ok: true, status: "applied" });
    vi.mocked(undoTripAssistantProposal).mockResolvedValue({ ok: true, status: "undone" });
    const { onChanged } = setup();
    expect(await screen.findByText("Sarapan Tsukiji")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Terapkan" }));
    await waitFor(() =>
      expect(applyTripAssistantProposal).toHaveBeenCalledWith({ data: { proposalId: "p1" } }),
    );
    expect(await screen.findByText("Diterapkan")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Urungkan/ }));
    await waitFor(() =>
      expect(undoTripAssistantProposal).toHaveBeenCalledWith({ data: { proposalId: "p1" } }),
    );
    expect(await screen.findByText("Dibatalkan")).toBeInTheDocument();
  });

  it("dismisses a proposal", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({
      status: available,
      messages: [assistantMsg({ proposal })],
    });
    vi.mocked(dismissTripAssistantProposal).mockResolvedValue({ ok: true, status: "dismissed" });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Tidak" }));
    expect(await screen.findByText("Tidak dipakai")).toBeInTheDocument();
    expect(dismissTripAssistantProposal).toHaveBeenCalledWith({ data: { proposalId: "p1" } });
  });

  it("puts the text back and explains when the limit is reached", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({
      status: { ...available, guest: true, remaining: 1 },
      messages: [],
    });
    vi.mocked(sendTripAssistantMessage).mockResolvedValue({
      status: "limit",
      remaining: 0,
      message: "Batas obrolan hari ini habis.",
    });
    setup();
    const input = (await screen.findByLabelText("Pesan untuk asisten")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "halo" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByText(/Batas obrolan hari ini habis/)).toBeInTheDocument();
    expect(input.value).toBe("halo");
    expect(screen.getByText(/Mode tamu/)).toBeInTheDocument();
  });

  it("shows the answer word by word while the model writes it, then stores the final messages", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.mocked(streamTripAssistantMessage).mockImplementation((async () =>
      (async function* () {
        yield { type: "delta" as const, text: "Hari ke-3 " };
        yield { type: "delta" as const, text: "kita mulai" };
        await gate;
        yield { type: "status" as const, text: "Mengecek lokasi dan jam buka…" };
        yield {
          type: "done" as const,
          result: {
            status: "ok" as const,
            remaining: 9,
            messages: [
              {
                id: "m1",
                role: "user" as const,
                content: "halo",
                chips: null,
                proposal: null,
                createdAt: "2026-11-09T01:00:00.000Z",
              },
              assistantMsg({ content: "Hari ke-3 kita mulai dari Tsukiji." }),
            ],
          },
        };
      })()) as never);
    setup();
    const input = await screen.findByLabelText("Pesan untuk asisten");
    fireEvent.change(input, { target: { value: "halo" } });
    fireEvent.submit(input.closest("form")!);
    const live = await screen.findByTestId("assistant-streaming");
    await waitFor(() => expect(live).toHaveTextContent("Hari ke-3 kita mulai"));
    expect(sendTripAssistantMessage).not.toHaveBeenCalled();
    release();
    expect(await screen.findByText("Hari ke-3 kita mulai dari Tsukiji.")).toBeInTheDocument();
    expect(screen.queryByTestId("assistant-streaming")).toBeNull();
  });

  it("falls back to a normal request when streaming is not available", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
    vi.mocked(streamTripAssistantMessage).mockRejectedValue(new Error("no stream"));
    vi.mocked(sendTripAssistantMessage).mockResolvedValue({
      status: "ok",
      remaining: 9,
      messages: [assistantMsg({ content: "Jawaban biasa." })],
    });
    setup();
    const input = await screen.findByLabelText("Pesan untuk asisten");
    fireEvent.change(input, { target: { value: "halo" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByText("Jawaban biasa.")).toBeInTheDocument();
  });

  it("offers the receipt camera for members only when the scanner is on, and opens it", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
    vi.mocked(getReceiptScanStatus).mockResolvedValue({ available: true } as never);
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Foto struk" }));
    expect(await screen.findByText("SCANNER TERBUKA")).toBeInTheDocument();
  });

  it("hides the receipt camera for guests and when the scanner is off", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({
      status: { ...available, guest: true },
      messages: [],
    });
    setup();
    await screen.findByLabelText("Pesan untuk asisten");
    expect(screen.queryByRole("button", { name: "Foto struk" })).toBeNull();
    expect(getReceiptScanStatus).not.toHaveBeenCalled();
  });

  it("tells the agenda, budget and the rest one message at a time, then asks what to do first", async () => {
    window.sessionStorage.removeItem("djiwa-assistant-intro-trip-1");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
      setup();
      await screen.findByLabelText("Pesan untuk asisten");
      // Nothing from Ringkas is dumped up front: only the greeting and a typing indicator.
      expect(screen.getByText(/Saya rangkum dulu/)).toBeInTheDocument();
      expect(screen.queryByText("KARTU AGENDA")).toBeNull();
      expect(screen.getByRole("status", { name: "Asisten sedang mengetik" })).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(screen.getByText("Ini agenda 8 Nov:")).toBeInTheDocument();
      expect(screen.getByText("KARTU AGENDA")).toBeInTheDocument();
      expect(screen.queryByText("KARTU ANGGARAN")).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });
      expect(screen.getByText("KARTU ANGGARAN")).toBeInTheDocument();
      expect(screen.getByText(/Mau mulai dari mana\?/)).toBeInTheDocument();
      expect(screen.queryByRole("status", { name: "Asisten sedang mengetik" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips the staging when the person starts typing", async () => {
    window.sessionStorage.removeItem("djiwa-assistant-intro-trip-1");
    vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
    vi.mocked(streamTripAssistantMessage).mockRejectedValue(new Error("no stream"));
    vi.mocked(sendTripAssistantMessage).mockResolvedValue({
      status: "ok",
      remaining: 9,
      messages: [assistantMsg({ content: "Siap." })],
    });
    setup();
    const input = await screen.findByLabelText("Pesan untuk asisten");
    fireEvent.change(input, { target: { value: "halo" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByText("KARTU ANGGARAN")).toBeInTheDocument();
    expect(await screen.findByText("Siap.")).toBeInTheDocument();
  });

  it("moves the map to the days of an applied itinerary", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({
      status: available,
      messages: [assistantMsg({ proposal })],
    });
    vi.mocked(applyTripAssistantProposal).mockResolvedValue({ ok: true, status: "applied" });
    const onFocusDays = vi.fn();
    setup({ onFocusDays });
    fireEvent.click(await screen.findByRole("button", { name: "Terapkan" }));
    await waitFor(() => expect(onFocusDays).toHaveBeenCalledWith(["2026-11-09"]));
  });

  it("shows the mascot as the assistant's face and opens its profile on tap", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({
      status: available,
      messages: [assistantMsg({ content: "Halo dari maskot." })],
    });
    setup();
    expect(await screen.findByText("Halo dari maskot.")).toBeInTheDocument();
    // Every assistant bubble carries the generated mascot photo, not an icon.
    const faces = document.querySelectorAll('img[src="/assets/home-hero/mascot-ai-v1.png"]');
    expect(faces.length).toBeGreaterThan(1);
    expect(screen.getByText("Siap membantu · ketuk untuk kenalan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Profil Asisten Djiwa" }));
    expect(await screen.findByText(/Menyusun itinerary per hari/)).toBeInTheDocument();
    expect(screen.getByText(/Sisa 12 dari 30 pesan hari ini/)).toBeInTheDocument();
    // Touching the big mascot answers with a line.
    fireEvent.click(screen.getByRole("button", { name: "Sentuh maskot" }));
    expect(
      await screen.findByText("Aku bisa bikin itinerary dalam hitungan detik."),
    ).toBeInTheDocument();
  });

  it("thinks while waiting and talks while the reply streams", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.mocked(streamTripAssistantMessage).mockImplementation((async () =>
      (async function* () {
        await gate;
        yield { type: "delta" as const, text: "Oke, aku susun." };
        await new Promise((r) => setTimeout(r, 600));
        yield {
          type: "done" as const,
          result: {
            status: "ok" as const,
            remaining: 9,
            messages: [assistantMsg({ content: "Selesai." })],
          },
        };
      })()) as never);
    setup();
    const input = await screen.findByLabelText("Pesan untuk asisten");
    fireEvent.change(input, { target: { value: "halo" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByText("Sedang berpikir…")).toBeInTheDocument();
    expect(
      document.querySelector('img[src="/assets/home-hero/mascot-ai-think-v1.png"]'),
    ).not.toBeNull();
    release();
    expect(await screen.findByText("Sedang menjawab…")).toBeInTheDocument();
    expect(await screen.findByText("Selesai.")).toBeInTheDocument();
  });
});
