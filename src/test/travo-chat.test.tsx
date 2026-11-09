import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TravoChat } from "@/components/travo-chat";
import {
  applyTripAssistantProposal,
  listTravoConversations,
  loadTravo,
  sendTripAssistantMessage,
  streamTripAssistantMessage,
} from "@/lib/trip-assistant.fn";
import type { AssistantMessage } from "@/lib/trip-assistant";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a data-link {...(rest as object)}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
  useRouter: () => ({ invalidate: vi.fn(), history: { back: vi.fn() } }),
}));
vi.mock("@/lib/my-trips.fn", () => ({
  getTrip: vi.fn(async () => ({
    trip: {
      id: "t1",
      name: "Jepang",
      destination_name: "Japan",
      departure_date: "2026-11-07",
      return_date: "2026-11-12",
      travelers_count: 2,
      primary_currency: "IDR",
      total_budget_minor: 1000000000,
    },
    itinerary: [],
    budget: [],
    expenses: [],
    checklist: [],
    bookings: [],
    totals: { remainingMinor: 1000000000 },
    share: null,
  })),
  getTripShare: vi.fn(),
  postTripShare: vi.fn(),
  deleteTripShare: vi.fn(),
}));
vi.mock("@/lib/receipt-scan.fn", () => ({ getReceiptScanStatus: vi.fn(async () => null) }));
vi.mock("@/components/esim-checkout-sheet", () => ({
  EsimCheckoutSheet: ({ packageCode }: { packageCode: string | null }) =>
    packageCode ? <div data-testid="checkout-open">{packageCode}</div> : null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trip-assistant.fn", () => ({
  loadTravo: vi.fn(),
  loadTripAssistant: vi.fn(),
  listTravoConversations: vi.fn(),
  deleteTravoConversation: vi.fn(),
  sendTripAssistantMessage: vi.fn(),
  streamTripAssistantMessage: vi.fn(),
  applyTripAssistantProposal: vi.fn(),
  undoTripAssistantProposal: vi.fn(),
  dismissTripAssistantProposal: vi.fn(),
}));

const available = {
  available: true as const,
  guest: false,
  remaining: 12,
  dailyLimit: 30,
  canAgenda: true,
  canBudget: true,
};
const msg = (over: Partial<AssistantMessage>): AssistantMessage => ({
  id: "m",
  role: "assistant",
  content: "",
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

beforeEach(() => {
  // jsdom has no layout, so no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
  vi.mocked(listTravoConversations).mockResolvedValue([]);
});
afterEach(cleanup);

describe("Travo page", () => {
  it("starts empty, sends a general question and moves the address to the new conversation", async () => {
    vi.mocked(loadTravo).mockResolvedValue({
      status: available,
      loggedIn: true,
      conversation: null,
      messages: [],
    });
    vi.mocked(streamTripAssistantMessage).mockRejectedValue(new Error("no stream"));
    vi.mocked(sendTripAssistantMessage).mockResolvedValue({
      status: "ok",
      remaining: 11,
      conversationId: "c-new",
      messages: [
        msg({ id: "u", role: "user", content: "eSIM Korea?" }),
        msg({ id: "a", content: "Cukup 1 GB per hari." }),
      ],
    });
    render(<TravoChat />);
    expect(await screen.findByText("Hai, aku Travo")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Pesan untuk Travo"), {
      target: { value: "eSIM Korea?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    expect(await screen.findByText("Cukup 1 GB per hari.")).toBeTruthy();
    // A general chat is sent by scope, not by trip.
    expect(sendTripAssistantMessage).toHaveBeenCalledWith({
      data: { text: "eSIM Korea?", scope: "all" },
    });
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: "/travo", search: { c: "c-new" } }),
      ),
    );
  });

  it("opens a trip chat with the same features as Ringkas: apply works here too", async () => {
    vi.mocked(loadTravo).mockResolvedValue({
      status: available,
      loggedIn: true,
      conversation: { id: "c1", tripId: "t1", title: "Jepang", scope: "trip", tripCurrency: "IDR" },
      messages: [
        msg({ id: "u", role: "user", content: "buat agenda" }),
        msg({ id: "a", content: "Saya usul begini.", proposal }),
      ],
    });
    vi.mocked(applyTripAssistantProposal).mockResolvedValue({ ok: true, pinned: 0 } as never);
    render(<TravoChat conversationId="c1" />);
    expect(await screen.findByText("Saya usul begini.")).toBeTruthy();
    // Trip shortcuts are there, and the topic chips (general chats only) are not.
    expect(screen.getByRole("button", { name: "Buat itinerary" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /terapkan/i }));
    await waitFor(() =>
      expect(applyTripAssistantProposal).toHaveBeenCalledWith({ data: { proposalId: "p1" } }),
    );
  });

  it("asks a visitor without a session to sign in", async () => {
    vi.mocked(loadTravo).mockResolvedValue({
      status: { available: false, reason: "off" },
      loggedIn: false,
      conversation: null,
      messages: [],
    });
    render(<TravoChat />);
    expect(await screen.findByText("Masuk untuk ngobrol")).toBeTruthy();
    expect(screen.queryByLabelText("Pesan untuk Travo")).toBeNull();
  });

  it("gives a trip chat the same tools as Ringkas: the summary card and Ringkas semua", async () => {
    vi.mocked(loadTravo).mockResolvedValue({
      status: available,
      loggedIn: true,
      conversation: { id: "c1", tripId: "t1", title: "Jepang", scope: "trip", tripCurrency: "IDR" },
      messages: [
        msg({ id: "u", role: "user", content: "Ringkas semua perjalananku", local: "summary" }),
        msg({ id: "a", content: "Ini ringkasan lengkap.", local: "summary" }),
      ],
    });
    render(<TravoChat conversationId="c1" />);
    // The stored summary exchange comes back as the live card, not as plain text.
    expect(await screen.findByTestId("trip-summary")).toBeTruthy();
    expect(screen.getByRole("button", { name: /ringkas semua/i })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /bagikan/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Catat biaya" })).toBeTruthy();
  });

  it("shows live eSIM plans in the answer and opens checkout inside the chat", async () => {
    vi.mocked(loadTravo).mockResolvedValue({
      status: available,
      loggedIn: true,
      conversation: { id: "c2", tripId: null, title: "eSIM", scope: "all", tripCurrency: null },
      messages: [
        msg({ id: "u", role: "user", content: "eSIM Jepang" }),
        msg({
          id: "a",
          content: "Ini pilihan terbaik.",
          chips: { options: ["Paket lain"], multi: false },
          cards: [
            {
              kind: "esim",
              destination: { code: "JP", name: "Jepang", flag: "🇯🇵" },
              picks: [
                {
                  packageCode: "JP-7D",
                  tag: "Terlaris",
                  name: "Jepang 7 hari",
                  dataLabel: "1 GB/hari",
                  days: 7,
                  priceIdr: 89000,
                  preorder: false,
                },
              ],
              total: 5,
              fromPriceIdr: 89000,
            },
          ],
        }),
      ],
    });
    render(<TravoChat conversationId="c2" />);
    expect(await screen.findByTestId("travo-card-esim")).toBeTruthy();
    expect(screen.getByText("Rp89.000")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Beli" }));
    expect(screen.getByTestId("checkout-open").textContent).toBe("JP-7D");
    // "Paket lain" asks Travo for more plans, in the same chat.
    vi.mocked(streamTripAssistantMessage).mockRejectedValue(new Error("no stream"));
    vi.mocked(sendTripAssistantMessage).mockResolvedValue({
      status: "ok",
      remaining: 10,
      messages: [],
    });
    fireEvent.click(screen.getByRole("button", { name: /paket lain \(/i }));
    await waitFor(() => expect(sendTripAssistantMessage).toHaveBeenCalled());
  });
});
