import type { Destination } from "./catalog";

export type ExploreAvailability = {
  destinations: Destination[];
  source: "live" | "cached" | "error";
  errorMessage?: string;
};

/**
 * The provider catalogue read is allowed its own 8 s budget (see PROVIDER_TIMEOUT_MS in
 * reseller-catalog-cache), so the route deadline must not be tighter than that: a slow but
 * healthy read used to be reported as a failure and the customer had to press "Coba lagi".
 */
export const EXPLORE_LOADER_DEADLINE_MS = 8_000;

/**
 * One bounded recovery window. The read that missed the first deadline is usually still in
 * flight and fills the cache, so a second attempt normally succeeds with no user action.
 */
export const EXPLORE_RECOVERY_DEADLINE_MS = 3_000;

/** Do not invent package-backed destinations when the provider read failed. */
export function exploreErrorState(message = "Katalog belum dapat dimuat."): ExploreAvailability {
  return { destinations: [], source: "error", errorMessage: message };
}

export function exploreAvailability(
  destinations: Destination[],
  source: "live" | "cached",
): ExploreAvailability {
  return { destinations, source };
}

export type ExploreLoadDeps = {
  /** One bounded attempt. Rejects when the attempt exceeds its own timeout. */
  attempt: (timeoutMs: number) => Promise<ExploreAvailability>;
  deadlineMs?: number;
  recoveryDeadlineMs?: number;
};

/**
 * Runs the Explore read with provider-aligned timing and a single automatic recovery, so a cold
 * or slow provider read resolves into a list instead of a false "gagal" state. Only a read that
 * fails twice — once past the provider's own budget — is surfaced as an actionable error.
 */
export async function loadExploreAvailability(
  deps: ExploreLoadDeps,
): Promise<ExploreAvailability> {
  const deadlineMs = deps.deadlineMs ?? EXPLORE_LOADER_DEADLINE_MS;
  const recoveryDeadlineMs = deps.recoveryDeadlineMs ?? EXPLORE_RECOVERY_DEADLINE_MS;
  try {
    return await deps.attempt(deadlineMs);
  } catch {
    try {
      return await deps.attempt(recoveryDeadlineMs);
    } catch {
      return exploreErrorState();
    }
  }
}
