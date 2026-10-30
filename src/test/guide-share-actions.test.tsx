import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuideShareActions } from "@/components/guide-share-actions";

describe("guide share actions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("offers WhatsApp, X, Facebook, and copy-link sharing for an article", () => {
    render(
      <GuideShareActions
        title="Panduan eSIM Jepang"
        url="https://djiwatravel.com/panduan/esim-jepang"
      />,
    );

    expect(screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href"))
      .toContain("https://wa.me/?text=");
    expect(screen.getByRole("link", { name: "Facebook" }).getAttribute("href"))
      .toContain("https://www.facebook.com/sharer/sharer.php?");
    expect(screen.getByRole("link", { name: "X" }).getAttribute("href"))
      .toContain("https://twitter.com/intent/tweet?");
    expect(screen.getByRole("button", { name: "Salin tautan" })).toBeTruthy();
  });

  it("copies the article URL and confirms the action accessibly", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<GuideShareActions title="Panduan eSIM" url="https://djiwatravel.com/panduan/esim" />);

    fireEvent.click(screen.getByRole("button", { name: "Salin tautan" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://djiwatravel.com/panduan/esim"));
    expect(await screen.findByRole("status")).toHaveTextContent("Tautan panduan disalin.");
  });

  it("uses the native share sheet when the browser supports it", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<GuideShareActions title="Panduan eSIM" url="https://djiwatravel.com/panduan/esim" />);

    const button = await screen.findByRole("button", { name: "Bagikan panduan" });
    fireEvent.click(button);

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Panduan eSIM",
        url: "https://djiwatravel.com/panduan/esim",
      }),
    );
  });
});
