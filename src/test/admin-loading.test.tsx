import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AdminLoadingContent } from "@/components/admin-loading";

afterEach(cleanup);

it("shows an accessible loading state with placeholders for summaries and records", () => {
  render(<AdminLoadingContent label="Memuat katalog…" />);
  const state = screen.getByRole("status");
  expect(state).toHaveAttribute("aria-busy", "true");
  expect(state).toHaveTextContent("Memuat katalog…");
  expect(screen.getByTestId("admin-loading-summary")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getAllByTestId("admin-loading-row")).toHaveLength(4);
});
