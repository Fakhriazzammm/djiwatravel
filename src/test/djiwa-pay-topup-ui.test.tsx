import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DjiwaPayTopup } from "@/components/djiwa-pay-topup";
import { beginDjiwaPayTopup, resetDjiwaPayTopupIdempotency } from "@/lib/djiwa-pay-topup-client";

vi.mock("@/lib/djiwa-pay-topup-client", () => ({
  beginDjiwaPayTopup: vi.fn(),
  resetDjiwaPayTopupIdempotency: vi.fn(),
}));

afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());

describe("Djiwa Pay top-up card", () => {
  it("offers presets and keeps the selected amount editable", () => {
    render(<DjiwaPayTopup userId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Rp50.000" }));

    expect(screen.getByRole("button", { name: "Rp50.000" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Nominal isi saldo dalam rupiah")).toHaveValue("50.000");
  });

  it("validates the minimum without creating an invoice", () => {
    render(<DjiwaPayTopup userId="user-1" />);
    const input = screen.getByLabelText("Nominal isi saldo dalam rupiah");

    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Buat invoice top up" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Minimal isi saldo Rp1.000.");
    expect(beginDjiwaPayTopup).not.toHaveBeenCalled();
  });

  it("shows a truthful pending invoice and blocks duplicate submission", async () => {
    let resolveInvoice: ((value: { invoice_url: string }) => void) | undefined;
    vi.mocked(beginDjiwaPayTopup).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInvoice = resolve;
        }),
    );
    render(<DjiwaPayTopup userId="user-1" />);
    const submit = screen.getByRole("button", { name: "Buat invoice top up" });

    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(beginDjiwaPayTopup).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Menyiapkan invoice… Jangan tutup halaman ini.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menyiapkan invoice…" })).toBeDisabled();

    resolveInvoice?.({ invoice_url: "https://payments.example/invoice-1" });
    await waitFor(() =>
      expect(
        screen.getByText("Invoice siap, pembayaran masih menunggu konfirmasi."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Saldo belum bertambah/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buka invoice pembayaran" })).toHaveAttribute(
      "href",
      "https://payments.example/invoice-1",
    );
  });

  it("resets only local invoice state for an explicit new invoice recovery path", async () => {
    vi.mocked(beginDjiwaPayTopup).mockResolvedValue({
      invoice_url: "https://payments.example/invoice-1",
    });
    render(<DjiwaPayTopup userId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Buat invoice top up" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Buat invoice baru" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Buat invoice baru" }));

    expect(resetDjiwaPayTopupIdempotency).toHaveBeenCalledWith("user-1");
    expect(screen.getByRole("button", { name: "Buat invoice top up" })).toBeInTheDocument();
    expect(
      screen.queryByText("Invoice siap, pembayaran masih menunggu konfirmasi."),
    ).not.toBeInTheDocument();
  });
});
