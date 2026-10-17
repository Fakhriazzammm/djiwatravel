import { clearAllTripPlans } from "./travel-checklist-store";
import { clearAllTravelSnapshots } from "./offline-travel-snapshot";
import { clearSupportSendLog } from "./travel-support";

/**
 * Removes every piece of customer-scoped travel data kept on this device.
 *
 * Called on sign-out / account switch so the next customer on the same browser never
 * sees the previous customer's checklist, offline QR snapshot, or support history.
 */
export function clearTravelLocalData(): void {
  clearAllTripPlans();
  clearAllTravelSnapshots();
  clearSupportSendLog();
}
