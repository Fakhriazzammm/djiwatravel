import type { Destination } from "./catalog";

export type ExploreAvailability = {
  destinations: Destination[];
  source: "live" | "cached" | "error";
  errorMessage?: string;
};

/** The provider cache allows up to eight seconds for a cold catalogue read. */
export const EXPLORE_LOADER_DEADLINE_MS = 8_000;
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
  attempt: (timeoutMs: number) => Promise<ExploreAvailability>;
  deadlineMs?: number;
  recoveryDeadlineMs?: number;
};

/** Retry once after a cold provider read times out before showing an error. */
export async function loadExploreAvailability(deps: ExploreLoadDeps): Promise<ExploreAvailability> {
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
