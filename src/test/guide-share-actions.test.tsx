import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuideShareActions } from "@/components/guide-share-actions";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("guide share actions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("offers Instagram Story, WhatsApp, Telegram, X, Facebook, image, and copy-link sharing", () => {
    render(
      <GuideShareActions
        title="Panduan eSIM Jepang"
        url="https://djiwatravel.com/panduan/esim-jepang"
      />,
    );
    for (const name of [
      "Bagikan ke Instagram Story",
      "WhatsApp",
      "Telegram",
      "X",
      "Facebook",
      "Gambar",
      "Salin",
    ])
      expect(screen.getByText(name)).toBeTruthy();
  });

  it("opens WhatsApp with the article URL", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<GuideShareActions title="Panduan eSIM" url="https://djiwatravel.com/panduan/esim" />);

    fireEvent.click(screen.getByText("WhatsApp"));

    expect(open.mock.calls[0]?.[0]).toContain("https://wa.me/?text=");
    expect(decodeURIComponent(String(open.mock.calls[0]?.[0]))).toContain(
      "https://djiwatravel.com/panduan/esim",
    );
  });

  it("copies the article URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<GuideShareActions title="Panduan eSIM" url="https://djiwatravel.com/panduan/esim" />);

    fireEvent.click(screen.getByText("Salin"));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("https://djiwatravel.com/panduan/esim"),
    );
  });
});
