import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SocialShare } from "@/components/social-share";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("social share images", () => {
  it("shares every generated itinerary Story page together", async () => {
    const first = new File(["first"], "tokyo-hari-1.png", { type: "image/png" });
    const second = new File(["second"], "tokyo-hari-2.png", { type: "image/png" });
    const canShare = vi.fn(({ files }: { files?: File[] }) => files?.length === 2);
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "canShare", { configurable: true, value: canShare });
    Object.defineProperty(navigator, "share", { configurable: true, value: share });

    render(
      <SocialShare
        url="https://djiwatravel.com/share/example"
        text="Itinerary Tokyo"
        makeImage={async () => [first, second]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bagikan ke Instagram Story" }));

    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(share).toHaveBeenCalledWith({
      files: [first, second],
      text: "Itinerary Tokyo",
      url: "https://djiwatravel.com/share/example",
    });
  });
});
