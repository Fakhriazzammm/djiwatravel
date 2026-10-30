import {
  createNoArgServerFnProxy,
  createServerFnProxy,
  executeServerFn,
} from "./server-fn-proxy";
import type * as Server from "./my-trips.server";

const dataProxy = <TName extends keyof typeof Server>(
  method: "GET" | "POST",
  name: TName,
) =>
  createServerFnProxy<
    Parameters<(typeof Server)[TName]>[0]["data"],
    Awaited<ReturnType<(typeof Server)[TName]>>
  >(method, async (data) =>
    executeServerFn((await import("./my-trips.server"))[name], method, data) as never,
  );

export const duplicateTrip = dataProxy("POST", "duplicateTrip");
export const deleteTripRecord = dataProxy("POST", "deleteTripRecord");
export const getTrip = dataProxy("GET", "getTrip");
export const getTripSection = dataProxy("GET", "getTripSection");
export const patchTrip = dataProxy("POST", "patchTrip");
export const postTrip = dataProxy("POST", "postTrip");
export const postExpense = dataProxy("POST", "postExpense");
export const postItinerary = dataProxy("POST", "postItinerary");
export const postChecklist = dataProxy("POST", "postChecklist");
export const patchChecklist = dataProxy("POST", "patchChecklist");
export const patchBudget = dataProxy("POST", "patchBudget");
export const postBooking = dataProxy("POST", "postBooking");
export const deleteExpense = dataProxy("POST", "deleteExpense");
export const deleteItinerary = dataProxy("POST", "deleteItinerary");
export const deleteChecklist = dataProxy("POST", "deleteChecklist");
export const deleteBookingRecord = dataProxy("POST", "deleteBookingRecord");
export const postTripShare = dataProxy("POST", "postTripShare");
export const deleteTripShare = dataProxy("POST", "deleteTripShare");
export const getSharedTrip = dataProxy("GET", "getSharedTrip");

export const getMyTripsHome = createNoArgServerFnProxy("GET", async () =>
  executeServerFn((await import("./my-trips.server")).getMyTripsHome, "GET"),
);
