import { beforeEach, describe, expect, it } from "vitest";
import {
  buildSupportContext,
  clearSupportSendLog,
  recordSupportSend,
  shouldSuppressSupportSend,
  SUPPORT_SEND_WINDOW_MS,
  supportDedupeKey,
  supportMessage,
  supportTopicsFor,
  supportUrl,
} from "../lib/travel-support";

const FULL_ORDER_ID = "11111111-2222-4333-8444-555555555555";
const ORDER_CODE = "DJW-ABCD1234";
const FULL_ICCID = "89852345678901234567";

function messageLines(message: string): string[] {
  return message.split("\n").map((line) => line.trim());
}

function context(topicId: string) {
  const topic =
    supportTopicsFor("READY").find((entry) => entry.id === topicId) ??
    supportTopicsFor("READY")[0]!;
  return buildSupportContext({
    topic,
    status: "READY",
    orderId: FULL_ORDER_ID,
    orderCode: ORDER_CODE,
    packageName: "Jepang 5GB",
    destination: "JP",
    iccid: FULL_ICCID,
    lastSyncedAt: Date.parse("2026-08-10T04:00:00Z"),
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe("support topics", () => {
  it("offers payment help while the order is unpaid", () => {
    const ids = supportTopicsFor("WAITING_PAYMENT").map((topic) => topic.id);
    expect(ids).toContain("payment_pending");
    expect(ids).not.toContain("connectivity");
  });

  it("offers activation and connectivity help once the eSIM is ready", () => {
    const ids = supportTopicsFor("READY").map((topic) => topic.id);
    expect(ids).toContain("activation_install");
    expect(ids).toContain("connectivity");
    expect(ids).not.toContain("payment_pending");
  });

  it("only offers the quota topic when the balance is actually low", () => {
    expect(supportTopicsFor("READY", { quotaLow: false }).map((t) => t.id)).not.toContain(
      "quota_low",
    );
    expect(supportTopicsFor("READY", { quotaLow: true }).map((t) => t.id)).toContain("quota_low");
  });

  it("always returns at least one topic", () => {
    for (const status of [
      "ORDER_CREATED",
      "PROVISIONING_FAILED",
      "EXPIRED",
      "CANCELLED",
      "REFUNDED",
    ] as const) {
      expect(supportTopicsFor(status).length).toBeGreaterThan(0);
    }
  });
});

describe("support payload redaction", () => {
  it("masks the order reference instead of sending it in full", () => {
    const built = context("connectivity");
    expect(built.orderReference).toBe("DJW-••••1234");
    expect(built.orderReference).not.toBe(ORDER_CODE);
  });

  it("masks the ICCID and never includes the QR or activation code", () => {
    const built = context("connectivity");
    expect(built.esimReference).toBe("898523" + "•".repeat(10) + "4567");
    const message = supportMessage(built);
    expect(message).not.toContain(FULL_ICCID);
    expect(message).not.toContain(FULL_ORDER_ID);
    expect(message).not.toContain("LPA:");
  });

  it("carries the state context support needs to answer", () => {
    const message = supportMessage(context("connectivity"));
    expect(message).toContain("Jepang 5GB");
    expect(message).toContain("JP");
    expect(message).toContain("Siap dipasang");
    expect(message).toContain("djiwa-travel-web");
  });

  it("omits the eSIM line when the order has no profile yet", () => {
    const topic = supportTopicsFor("WAITING_PAYMENT")[0]!;
    const built = buildSupportContext({
      topic,
      status: "WAITING_PAYMENT",
      orderId: FULL_ORDER_ID,
      orderCode: null,
      packageName: "Jepang 5GB",
      destination: "JP",
    });
    expect(built.esimReference).toBeNull();
    expect(messageLines(supportMessage(built)).some((line) => line.startsWith("eSIM:"))).toBe(
      false,
    );
  });

  it("encodes the message into the support URL", () => {
    const url = supportUrl(context("connectivity"), "https://wa.me/6285156399831");
    expect(url.startsWith("https://wa.me/6285156399831?text=")).toBe(true);
    expect(url).not.toContain(FULL_ICCID);
    expect(decodeURIComponent(url.split("?text=")[1] ?? "")).toContain("Jepang 5GB");
  });
});

describe("support send de-duplication", () => {
  it("allows the first send and then suppresses the same topic for the window", () => {
    const key = supportDedupeKey(context("connectivity"));
    expect(shouldSuppressSupportSend(key)).toBe(false);
    recordSupportSend(key);
    expect(shouldSuppressSupportSend(key)).toBe(true);
    expect(shouldSuppressSupportSend(key, Date.now() + SUPPORT_SEND_WINDOW_MS + 1)).toBe(false);
  });

  it("keys the window by topic so a different problem is still sendable", () => {
    recordSupportSend(supportDedupeKey(context("connectivity")));
    expect(shouldSuppressSupportSend(supportDedupeKey(context("activation_install")))).toBe(false);
  });

  it("clears the log on sign-out", () => {
    const key = supportDedupeKey(context("connectivity"));
    recordSupportSend(key);
    clearSupportSendLog();
    expect(shouldSuppressSupportSend(key)).toBe(false);
  });
});
