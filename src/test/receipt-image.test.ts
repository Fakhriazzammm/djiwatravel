import { describe, expect, it } from "vitest";
import { frameDifference, frameStats, looksLikeReceipt } from "@/lib/receipt-image";

const W = 64;
const H = 48;
const frame = (center: number, edge: number) => {
  const gray = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const inside = x > W * 0.22 && x < W * 0.78 && y > H * 0.2 && y < H * 0.8;
      gray[y * W + x] = inside ? center : edge;
    }
  return gray;
};

describe("camera hints for scanning receipts", () => {
  it("sees a bright paper on a darker table as a receipt", () => {
    expect(looksLikeReceipt(frameStats(frame(210, 70), W, H))).toBe(true);
  });

  it("does not trigger on an empty table, a dark frame or a uniformly bright wall", () => {
    expect(looksLikeReceipt(frameStats(frame(60, 60), W, H))).toBe(false);
    expect(looksLikeReceipt(frameStats(frame(90, 40), W, H))).toBe(false);
    expect(looksLikeReceipt(frameStats(frame(220, 215), W, H))).toBe(false);
  });

  it("tells a still phone from a moving one", () => {
    const a = frame(200, 60);
    expect(frameDifference(a, a)).toBe(0);
    expect(frameDifference(a, frame(190, 80))).toBeGreaterThan(7);
    expect(frameDifference(a, frame(201, 61))).toBeLessThan(2.4);
  });
});
