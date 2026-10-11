import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DjiwaPayTopup, TOPUP_PENDING_KEY } from "@/components/djiwa-pay-topup";
import { beginDjiwaPayTopup } from "@/lib/djiwa-pay-topup-client";

vi.mock("@/lib/djiwa-pay-topup-client", () => ({ beginDjiwaPayTopup: vi.fn() }));
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); window.sessionStorage.clear(); });

function renderSheet() {
  return render(<DjiwaPayTopup userId="user-1" open onOpenChange={vi.fn()} creditedBefore={25_000} />);
}

describe("Djiwa Travel Isi Saldo sheet", () => {
  it("opens as an accessible sheet with four presets", () => {
    renderSheet();
    expect(screen.getByRole("dialog", { name: "Isi Saldo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rp50.000" }));
    expect(screen.getByRole("button", { name: "Rp50.000" })).toHaveAttribute("aria-pressed", "true");
  });

  it("supports keypad append, leading-zero stripping, delete, and eight digits", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Angka 0" }));
    fireEvent.click(screen.getByRole("button", { name: "Angka 5" }));
    expect(screen.getByText("Rp5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hapus satu angka" }));
    expect(screen.getByText("Rp0")).toBeInTheDocument();
    for (let index = 0; index < 10; index += 1) fireEvent.click(screen.getByRole("button", { name: "Angka 9" }));
    expect(screen.getByText("Rp99.999.999")).toBeInTheDocument();
  });

  it("keeps Lanjutkan disabled below the minimum", () => {
    renderSheet();
    expect(screen.getByRole("button", { name: "Lanjutkan" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Angka 9" }));
    expect(screen.getByRole("button", { name: "Lanjutkan" })).toBeDisabled();
  });

  it("persists the pending marker before redirecting to Mayar", async () => {
    vi.mocked(beginDjiwaPayTopup).mockResolvedValue({ topup_id: "t1", invoice_id: "i1", invoice_url: "https://payments.example/i1", status: "pending" });
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { assign } });
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Rp50.000" }));
    fireEvent.click(screen.getByRole("button", { name: "Lanjutkan" }));
    await waitFor(() => expect(beginDjiwaPayTopup).toHaveBeenCalledWith(50_000, "user-1"));
    const marker = JSON.parse(window.sessionStorage.getItem(`${TOPUP_PENDING_KEY}:user-1`) ?? "null");
    expect(marker).toEqual(expect.objectContaining({ amount: 50_000, creditedBefore: 25_000 }));
    expect(screen.getByText("Tunggu sebentar")).toBeInTheDocument();
    expect(assign).toHaveBeenCalledWith("https://payments.example/i1");
  });

  it("does not create an invoice below the minimum", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Angka 9" }));
    fireEvent.click(screen.getByRole("button", { name: "Angka 9" }));
    expect(screen.getByRole("button", { name: "Lanjutkan" })).toBeDisabled();
    expect(beginDjiwaPayTopup).not.toHaveBeenCalled();
  });
});
