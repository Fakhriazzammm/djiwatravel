import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Pages already migrated to the DESIGN.md "Mobile compact scale". Add a page here when you migrate it.
const COMPACT_PAGES = [
  "src/routes/notifications.tsx",
  "src/routes/wallet.tsx",
  "src/components/wallet/pay-services-card.tsx",
];

describe("mobile compact scale (iOS density)", () => {
  for (const file of COMPACT_PAGES) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    it(`${file} stays within the compact type and icon ceiling`, () => {
      expect(source).not.toMatch(/large-title/);
      expect(source).not.toMatch(/text-\[(2[9]|[3-9]\d)px\]/);
      expect(source).not.toMatch(/\btext-(2xl|3xl|4xl|5xl)\b/);
      expect(source).not.toMatch(/\bsize-(1[2-3])\b(?!4)/);
    });
  }
});
