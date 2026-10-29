import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DjiwaPayBrowser } from "@/components/djiwa-pay-browser";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

    expect(document.querySelector('[data-layout="page"]')).toBeInTheDocument();
  });

  it("does not load the raw Pay page while shared auth is pending", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    render(<DjiwaPayBrowser open sharedAuth onOpenChange={vi.fn()} />);

    expect(screen.getByText("Menghubungkan ke Djiwa Pay…")).toBeInTheDocument();
    expect(screen.queryByTitle("Djiwa Pay")).not.toBeInTheDocument();
  });

  it("loads the bridged Pay URL after shared auth succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: "https://djiwapay.web.id/?bridgeToken=one-time-token" }),
      }),
    );

    render(<DjiwaPayBrowser open sharedAuth onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTitle("Djiwa Pay")).toHaveAttribute(
        "src",
        "https://djiwapay.web.id/?bridgeToken=one-time-token",
      );
    });
  });

  it("shows recovery guidance when shared auth cannot be established", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<DjiwaPayBrowser open sharedAuth onOpenChange={vi.fn()} />);

    expect(await screen.findByText("Sesi Djiwa Pay belum siap")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
    expect(screen.queryByTitle("Djiwa Pay")).not.toBeInTheDocument();
  });
});
