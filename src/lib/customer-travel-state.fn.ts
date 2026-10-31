import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const getTravelState = createServerFn({ method: "GET" }).handler(async () => {
  const { getTravelStateHandler } = await import("./customer-travel-state.server");
  return getTravelStateHandler();
});

export const saveTripPlan = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveTripPlanInput } = await import("./customer-travel-state.server");
    return saveTripPlanInput(data);
  })
  .handler(async ({ data }) => {
    const { saveTripPlanHandler } = await import("./customer-travel-state.server");
    return saveTripPlanHandler({ data });
  });

export const saveNotifyPreference = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveNotifyPreferenceInput } = await import("./customer-travel-state.server");
    return saveNotifyPreferenceInput(data);
  })
  .handler(async ({ data }) => {
    const { saveNotifyPreferenceHandler } = await import("./customer-travel-state.server");
    return saveNotifyPreferenceHandler({ data });
  });
