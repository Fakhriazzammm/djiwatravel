import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TravelpayoutsWidget } from "@/components/travelpayouts-widget";

afterEach(cleanup);

const SRC = "/tiket-widget.html?flightSearch=CGK2012TYO1#12345";
const frameOf = (container: HTMLElement) => container.querySelector("iframe")!;

/** Delivers a message to the window the way the frame page would. */
function fromFrame(frame: HTMLIFrameElement, data: unknown, origin = window.location.origin) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", { data, origin, source: frame.contentWindow }),
    );
  });
}

describe("TravelpayoutsWidget (same-origin frame)", () => {
  it("renders the results in a frame, not in the app page", () => {
    const { container } = render(<TravelpayoutsWidget src={SRC} />);
    const frame = frameOf(container);
    expect(frame.getAttribute("src")).toBe(SRC);
    expect(frame.getAttribute("title")).toBe("Semua penerbangan");
    expect(frame.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    // Nothing of the partner's markup or script lands in the app document.
    expect(document.getElementById("tpwl-tickets")).toBeNull();
    expect(document.getElementById("tpwl-search")).toBeNull();
    expect(document.head.querySelector("script[src*='tpwdgt']")).toBeNull();
  });

  it("grows with the height the frame reports", () => {
    const { container } = render(<TravelpayoutsWidget src={SRC} />);
    const frame = frameOf(container);
    expect(frame.style.height).toBe("320px");
    fromFrame(frame, { type: "djiwa-tpwl-height", height: 2480 });
    expect(frame.style.height).toBe("2480px");
  });

  it("keeps the height within sane bounds", () => {
    const { container } = render(<TravelpayoutsWidget src={SRC} />);
    const frame = frameOf(container);
    fromFrame(frame, { type: "djiwa-tpwl-height", height: 5 });
    expect(frame.style.height).toBe("320px");
    fromFrame(frame, { type: "djiwa-tpwl-height", height: 9_000_000 });
    expect(frame.style.height).toBe("12000px");
  });

  it("ignores messages from other origins, other windows or of another shape", () => {
    const { container } = render(<TravelpayoutsWidget src={SRC} />);
    const frame = frameOf(container);
    fromFrame(frame, { type: "djiwa-tpwl-height", height: 999 }, "https://evil.example");
    expect(frame.style.height).toBe("320px");
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "djiwa-tpwl-height", height: 999 },
          origin: window.location.origin,
          source: window,
        }),
      );
    });
    expect(frame.style.height).toBe("320px");
    fromFrame(frame, { type: "other", height: 999 });
    fromFrame(frame, { type: "djiwa-tpwl-height", height: "999" });
    fromFrame(frame, null);
    expect(frame.style.height).toBe("320px");
  });
});
