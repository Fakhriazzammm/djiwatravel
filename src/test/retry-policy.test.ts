import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_ATTEMPTS,
  HEARTBEAT_WINDOW_MS,
  backoffMs,
  isDue,
  isLeaseAvailable,
  isWorkerStale,
  retryDecision,
  safeErrorSummary,
} from "@/lib/retry-policy";

describe("retry backoff", () => {
  it("grows exponentially and is capped", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(50)).toBe(30 * 60_000);
    expect(backoffMs(0)).toBe(60_000);
  });
});

describe("retry decisions", () => {
  const now = Date.parse("2026-10-15T00:00:00.000Z");

  it("schedules the first attempt immediately and later ones with backoff", () => {
    expect(retryDecision({ attemptCount: 0 }, now)).toEqual({
      action: "retry_immediate",
      nextRetryAtMs: now,
      attempt: 0,
    });
    expect(retryDecision({ attemptCount: 2 }, now)).toEqual({
      action: "retry",
      nextRetryAtMs: now + 120_000,
      attempt: 2,
    });
  });

  it("dead-letters a terminal failure and an exhausted budget", () => {
    expect(retryDecision({ attemptCount: 1, terminal: true }, now).action).toBe("dead_letter");
    expect(retryDecision({ attemptCount: DEFAULT_MAX_ATTEMPTS }, now).action).toBe("dead_letter");
  });
});

describe("queue leases", () => {
  const now = Date.now();
  it("treats missing and expired leases as available", () => {
    expect(isLeaseAvailable(null, now)).toBe(true);
    expect(isLeaseAvailable(now - 1, now)).toBe(true);
  });
  it("hides an item under an active lease", () => {
    expect(isLeaseAvailable(now + 60_000, now)).toBe(false);
  });
  it("only runs items that are due", () => {
    expect(isDue(null, now)).toBe(true);
    expect(isDue(now - 1, now)).toBe(true);
    expect(isDue(now + 60_000, now)).toBe(false);
  });
});

describe("worker heartbeat", () => {
  const now = Date.now();
  it("flags a worker with no heartbeat or a stale one", () => {
    expect(isWorkerStale(null, now)).toBe(true);
    expect(isWorkerStale(now - HEARTBEAT_WINDOW_MS - 1, now)).toBe(true);
  });
  it("accepts a recent heartbeat", () => {
    expect(isWorkerStale(now - 1_000, now)).toBe(false);
  });
});

describe("safe error summaries", () => {
  it("bounds length and strips newlines so admin views stay safe", () => {
    const summary = safeErrorSummary(new Error("line1\nline2\tline3"));
    expect(summary).toBe("line1 line2 line3");
    expect(safeErrorSummary("x".repeat(500)).length).toBe(200);
    expect(safeErrorSummary(undefined)).toBe("unknown_error");
  });
});
