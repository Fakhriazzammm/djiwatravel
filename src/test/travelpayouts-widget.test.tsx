import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TravelpayoutsWidget } from "@/components/travelpayouts-widget";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  document.head.querySelectorAll("script[data-travelpayouts-widget]").forEach((el) => el.remove());
});

const SRC = "https://tpwdgt.com/wl_web/main.js?wl_id=12345";
const scripts = () =>
  document.head.querySelectorAll<HTMLScriptElement>("script[data-travelpayouts-widget]");

describe("TravelpayoutsWidget", () => {
  it("renders the two elements the partner script fills, form above results", () => {
    const { container } = render(<TravelpayoutsWidget scriptSrc={SRC} code={null} />);
    const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
    expect(ids).toEqual(["tpwl-search", "tpwl-tickets"]);
  });

  it("adds the module script once the elements exist, with a cache buster", () => {
    render(<TravelpayoutsWidget scriptSrc={SRC} code={null} />);
    const [script] = Array.from(scripts());
    expect(scripts()).toHaveLength(1);
    expect(script!.type).toBe("module");
    expect(script!.src.startsWith(`${SRC}&r=`)).toBe(true);
  });

  it("removes the script when leaving and runs a fresh copy on the next visit", () => {
    const first = render(<TravelpayoutsWidget scriptSrc={SRC} code={null} />);
    const firstSrc = scripts()[0]!.src;
    first.unmount();
    expect(scripts()).toHaveLength(0);
    render(<TravelpayoutsWidget scriptSrc={SRC} code={null} />);
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]!.src.startsWith(`${SRC}&r=`)).toBe(true);
    expect(firstSrc.startsWith(`${SRC}&r=`)).toBe(true);
  });

  it("puts the search in the page address for the widget to read, and takes it out again", () => {
    window.history.replaceState(null, "", "/tiket?dari=CGK");
    const { unmount } = render(<TravelpayoutsWidget scriptSrc={SRC} code="CGK2012TYO1" />);
    const url = new URL(window.location.href);
    expect(url.searchParams.get("flightSearch")).toBe("CGK2012TYO1");
    expect(url.searchParams.get("dari")).toBe("CGK");
    unmount();
    const after = new URL(window.location.href);
    expect(after.searchParams.has("flightSearch")).toBe(false);
    expect(after.searchParams.get("dari")).toBe("CGK");
  });

  it("leaves the address alone when there is no search to fill in", () => {
    window.history.replaceState(null, "", "/tiket?dari=CGK");
    render(<TravelpayoutsWidget scriptSrc={SRC} code={null} />);
    expect(window.location.search).toBe("?dari=CGK");
  });
});
