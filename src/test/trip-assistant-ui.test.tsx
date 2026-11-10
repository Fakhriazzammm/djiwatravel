import { act, cleanup, fireEvent, within, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TripAssistant } from "@/components/trip-assistant";
import {
  applyTripAssistantProposal,
  dismissTripAssistantProposal,
  loadTripAssistant,
  recordTripSummary,
  openTripGoogleLink,
  pinTripPlaces,
  sendTripAssistantMessage,
  streamTripAssistantMessage,
  undoTripAssistantProposal,
} from "@/lib/trip-assistant.fn";
import { getReceiptScanStatus } from "@/lib/receipt-scan.fn";
import type { TripSummary } from "@/lib/trip-summary";
import type { AssistantMessage } from "@/lib/trip-assistant";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a data-link {...(rest as object)}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/lib/receipt-scan.fn", () => ({ getReceiptScanStatus: vi.fn() }));
vi.mock("@/components/receipt-scanner", () => ({
  ReceiptScanner: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>SCANNER TERBUKA</button>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/travo-docs.fn", () => ({
  listTravoMemory: vi.fn(async () => ({ guest: false, items: [] })),
  addTravoMemory: vi.fn(async () => ({ ok: true, items: [] })),
  deleteTravoMemory: vi.fn(async () => ({ items: [] })),
  clearTravoMemory: vi.fn(async () => ({ items: [] })),
}));
vi.mock("@/lib/trip-assistant.fn", () => ({
  loadTripAssistant: vi.fn(),
  sendTripAssistantMessage: vi.fn(),
  pinTripPlaces: vi.fn(),
  recordTripSummary: vi.fn(async () => ({ ok: true })),
  openTripGoogleLink: vi.fn(async () => ({
    status: "ok",
    url: "https://docs.google.com/spreadsheets/d/x",
  })),
  swapTripPlace: vi.fn(),
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
  blocks: [],
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
    expect(screen.queryByLabelText("Pesan untuk Travo")).toBeNull();
  });

  it("keeps the agenda card inside the conversation, with a greeting and quick actions", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
    const { onAvailability } = setup();
    await waitFor(() => expect(onAvailability).toHaveBeenCalledWith(true));
    expect(screen.getByText("KARTU AGENDA")).toBeInTheDocument();
    expect(screen.getByText(/Aku Travo, asisten perjalananmu ke Japan/)).toBeInTheDocument();
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
          blocks: [],
          createdAt: "2026-11-09T01:00:00.000Z",
        },
        assistantMsg({
          content: "Mau hari yang mana?",
          chips: { options: ["Hari ke-3", "Hari ke-4"], multi: false },
        }),
      ],
    });
    setup();
    const input = await screen.findByLabelText("Pesan untuk Travo");
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
    vi.mocked(applyTripAssistantProposal).mockResolvedValue({
      ok: true,
      status: "applied",
      pinned: 0,
    });
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
    const input = (await screen.findByLabelText("Pesan untuk Travo")) as HTMLInputElement;
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
                blocks: [],
                createdAt: "2026-11-09T01:00:00.000Z",
              },
              assistantMsg({ content: "Hari ke-3 kita mulai dari Tsukiji." }),
            ],
          },
        };
      })()) as never);
    setup();
    const input = await screen.findByLabelText("Pesan untuk Travo");
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
    const input = await screen.findByLabelText("Pesan untuk Travo");
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
    await screen.findByLabelText("Pesan untuk Travo");
    expect(screen.queryByRole("button", { name: "Foto struk" })).toBeNull();
    expect(getReceiptScanStatus).not.toHaveBeenCalled();
  });

  it("tells the agenda, budget and the rest one message at a time, then asks what to do first", async () => {
    window.sessionStorage.removeItem("djiwa-assistant-intro-trip-1");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
      setup();
      await screen.findByLabelText("Pesan untuk Travo");
      // Nothing from Ringkas is dumped up front: only the greeting and a typing indicator.
      expect(screen.getByText(/Aku rangkum dulu/)).toBeInTheDocument();
      expect(screen.queryByText("KARTU AGENDA")).toBeNull();
      expect(screen.getByRole("status", { name: "Travo sedang mengetik" })).toBeInTheDocument();
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
      expect(screen.queryByRole("status", { name: "Travo sedang mengetik" })).toBeNull();
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
    const input = await screen.findByLabelText("Pesan untuk Travo");
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
    vi.mocked(applyTripAssistantProposal).mockResolvedValue({
      ok: true,
      status: "applied",
      pinned: 0,
    });
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
    fireEvent.click(screen.getByRole("button", { name: "Profil Travo" }));
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
    const input = await screen.findByLabelText("Pesan untuk Travo");
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

  it("offers to pin activities that have no point on the map, and says how many it added", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
    vi.mocked(pinTripPlaces).mockResolvedValue({ pinned: 3, approximate: 1, remaining: 0 });
    const { onChanged } = setup({ unpinned: 3 });
    fireEvent.click(await screen.findByRole("button", { name: "Pasang pin (3)" }));
    await waitFor(() => expect(pinTripPlaces).toHaveBeenCalledWith({ data: { tripId: "trip-1" } }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("has no pin button when every activity is on the map", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
    setup({ unpinned: 0 });
    await screen.findByLabelText("Pesan untuk Travo");
    expect(screen.queryByRole("button", { name: /Pasang pin/ })).toBeNull();
  });

  it("puts the proposal and its quick replies inside the assistant's balloon, without repeating Terapkan", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({
      status: available,
      messages: [
        assistantMsg({
          content: "Ini usulan hari ke-3. Mau diterapkan?",
          proposal,
          chips: { options: ["Terapkan", "Ubah tempatnya", "Atur anggaran"], multi: false },
        }),
      ],
    });
    setup();
    const text = await screen.findByText("Ini usulan hari ke-3. Mau diterapkan?");
    const balloon = text.parentElement!;
    // The card, its buttons and the remaining replies share the balloon with the words.
    expect(balloon.querySelector('[data-testid="assistant-proposal"]')).not.toBeNull();
    expect(balloon.querySelector('[data-testid="assistant-chips"]')).not.toBeNull();
    // One Terapkan only (the card's); the chip that repeated it is gone.
    const inside = within(balloon);
    expect(inside.getAllByRole("button", { name: "Terapkan" })).toHaveLength(1);
    expect(inside.getByRole("button", { name: "Ubah tempatnya" })).toBeInTheDocument();
    expect(inside.getByRole("button", { name: "Atur anggaran" })).toBeInTheDocument();
  });

  it("drops the change-it reply once the proposal is applied", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({
      status: available,
      messages: [
        assistantMsg({
          proposal: { ...proposal, status: "applied" },
          chips: { options: ["Terapkan", "Ubah tempatnya", "Atur anggaran"], multi: false },
        }),
      ],
    });
    setup();
    const card = await screen.findByTestId("assistant-proposal");
    const balloon = card.parentElement!;
    expect(within(balloon).queryByRole("button", { name: "Ubah tempatnya" })).toBeNull();
    expect(within(balloon).getByRole("button", { name: "Atur anggaran" })).toBeInTheDocument();
  });

  it("renders Travo's answer as visual blocks, not flat text", async () => {
    vi.mocked(loadTripAssistant).mockResolvedValue({
      status: available,
      messages: [
        assistantMsg({
          content: "Ini rencana **9 Nov** ya.",
          blocks: [
            {
              kind: "steps",
              title: "Rencana",
              items: ["09:00 Sarapan di Tsukiji", "11:30 Museum"],
            },
            { kind: "facts", title: "Info", items: ["Jam buka: 09:00-17:00", "Harga: ¥1.000"] },
            { kind: "tip", title: "Tips", items: ["Datang pagi biar sepi"] },
            { kind: "places", title: "Opsi", items: ["Ueno", "Asakusa"] },
          ],
        }),
      ],
    });
    vi.mocked(streamTripAssistantMessage).mockRejectedValue(new Error("no stream"));
    vi.mocked(sendTripAssistantMessage).mockResolvedValue({
      status: "ok",
      remaining: 9,
      messages: [assistantMsg({ id: "m9", content: "Oke." })],
    });
    setup();
    const bold = await screen.findByText("9 Nov");
    expect(bold.tagName).toBe("STRONG");
    const blocks = screen.getByTestId("assistant-blocks");
    expect(blocks.querySelector('[data-block="steps"]')).not.toBeNull();
    expect(within(blocks).getByText("09:00")).toBeInTheDocument(); // the time becomes a pill
    expect(within(blocks).getByText("Sarapan di Tsukiji")).toBeInTheDocument();
    expect(blocks.querySelector("dl")).not.toBeNull();
    expect(within(blocks).getByText("Datang pagi biar sepi")).toBeInTheDocument();
    // A place is tappable and asks Travo about it.
    fireEvent.click(within(blocks).getByRole("button", { name: "Ueno" }));
    await waitFor(() =>
      expect(sendTripAssistantMessage).toHaveBeenCalledWith({
        data: { tripId: "trip-1", text: "Ceritakan lebih lanjut soal Ueno" },
      }),
    );
  });

  describe("Bagikan itinerary", () => {
    it("opens the share sheet from the chip, the summary card, and the words 'bagikan itinerary'", async () => {
      vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
      const onShare = vi.fn();
      setup({ onShare });
      fireEvent.click(await screen.findByRole("button", { name: "Bagikan" }));
      expect(onShare).toHaveBeenCalledTimes(1);
      fireEvent.change(screen.getByRole("textbox", { name: /Pesan untuk/ }), {
        target: { value: "bagikan itinerary ke temanku" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
      await waitFor(() => expect(onShare).toHaveBeenCalledTimes(2));
      expect(sendTripAssistantMessage).not.toHaveBeenCalled(); // no AI call, no quota
    });
  });

  describe("Google Sheets and Drive from the chat", () => {
    it("opens the spreadsheet or the Drive document without asking the model", async () => {
      vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
      setup();
      const box = await screen.findByRole("textbox", { name: /Pesan untuk/ });
      fireEvent.change(box, { target: { value: "buka google sheets" } });
      fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
      await waitFor(() =>
        expect(openTripGoogleLink).toHaveBeenCalledWith({
          data: { tripId: "trip-1", target: "sheet" },
        }),
      );
      fireEvent.change(box, { target: { value: "simpan ke drive" } });
      fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
      await waitFor(() =>
        expect(openTripGoogleLink).toHaveBeenCalledWith({
          data: { tripId: "trip-1", target: "drive" },
        }),
      );
      expect(sendTripAssistantMessage).not.toHaveBeenCalled();
      expect(streamTripAssistantMessage).not.toHaveBeenCalled();
    });
  });

  describe("Ringkas semua", () => {
    const summary: TripSummary = {
      name: "Jepang",
      destination: "Jepang",
      cities: ["Tokyo"],
      travelers: 2,
      currency: "IDR",
      datesLabel: "Min, 8 Nov – Kam, 12 Nov",
      countdown: "Hari ke-2 dari 5",
      agenda: {
        total: 2,
        daysTotal: 5,
        daysFilled: 1,
        pinned: 1,
        days: [
          {
            date: "2026-11-08",
            label: "Min, 8 Nov",
            empty: false,
            items: [
              {
                id: "a",
                time: "10:00",
                title: "Donki",
                place: "Donki",
                pinned: true,
                clash: false,
              },
            ],
          },
          { date: "2026-11-09", label: "Sen, 9 Nov", empty: true, items: [] },
        ],
      },
      budget: {
        set: true,
        totalMinor: 1_000_000_000,
        spentMinor: 16_600_000,
        remainingMinor: 983_400_000,
        percent: 2,
        categories: [{ name: "Makan", allocatedMinor: 300_000_000, spentMinor: 16_600_000 }],
        expenseCount: 2,
        recent: [],
      },
      checklist: { done: 1, total: 3, open: [{ id: "c2", title: "Visa" }] },
      bookings: [
        {
          id: "b1",
          title: "Hotel Shinjuku",
          category: "Akomodasi",
          status: "confirmed",
          pending: false,
        },
      ],
      attention: [{ id: "empty", text: "3 hari belum punya agenda", action: "plan" }],
    };

    it("is the first quick action and puts the whole trip in one balloon", async () => {
      vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
      setup({ summary });
      const chip = await screen.findByRole("button", { name: "Ringkas semua" });
      const row = chip.parentElement!;
      expect(row.firstElementChild).toBe(chip); // left of "Buat itinerary"
      fireEvent.click(chip);
      expect(await screen.findByText("Ringkas semua perjalananku")).toBeInTheDocument();
      const card = await screen.findByTestId("trip-summary", {}, { timeout: 3000 });
      const inside = within(card);
      // Every page is in it.
      expect(inside.getByText("Min, 8 Nov – Kam, 12 Nov · 2 traveler")).toBeInTheDocument();
      expect(inside.getByText("Hari ke-2 dari 5")).toBeInTheDocument();
      expect(inside.getByText("Donki")).toBeInTheDocument(); // Agenda
      expect(inside.getByText("Anggaran")).toBeInTheDocument(); // Biaya
      expect(inside.getByText("Visa")).toBeInTheDocument(); // Checklist
      expect(inside.getByText("Hotel Shinjuku")).toBeInTheDocument(); // Booking
      // ...and it lives inside Travo's balloon with its sentence.
      expect(card.parentElement!.textContent).toContain("Ini ringkasan lengkap");
      // No AI call, no quota used; the exchange is remembered so a refresh brings it back.
      expect(sendTripAssistantMessage).not.toHaveBeenCalled();
      expect(recordTripSummary).toHaveBeenCalledWith({ data: { tripId: "trip-1" } });
      expect(streamTripAssistantMessage).not.toHaveBeenCalled();
    });

    it("acts on what needs attention", async () => {
      vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
      vi.mocked(streamTripAssistantMessage).mockRejectedValue(new Error("no stream"));
      vi.mocked(sendTripAssistantMessage).mockResolvedValue({
        status: "ok",
        remaining: 9,
        messages: [assistantMsg({ content: "Siap." })],
      });
      setup({ summary });
      fireEvent.click(await screen.findByRole("button", { name: "Ringkas semua" }));
      const attention = await screen.findByTestId("summary-attention", {}, { timeout: 3000 });
      fireEvent.click(within(attention).getByRole("button", { name: "Isi" }));
      await waitFor(() =>
        expect(sendTripAssistantMessage).toHaveBeenCalledWith({
          data: {
            tripId: "trip-1",
            text: "Buatkan itinerary untuk hari yang masih kosong.",
            intent: "plan",
          },
        }),
      );
    });

    it("sections fold and an empty day offers to be filled", async () => {
      vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
      setup({ summary });
      fireEvent.click(await screen.findByRole("button", { name: "Ringkas semua" }));
      const card = await screen.findByTestId("trip-summary", {}, { timeout: 3000 });
      expect(
        within(card).getByRole("button", { name: "Isi hari ini bersama Travo" }),
      ).toBeInTheDocument();
      const head = within(card).getByRole("button", { name: /Agenda per hari/ });
      expect(head).toHaveAttribute("aria-expanded", "true");
      fireEvent.click(head);
      expect(head).toHaveAttribute("aria-expanded", "false");
    });

    it("has no button without trip data", async () => {
      vi.mocked(loadTripAssistant).mockResolvedValue({ status: available, messages: [] });
      setup();
      await screen.findByLabelText("Pesan untuk Travo");
      expect(screen.queryByRole("button", { name: "Ringkas semua" })).toBeNull();
    });
  });
});
