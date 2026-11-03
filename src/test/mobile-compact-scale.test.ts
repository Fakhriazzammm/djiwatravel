import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Pages already migrated to the DESIGN.md "Mobile compact scale". Add a page here when you migrate it.
const COMPACT_PAGES = [
  "src/routes/notifications.tsx",
  "src/routes/wallet.tsx",
  "src/components/wallet/pay-services-card.tsx",
  "src/components/checkout-form.tsx",
  "src/components/customer-auth.tsx",
  "src/components/customer-onboarding-gate.tsx",
  "src/components/djiwa-pay-topup.tsx",
  "src/components/esim-install.tsx",
  "src/components/esim-package-picker.tsx",
  "src/components/esim-package-results.tsx",
  "src/components/esim-share-sheet.tsx",
  "src/components/esim-status-card.tsx",
  "src/components/explore/destination-card.tsx",
  "src/components/home-my-trips-widget.tsx",
  "src/components/install-app-card.tsx",
  "src/components/profile/calendar-sheet.tsx",
  "src/components/push-opt-in-row.tsx",
  "src/components/travel-usage-card.tsx",
  "src/components/travel-waitlist-card.tsx",
  "src/components/trip-budget-ios.tsx",
  "src/components/trip-ios.tsx",
  "src/routes/destination.$code.tsx",
  "src/routes/esim.finder.tsx",
  "src/routes/explore.tsx",
  "src/routes/index.tsx",
  "src/routes/my-esim.index.tsx",
  "src/routes/my-trips.$tripId.$section.tsx",
  "src/routes/my-trips.$tripId.tsx",
  "src/routes/my-trips.index.tsx",
  "src/routes/my-trips.new.tsx",
  "src/routes/order.$id.tsx",
  "src/routes/panduan.$slug.tsx",
  "src/routes/panduan.index.tsx",
  "src/routes/plan.$id.tsx",
  "src/routes/profile.tsx",
  "src/routes/receipt.$id.tsx",
  "src/routes/share.$token.tsx",
];

describe("mobile compact scale (iOS density)", () => {
  for (const file of COMPACT_PAGES) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    it(`${file} stays within the compact type and icon ceiling`, () => {
      expect(source).not.toMatch(/large-title/);
      expect(source).not.toMatch(/text-\[(2[9]|[3-9]\d)px\]/);
      expect(source).not.toMatch(/\btext-(2xl|3xl|4xl|5xl)\b/);
      expect(source).not.toMatch(/\bsize-(1[2-3])\b(?!4)/);
      expect(source).not.toMatch(/\bmin-h-(14|16)\b/);
      // CTA buttons are 40px (min-h-10); only list rows/tab items may be 48px.
      expect(source).not.toMatch(/(btnRed|btnSoft|bg-brand-red|bg-primary)[^\n]*\bmin-h-12\b/);
    });
  }
});
