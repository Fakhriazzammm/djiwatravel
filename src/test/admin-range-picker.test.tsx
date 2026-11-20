import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminRangePicker } from "@/components/admin-range-picker";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate }),
}));

afterEach(() => {
  cleanup();
  navigate.mockClear();
});

describe("Admin range picker", () => {
  it("opens in a viewport-aware portal aligned to the start of the trigger", () => {
    const { container } = render(
      <AdminRangePicker to="/admin/dashboard" search={{}} value={{ range: "24j" }} />,
    );

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const panel = screen.getByRole("dialog", { name: "Pilih rentang waktu" });

    expect(container).not.toContainElement(panel);
    expect(panel).toHaveAttribute("data-align", "start");
    expect(panel).toHaveClass("overflow-y-auto");
  });

  it("applies a valid custom range and keeps the active analytics tab", () => {
    render(
      <AdminRangePicker
        to="/admin/analytics"
        search={{ tab: "sales" }}
        value={{ range: "kustom", from: "2026-10-01", to: "2026-10-05" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const from = screen.getByLabelText("Dari tanggal");
    const until = screen.getByLabelText("Sampai tanggal");
    const apply = screen.getByRole("button", { name: "Terapkan rentang" });

    fireEvent.change(from, { target: { value: "2026-10-06" } });
    expect(apply).toBeDisabled();
    fireEvent.change(until, { target: { value: "2026-10-10" } });
    fireEvent.click(apply);

    expect(navigate).toHaveBeenCalledWith({
      to: "/admin/analytics",
      search: { tab: "sales", range: "kustom", from: "2026-10-06", to: "2026-10-10" },
    });
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
  });
});
