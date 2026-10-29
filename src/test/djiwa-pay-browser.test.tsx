import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DjiwaPayBrowser } from "@/components/djiwa-pay-browser";

afterEach(cleanup);

describe("Djiwa Pay in-app browser", () => {
  it("does not render while closed", () => {
    render(<DjiwaPayBrowser open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByRole("dialog", { name: "Djiwa Pay" })).not.toBeInTheDocument();
  });

  it("renders the Djiwa Pay frame and external fallback while open", () => {
    render(<DjiwaPayBrowser open onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Djiwa Pay" })).toBeInTheDocument();
    expect(screen.getByTitle("Djiwa Pay")).toHaveAttribute("src", "https://djiwapay.web.id");
    expect(screen.getByRole("link", { name: "Buka di browser" })).toHaveAttribute(
      "href",
      "https://djiwapay.web.id",
    );
    expect(screen.getByRole("link", { name: "Buka di browser" })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("closes through the accessible close control", () => {
    const onOpenChange = vi.fn();
    render(<DjiwaPayBrowser open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Tutup Djiwa Pay" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("supports a page layout that ends above the Travel tab bar", () => {
    render(<DjiwaPayBrowser open layout="page" onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Djiwa Pay" })).toHaveAttribute(
      "data-layout",
      "page",
    );
  });
});
