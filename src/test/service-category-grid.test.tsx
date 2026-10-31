import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceCategoryGrid } from "@/components/explore/service-category-grid";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: React.ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("travel service grid", () => {
  it("opens the available eSIM service and explains upcoming services", () => {
    render(<ServiceCategoryGrid />);
    expect(screen.getByRole("link", { name: /eSIM: buka halaman layanan/i })).toHaveAttribute(
      "href",
      "/esim/finder",
    );
    fireEvent.click(screen.getByRole("button", { name: /Aktivitas: Segera hadir/i }));
    expect(screen.getByRole("status")).toHaveTextContent("Aktivitas segera hadir");
    fireEvent.click(screen.getByRole("button", { name: /Visa: Segera hadir/i }));
    expect(screen.getByRole("status")).toHaveTextContent("Visa segera hadir");
  });
});
