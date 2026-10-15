/**
 * Durable retry policy for provider work (payment settlement sweep, provisioning, finance posting).
 *
 * A retryable failure and a dead-letter failure must be told apart, because one is repaired by the
 * worker and the other needs a human. Treating them as the same either hides a stuck order or
 * escalates an order that heals itself on the next tick.
 */

export const DEFAULT_MAX_ATTEMPTS = 5;
export const BASE_BACKOFF_MS = 60_000;
export const MAX_BACKOFF_MS = 30 * 60_000;

export type QueueItemState = {
  attemptCount?: number | null;
  /** Hard terminal signal from the caller (e.g. provider rejected the request outright). */
  terminal?: boolean;
};

export type RetryDecision =
  | { action: "retry"; nextRetryAtMs: number; attempt: number }
  | { action: "retry_immediate"; nextRetryAtMs: number; attempt: number }
  | { action: "dead_letter"; attempt: number };

/** Exponential backoff with a hard ceiling; the cap keeps a long outage from starving fresh work. */
export function backoffMs(attempt: number, base = BASE_BACKOFF_MS, max = MAX_BACKOFF_MS): number {
  const safe = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 1;
  // Capped before the exponent is applied so a large attempt count cannot overflow to Infinity.
  const exponent = Math.min(safe - 1, 20);
  return Math.min(base * 2 ** exponent, max);
}

/**
 * Decide what happens to a failed queue item. `nextRetryAtMs` is server-computed and stored, so a
 * process restart resumes from the persisted schedule instead of replaying immediately.
 */
export function retryDecision(
  state: QueueItemState,
  nowMs: number,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): RetryDecision {
  const attempts = Number(state.attemptCount ?? 0);
  const attempt = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0;
  if (state.terminal === true || attempt >= maxAttempts) return { action: "dead_letter", attempt };
  if (attempt === 0) return { action: "retry_immediate", nextRetryAtMs: nowMs, attempt };
  return { action: "retry", nextRetryAtMs: nowMs + backoffMs(attempt), attempt };
}

/** A leased item is invisible to other workers until the lease expires or it is released. */
export function isLeaseAvailable(
  leaseExpiresAtMs: number | null | undefined,
  nowMs: number,
): boolean {
  if (leaseExpiresAtMs == null || !Number.isFinite(leaseExpiresAtMs)) return true;
  return leaseExpiresAtMs <= nowMs;
}

export function isDue(nextRetryAtMs: number | null | undefined, nowMs: number): boolean {
  if (nextRetryAtMs == null || !Number.isFinite(nextRetryAtMs)) return true;
  return nextRetryAtMs <= nowMs;
}

/** Worker liveness: a heartbeat older than the window means the worker is not dependable. */
export const HEARTBEAT_WINDOW_MS = 5 * 60_000;

export function isWorkerStale(lastHeartbeatAtMs: number | null | undefined, nowMs: number, windowMs = HEARTBEAT_WINDOW_MS): boolean {
  if (lastHeartbeatAtMs == null || !Number.isFinite(lastHeartbeatAtMs)) return true;
  return nowMs - lastHeartbeatAtMs > windowMs;
}

/** Safe, bounded error summary: never persist provider payloads or secrets in the admin view. */
export function safeErrorSummary(error: unknown, maxLength = 200): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "unknown_error";
  return raw.replace(/[\r\n\t]+/g, " ").slice(0, maxLength);
}
