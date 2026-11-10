import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TripExportSheet } from "@/components/trip-export-sheet";
import { openTripGoogleLink } from "@/lib/trip-assistant.fn";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a data-link {...(rest as object)}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/trip-assistant.fn", () => ({ openTripGoogleLink: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const open = () =>
  render(<TripExportSheet open onOpenChange={vi.fn()} tripId="t-1" tripName="Tokyo" />);

describe("export sheet", () => {
  it("offers a PDF download through the print page, in a new tab", () => {
    open();
    const link = screen.getByTestId("export-download") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/my-trips/t-1/print?auto=1");
    expect(link.getAttribute("target")).toBe("_blank");
  });
  it("saves the PDF to Drive and shows the link", async () => {
    vi.mocked(openTripGoogleLink).mockResolvedValue({
      status: "ok",
      url: "https://drive.google.com/file/d/x/view",
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: /Simpan PDF ke Google Drive/ }));
    await waitFor(() =>
      expect(openTripGoogleLink).toHaveBeenCalledWith({ data: { tripId: "t-1", target: "pdf" } }),
    );
    expect((await screen.findByTestId("export-open-drive")).getAttribute("href")).toBe(
      "https://drive.google.com/file/d/x/view",
    );
  });
  it("says what to do when Google is not connected, or the visitor is a guest", async () => {
    vi.mocked(openTripGoogleLink).mockResolvedValue({
      status: "connect",
      message: "Hubungkan Google dulu di halaman Biaya.",
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: /Simpan PDF ke Google Drive/ }));
    expect(await screen.findByText(/Hubungkan Google dulu/)).toBeTruthy();
    expect(screen.getByText("Hubungkan di Biaya")).toBeTruthy();
    cleanup();
    vi.mocked(openTripGoogleLink).mockResolvedValue({
      status: "login",
      message: "Masuk atau daftar dulu untuk memakai Google Sheets dan Drive.",
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: /Simpan PDF ke Google Drive/ }));
    expect(await screen.findByText(/Masuk atau daftar dulu/)).toBeTruthy();
    expect(screen.queryByText("Hubungkan di Biaya")).toBeNull();
  });
});
