import { describe, expect, it } from "vitest";

import {
  isWaitingForEsim,
  readyNotificationCopy,
  shouldNotifyReady,
} from "@/lib/esim-notify";

// The notification is the only thing standing between "paid but silent" and a customer who knows
// the eSIM is usable, so the trigger conditions are pinned here.
describe("eSIM ready notification triggers", () => {
  it("fires when a paid order becomes usable", () => {
    expect(shouldNotifyReady("PROVISIONING", "READY")).toBe(true);
    expect(shouldNotifyReady("PAID", "READY")).toBe(true);
    expect(shouldNotifyReady("WAITING_PAYMENT", "INSTALLED")).toBe(true);
    expect(shouldNotifyReady("PROVISIONING_FAILED", "READY")).toBe(true);
  });

  it("stays quiet when the status was already usable", () => {
    expect(shouldNotifyReady("READY", "READY")).toBe(false);
    expect(shouldNotifyReady("READY", "INSTALLED")).toBe(false);
    expect(shouldNotifyReady("INSTALLED", "READY")).toBe(false);
  });

  it("never fires for first render or for non-usable statuses", () => {
    expect(shouldNotifyReady(null, "READY")).toBe(false);
    expect(shouldNotifyReady("WAITING_PAYMENT", "WAITING_PAYMENT")).toBe(false);
    expect(shouldNotifyReady("PAID", "PROVISIONING")).toBe(false);
    expect(shouldNotifyReady("PAID", "PROVISIONING_FAILED")).toBe(false);
    expect(shouldNotifyReady("READY", "EXPIRED")).toBe(false);
  });

  it("only invites the wait for orders that are being provisioned", () => {
    expect(isWaitingForEsim("PAID")).toBe(true);
    expect(isWaitingForEsim("PROVISIONING")).toBe(true);
    expect(isWaitingForEsim("WAITING_PAYMENT")).toBe(false);
    expect(isWaitingForEsim("READY")).toBe(false);
    expect(isWaitingForEsim(undefined)).toBe(false);
  });

  it("names the package in the copy it shows", () => {
    expect(readyNotificationCopy("Japan 1GB 7Days").body).toContain("Japan 1GB 7Days");
    expect(readyNotificationCopy(null).body).toContain("eSIM kamu");
  });
});
