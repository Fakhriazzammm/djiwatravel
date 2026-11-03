import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Pages already migrated to the DESIGN.md "Mobile compact scale". Add a page here when you migrate it.
const COMPACT_PAGES = [
  "src/routes/affiliate.tsx",
  "src/routes/catalog.tsx",
  "src/routes/checkout.$id.tsx",
  "src/routes/destination.$code.tsx",
  "src/routes/e.$token.tsx",
  "src/routes/esim.finder.tsx",
  "src/routes/explore.tsx",
  "src/routes/finder.tsx",
  "src/routes/index.tsx",
  "src/routes/live-catalog.tsx",
  "src/routes/my-esim.$id.tsx",
  "src/routes/my-esim.index.tsx",
  "src/routes/my-trips.$tripId.travel.tsx",
  "src/routes/my-trips.$tripId.tsx",
  "src/routes/my-trips.index.tsx",
  "src/routes/my-orders.tsx",
  "src/routes/my-trips.new.tsx",
  "src/routes/notifications.tsx",
  "src/routes/order-status.tsx",
  "src/routes/order.$id.tsx",
  "src/routes/panduan.$slug.tsx",
  "src/routes/panduan.index.tsx",
  "src/routes/plan.$id.tsx",
  "src/routes/privacy.tsx",
  "src/routes/profile.tsx",
  "src/routes/receipt.$id.tsx",
  "src/routes/refund.$order.tsx",
  "src/routes/share.$token.tsx",
  "src/routes/support.tsx",
  "src/routes/terms.tsx",
  "src/routes/wallet.pay.tsx",
  "src/routes/wallet.tsx",
  "src/components/affiliate-referral-capture.tsx",
  "src/components/checkout-form.tsx",
  "src/components/cookie-consent.tsx",
  "src/components/customer-auth.tsx",
  "src/components/customer-onboarding-gate.tsx",
  "src/components/customer-profile-form.tsx",
  "src/components/device-compatibility.tsx",
  "src/components/djiwa-pay-browser.tsx",
  "src/components/djiwa-pay-topup.tsx",
  "src/components/esim-activation-stepper.tsx",
  "src/components/esim-checkout-sheet.tsx",
  "src/components/esim-destination-sheet.tsx",
  "src/components/esim-detail-card.tsx",
  "src/components/esim-home-summary-card.tsx",
  "src/components/esim-install.tsx",
  "src/components/esim-package-picker.tsx",
  "src/components/esim-package-results.tsx",
  "src/components/esim-preparing-view.tsx",
  "src/components/esim-quick-buy-panel.tsx",
  "src/components/esim-quota-ring.tsx",
  "src/components/esim-share-sheet.tsx",
  "src/components/esim-status-badge.tsx",
  "src/components/esim-status-card.tsx",
  "src/components/explore/ai-trip-planner-card.tsx",
  "src/components/explore/destination-card.tsx",
  "src/components/explore/featured-service-card.tsx",
  "src/components/explore/service-category-grid.tsx",
  "src/components/geo-answer.tsx",
  "src/components/guide-share-actions.tsx",
  "src/components/home-my-trips-widget.tsx",
  "src/components/install-app-card.tsx",
  "src/components/itinerary-map.tsx",
  "src/components/money-input.tsx",
  "src/components/motion-primitives.tsx",
  "src/components/nav-progress.tsx",
  "src/components/offline-snapshot-banner.tsx",
  "src/components/order-outcome-card.tsx",
  "src/components/place-search-field.tsx",
  "src/components/profile/calendar-sheet.tsx",
  "src/components/profile/profile-avatar.tsx",
  "src/components/profile/profile-service-grid.tsx",
  "src/components/push-opt-in-row.tsx",
  "src/components/pwa-runtime.tsx",
  "src/components/receipt-printer.tsx",
  "src/components/recent-purchase-toast.tsx",
  "src/components/travel-checklist.tsx",
  "src/components/travel-support-dialog.tsx",
  "src/components/travel-timeline.tsx",
  "src/components/travel-usage-card.tsx",
  "src/components/travel-waitlist-card.tsx",
  "src/components/trip-budget-ios.tsx",
  "src/components/trip-country-picker.tsx",
  "src/components/trip-ios.tsx",
  "src/components/trip-mini-route.tsx",
  "src/components/trip-overview.tsx",
  "src/components/trip-ticket.tsx",
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
      expect(source).not.toMatch(/\bmin-h-(14|16)\b/);
      // Vertical rhythm: blocks mt-4, cards p-3/p-4, items gap-3, no rounded-3xl cards.
      expect(source).not.toMatch(
        /(?<![\w-])(?:[a-z0-9]+:)*(mt-(5|6|7|8)|p-(5|6)|px-(5|6)|py-(4|5|6)|gap-(4|5|6)|space-y-(4|5|6))(?![\w.-])/,
      );
      // CTA buttons are 40px (min-h-10); only list rows/tab items may be 48px.
      expect(source).not.toMatch(/(btnRed|btnSoft|bg-brand-red|bg-primary)[^\n]*\bmin-h-12\b/);
    });
  }
});
