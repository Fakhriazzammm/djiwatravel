import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeHero } from "@/components/home-hero";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...(rest as object)}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const props = {
  mode: "auto" as never,
  headerAction: null,
  searchHint: "Cari Singapura",
  searchOpen: false,
  onOpenSearch: vi.fn(),
};

describe("Home hero Tiket tab", () => {
  it("has no tabs when Admin turned the tab off (the pill stays the eSIM search)", () => {
    render(<HomeHero {...props} flightsTab={false} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("Cari Singapura")).toBeTruthy();
  });

  it("keeps eSIM as the default and switches the pill to the flight search", () => {
    render(<HomeHero {...props} flightsTab />);
    expect(screen.getByRole("tab", { name: "eSIM" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Cari Singapura")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Tiket/ }));
    const link = screen.getByRole("link", { name: /Cari tiket pesawat/ });
    expect(link.getAttribute("href")).toBe("/tiket");
    expect(screen.queryByText("Cari Singapura")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "eSIM" }));
    expect(screen.getByText("Cari Singapura")).toBeTruthy();
  });
});
