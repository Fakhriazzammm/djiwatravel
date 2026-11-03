import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("trip bottom tab order", () => {
  it("runs Ringkas, Agenda, Biaya, Checklist, Booking", () => {
    const source = readFileSync("src/components/trip-ios.tsx", "utf8");
    const labels = [...source.matchAll(/\{ id: "\w+", label: "(\w+)", icon: \w+ \}/g)].map(
      (match) => match[1],
    );
    expect(labels).toEqual(["Ringkas", "Agenda", "Biaya", "Checklist", "Booking"]);
  });
});
