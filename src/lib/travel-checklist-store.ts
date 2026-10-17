import { CHECKLIST_KEYS, parseDepartureDate, type ChecklistKey } from "./travel-journey";

/**
 * Per-order trip plan (departure date + checklist ticks) kept on the device.
 *
 * Scope: one entry per authorized order. Reads are only meaningful behind the same
 * guest-order access guard the order itself uses, so this store never becomes an
 * authorization source of its own.
 */
const TRIP_KEY_PREFIX = "djiwa.travel.trip.";

export type TripPlan = {
  departureDate: string | null;
  completed: Record<string, number>;
  updatedAt: number;
};

export function tripPlanKey(orderId: string): string {
  return `${TRIP_KEY_PREFIX}${orderId}`;
}

function emptyPlan(now: number): TripPlan {
  return { departureDate: null, completed: {}, updatedAt: now };
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function sanitizeCompleted(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) return {};
  const source = value as Record<string, unknown>;
  const completed: Record<string, number> = {};
  for (const key of CHECKLIST_KEYS) {
    const stamp = source[key];
    if (typeof stamp === "number" && Number.isFinite(stamp)) completed[key] = stamp;
  }
  return completed;
}

export function readTripPlan(orderId: string, now = Date.now()): TripPlan {
  const store = storage();
  if (!store) return emptyPlan(now);
  try {
    const raw = store.getItem(tripPlanKey(orderId));
    if (!raw) return emptyPlan(now);
    const parsed = JSON.parse(raw) as Partial<TripPlan> | null;
    if (typeof parsed !== "object" || parsed === null) return emptyPlan(now);
    const departureDate =
      typeof parsed.departureDate === "string" && parseDepartureDate(parsed.departureDate) !== null
        ? parsed.departureDate
        : null;
    return {
      departureDate,
      completed: sanitizeCompleted(parsed.completed),
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : now,
    };
  } catch {
    return emptyPlan(now);
  }
}

function persist(orderId: string, plan: TripPlan): TripPlan {
  const store = storage();
  if (store) {
    try {
      store.setItem(tripPlanKey(orderId), JSON.stringify(plan));
    } catch {
      // A full or blocked storage must not break the page; the in-memory value still applies.
    }
  }
  return plan;
}

export function writeDepartureDate(
  orderId: string,
  departureDate: string | null,
  now = Date.now(),
): TripPlan {
  const current = readTripPlan(orderId, now);
  const next: TripPlan = {
    departureDate:
      typeof departureDate === "string" && parseDepartureDate(departureDate) !== null
        ? departureDate
        : null,
    completed: current.completed,
    updatedAt: now,
  };
  return persist(orderId, next);
}

export function setChecklistItem(
  orderId: string,
  key: ChecklistKey,
  done: boolean,
  now = Date.now(),
): TripPlan {
  const current = readTripPlan(orderId, now);
  const completed = { ...current.completed };
  if (done) completed[key] = now;
  else delete completed[key];
  return persist(orderId, { ...current, completed, updatedAt: now });
}

export function clearTripPlan(orderId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(tripPlanKey(orderId));
  } catch {
    // ignore
  }
}

/** Removes every trip plan on this device (used on sign-out / account switch). */
export function clearAllTripPlans(): void {
  const store = storage();
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key && key.startsWith(TRIP_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  } catch {
    // ignore
  }
}
