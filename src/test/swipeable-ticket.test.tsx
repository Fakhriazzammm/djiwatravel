// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SwipeableTicket } from "@/components/swipeable-ticket";

describe("SwipeableTicket", () => {
  it("renders the actions behind the card and runs them", () => {
    const archive = vi.fn();
    const share = vi.fn();
    render(
      <SwipeableTicket
        isOpen={false}
        onOpen={() => undefined}
        onClose={() => undefined}
        leftActions={[{ key: "s", label: "Bagikan", icon: null, className: "", onClick: share }]}
        rightActions={[{ key: "a", label: "Arsip", icon: null, className: "", onClick: archive }]}
      >
        <a href="/trip">Tokyo</a>
      </SwipeableTicket>,
    );
    fireEvent.click(screen.getByText("Arsip"));
    fireEvent.click(screen.getByText("Bagikan"));
    expect(archive).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledOnce();
    expect(screen.getByText("Tokyo")).toBeTruthy();
  });
});
