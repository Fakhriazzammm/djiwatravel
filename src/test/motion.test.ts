import { describe, expect, it, beforeEach } from "vitest";

import { consumeNavDirection, enterFrom, resolveNavDirection, resetNavMemory } from "@/lib/motion";

describe("resolveNavDirection", () => {
  it("treats the first render and same-path re-renders as initial", () => {
    expect(resolveNavDirection(null, "/")).toBe("initial");
    expect(resolveNavDirection("/catalog", "/catalog")).toBe("initial");
  });

  it("fades (never slides) when switching between top-level tabs", () => {
    expect(resolveNavDirection("/", "/explore")).toBe("tab");
    expect(resolveNavDirection("/explore", "/my-esim")).toBe("tab");
    expect(resolveNavDirection("/my-esim", "/profile")).toBe("tab");
  });

  it("pushes forward when the path gets deeper", () => {
    expect(resolveNavDirection("/", "/catalog")).toBe("forward");
    expect(resolveNavDirection("/catalog", "/checkout/SG-1")).toBe("forward");
    expect(resolveNavDirection("/my-esim", "/my-esim/order-1")).toBe("forward");
  });

  it("pops back when the path gets shallower", () => {
    expect(resolveNavDirection("/checkout/SG-1", "/catalog")).toBe("back");
    expect(resolveNavDirection("/my-esim/order-1", "/my-esim")).toBe("back");
    expect(resolveNavDirection("/catalog", "/")).toBe("tab");
  });

  it("treats a sibling swap under a tab as a forward push", () => {
    expect(resolveNavDirection("/order/a", "/order/b")).toBe("forward");
  });
});

describe("enterFrom", () => {
  it("enters from the right when pushing and from the left when popping", () => {
    expect(enterFrom("forward")).toMatchObject({ x: 24 });
    expect(enterFrom("back")).toMatchObject({ x: -24 });
  });

  it("never moves horizontally on a tab switch", () => {
    expect(enterFrom("tab")).toEqual({ opacity: 0, y: 8 });
    expect(enterFrom("initial")).toEqual({ opacity: 0 });
  });
});

describe("consumeNavDirection", () => {
  beforeEach(() => resetNavMemory());

  it("returns the frozen direction for repeated calls on the same page", () => {
    expect(consumeNavDirection("/")).toBe("initial");
    expect(consumeNavDirection("/catalog")).toBe("forward");
    // re-render of the same page must not recompute (exit animation depends on it)
    expect(consumeNavDirection("/catalog")).toBe("forward");
  });

  it("keeps direction per navigation step", () => {
    consumeNavDirection("/");
    expect(consumeNavDirection("/catalog")).toBe("forward");
    expect(consumeNavDirection("/checkout/X")).toBe("forward");
    expect(consumeNavDirection("/catalog")).toBe("back");
  });
});
