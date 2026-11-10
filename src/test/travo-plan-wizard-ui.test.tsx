import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TravoPlanWizard } from "@/components/travo-plan-wizard";
import { createPlanTrip, streamTripAssistantMessage } from "@/lib/trip-assistant.fn";

vi.setConfig({ testTimeout: 30_000 });
const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/trip-assistant.fn", () => ({
  createPlanTrip: vi.fn(),
  streamTripAssistantMessage: vi.fn(),
}));
vi.mock("@/components/flight-place-field", () => ({
  FlightPlaceField: ({ onPick }: { onPick: (p: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onPick({ code: "CGK", name: "Jakarta", countryName: "Indonesia", type: "city" })
      }
    >
      pilih-jakarta
    </button>
  ),
}));
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
});
afterEach(cleanup);

const tap = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("button", { name }, { timeout: 3000 }));
const tomorrow = () => new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

describe("planning wizard", () => {
  it("rejects a bad answer in Travo's voice and lets the traveler type another", async () => {
    render(<TravoPlanWizard onExit={vi.fn()} />);
    const box = await screen.findByLabelText("Ketik negara tujuan", {}, { timeout: 3000 });
    fireEvent.change(box, { target: { value: "negaraanehxyz" } });
    fireEvent.submit(box.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(/belum menemukan negara/);
    fireEvent.change(box, { target: { value: "thailand" } });
    fireEvent.submit(box.closest("form")!);
    expect(await screen.findByText(/Kota mana di Thailand/, {}, { timeout: 3000 })).toBeTruthy();
  });

  it("asks everything one by one, then creates the trip and builds the plan with live progress", async () => {
    vi.mocked(createPlanTrip).mockResolvedValue({
      status: "ok",
      tripId: "t-1",
      text: "Buatkan rencana lengkap 5 hari di Tokyo, tiket pulang-pergi.",
    });
    async function* events() {
      yield { type: "status", text: "Mengumpulkan harga tiket…" };
      yield { type: "status", text: "Mencari tempat di peta Tokyo…" };
      yield { type: "status", text: "Menyusun rencana harian…" };
      yield { type: "done", result: { status: "ok", remaining: 8, messages: [] } };
    }
    vi.mocked(streamTripAssistantMessage).mockResolvedValue(events() as never);
    render(<TravoPlanWizard onExit={vi.fn()} />);
    await tap("Jepang");
    await tap("Tokyo");
    await tap("pilih-jakarta");
    await tap("Pulang-pergi");
    const date = await screen.findByLabelText("Pilih tanggal berangkat", {}, { timeout: 3000 });
    fireEvent.change(date, { target: { value: tomorrow() } });
    fireEvent.submit(date.closest("form")!);
    await tap("5 hari");
    await tap("2 orang");
    await tap("Hitungkan saja");
    await tap("Nyaman");
    await tap(/Kuliner/);
    await tap(/^Lanjut/);
    await tap("Ya, sertakan eSIM");
    const recap = await screen.findByTestId("plan-recap", {}, { timeout: 3000 });
    expect(within(recap).getByText("Tokyo, Jepang")).toBeTruthy();
    expect(within(recap).getByText("pulang-pergi")).toBeTruthy();
    expect(within(recap).getByText("Kuliner")).toBeTruthy();
    fireEvent.click(within(recap).getByRole("button", { name: "Buat rencana lengkap" }));
    await waitFor(() =>
      expect(createPlanTrip).toHaveBeenCalledWith({
        data: expect.objectContaining({
          country: { code: "JP", name: "Jepang" },
          city: expect.objectContaining({ name: "Tokyo" }),
          origin: { code: "CGK", name: "Jakarta" },
          oneWay: false,
          days: 5,
          travelers: 2,
          budgetIdr: 0,
          style: "nyaman",
          interests: ["Kuliner"],
          esim: true,
        }),
      }),
    );
    await waitFor(() =>
      expect(streamTripAssistantMessage).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tripId: "t-1",
          intent: "full_plan",
          plan: { oneWay: false, style: "nyaman", interests: ["Kuliner"], esim: true },
        }),
      }),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/my-trips/$tripId", params: { tripId: "t-1" } }),
    );
  });

  it("tells the traveler when the plan cannot be made and does not leave", async () => {
    vi.mocked(createPlanTrip).mockResolvedValue({
      status: "limit",
      message: "Rencana lengkap gratis untuk tamu sudah terpakai.",
    });
    render(<TravoPlanWizard onExit={vi.fn()} />);
    await tap("Jepang");
    await tap("Tokyo");
    await tap("Belum tahu");
    await tap("Sekali jalan");
    const date = await screen.findByLabelText("Pilih tanggal berangkat", {}, { timeout: 3000 });
    fireEvent.change(date, { target: { value: tomorrow() } });
    fireEvent.submit(date.closest("form")!);
    await tap("3 hari");
    await tap("1 orang");
    await tap("Rp 10 juta");
    await tap("Hemat");
    await tap(/Terserah Travo/);
    await tap("Tidak perlu");
    fireEvent.click(
      await screen.findByRole("button", { name: "Buat rencana lengkap" }, { timeout: 3000 }),
    );
    expect(await screen.findByText(/sudah terpakai/)).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
    expect(streamTripAssistantMessage).not.toHaveBeenCalled();
  });
});
