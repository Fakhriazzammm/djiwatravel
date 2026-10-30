import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const duplicateTrip = createServerFn({ method: "POST" })
  .validator(async (data: Parameters<typeof import("./my-trips.server").duplicateTripInput>[0]) => {
    const { duplicateTripInput } = await import("./my-trips.server");
    return duplicateTripInput(data);
  })
  .handler(async ({ data }) => {
    const { duplicateTripHandler } = await import("./my-trips.server");
    return duplicateTripHandler({ data });
  });

export const getMyTrips = createServerFn({ method: "GET" }).handler(async () => {
  const { getMyTripsHandler } = await import("./my-trips.server");
  return getMyTripsHandler();
});

export const getMyTripsHome = createServerFn({ method: "GET" }).handler(async () => {
  const { getMyTripsHomeHandler } = await import("./my-trips.server");
  return getMyTripsHomeHandler();
});

export const postTrip = createServerFn({ method: "POST" })
  .validator(async (data: Parameters<typeof import("./my-trips.server").postTripInput>[0]) => {
    const { postTripInput } = await import("./my-trips.server");
    return postTripInput(data);
  })
  .handler(async ({ data }) => {
    const { postTripHandler } = await import("./my-trips.server");
    return postTripHandler({ data });
  });

export const patchTrip = createServerFn({ method: "POST" })
  .validator(async (data: Parameters<typeof import("./my-trips.server").patchTripInput>[0]) => {
    const { patchTripInput } = await import("./my-trips.server");
    return patchTripInput(data);
  })
  .handler(async ({ data }) => {
    const { patchTripHandler } = await import("./my-trips.server");
    return patchTripHandler({ data });
  });

export const deleteTripRecord = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./my-trips.server").deleteTripRecordInput>[0]) => {
      const { deleteTripRecordInput } = await import("./my-trips.server");
      return deleteTripRecordInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { deleteTripRecordHandler } = await import("./my-trips.server");
    return deleteTripRecordHandler({ data });
  });

export const getTrip = createServerFn({ method: "GET" })
  .validator(async (data: Parameters<typeof import("./my-trips.server").getTripInput>[0]) => {
    const { getTripInput } = await import("./my-trips.server");
    return getTripInput(data);
  })
  .handler(async ({ data }) => {
    const { getTripHandler } = await import("./my-trips.server");
    return getTripHandler({ data });
  });

export const getTripSection = createServerFn({ method: "GET" })
  .validator(
    async (data: Parameters<typeof import("./my-trips.server").getTripSectionInput>[0]) => {
      const { getTripSectionInput } = await import("./my-trips.server");
      return getTripSectionInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { getTripSectionHandler } = await import("./my-trips.server");
    return getTripSectionHandler({ data });
  });

export const postExpense = createServerFn({ method: "POST" })
  .validator(async (data: Parameters<typeof import("./my-trips.server").postExpenseInput>[0]) => {
    const { postExpenseInput } = await import("./my-trips.server");
    return postExpenseInput(data);
  })
  .handler(async ({ data }) => {
    const { postExpenseHandler } = await import("./my-trips.server");
    return postExpenseHandler({ data });
  });

export const postItinerary = createServerFn({ method: "POST" })
  .validator(async (data: Parameters<typeof import("./my-trips.server").postItineraryInput>[0]) => {
    const { postItineraryInput } = await import("./my-trips.server");
    return postItineraryInput(data);
  })
  .handler(async ({ data }) => {
    const { postItineraryHandler } = await import("./my-trips.server");
    return postItineraryHandler({ data });
  });

export const postChecklist = createServerFn({ method: "POST" })
  .validator(async (data: Parameters<typeof import("./my-trips.server").postChecklistInput>[0]) => {
    const { postChecklistInput } = await import("./my-trips.server");
    return postChecklistInput(data);
  })
  .handler(async ({ data }) => {
    const { postChecklistHandler } = await import("./my-trips.server");
    return postChecklistHandler({ data });
  });

export const patchChecklist = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./my-trips.server").patchChecklistInput>[0]) => {
      const { patchChecklistInput } = await import("./my-trips.server");
      return patchChecklistInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { patchChecklistHandler } = await import("./my-trips.server");
    return patchChecklistHandler({ data });
  });

export const patchBudget = createServerFn({ method: "POST" })
  .validator(async (data: Parameters<typeof import("./my-trips.server").patchBudgetInput>[0]) => {
    const { patchBudgetInput } = await import("./my-trips.server");
    return patchBudgetInput(data);
  })
  .handler(async ({ data }) => {
    const { patchBudgetHandler } = await import("./my-trips.server");
    return patchBudgetHandler({ data });
  });

export const postBooking = createServerFn({ method: "POST" })
  .validator(async (data: Parameters<typeof import("./my-trips.server").postBookingInput>[0]) => {
    const { postBookingInput } = await import("./my-trips.server");
    return postBookingInput(data);
  })
  .handler(async ({ data }) => {
    const { postBookingHandler } = await import("./my-trips.server");
    return postBookingHandler({ data });
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .validator(async (data: Parameters<typeof import("./my-trips.server").deleteExpenseInput>[0]) => {
    const { deleteExpenseInput } = await import("./my-trips.server");
    return deleteExpenseInput(data);
  })
  .handler(async ({ data }) => {
    const { deleteExpenseHandler } = await import("./my-trips.server");
    return deleteExpenseHandler({ data });
  });

export const deleteItinerary = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./my-trips.server").deleteItineraryInput>[0]) => {
      const { deleteItineraryInput } = await import("./my-trips.server");
      return deleteItineraryInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { deleteItineraryHandler } = await import("./my-trips.server");
    return deleteItineraryHandler({ data });
  });

export const deleteChecklist = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./my-trips.server").deleteChecklistInput>[0]) => {
      const { deleteChecklistInput } = await import("./my-trips.server");
      return deleteChecklistInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { deleteChecklistHandler } = await import("./my-trips.server");
    return deleteChecklistHandler({ data });
  });

export const deleteBookingRecord = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./my-trips.server").deleteBookingRecordInput>[0]) => {
      const { deleteBookingRecordInput } = await import("./my-trips.server");
      return deleteBookingRecordInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { deleteBookingRecordHandler } = await import("./my-trips.server");
    return deleteBookingRecordHandler({ data });
  });

export const postTripShare = createServerFn({ method: "POST" })
  .validator(async (data: Parameters<typeof import("./my-trips.server").postTripShareInput>[0]) => {
    const { postTripShareInput } = await import("./my-trips.server");
    return postTripShareInput(data);
  })
  .handler(async ({ data }) => {
    const { postTripShareHandler } = await import("./my-trips.server");
    return postTripShareHandler({ data });
  });

export const deleteTripShare = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./my-trips.server").deleteTripShareInput>[0]) => {
      const { deleteTripShareInput } = await import("./my-trips.server");
      return deleteTripShareInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { deleteTripShareHandler } = await import("./my-trips.server");
    return deleteTripShareHandler({ data });
  });

export const getSharedTrip = createServerFn({ method: "GET" })
  .validator(async (data: Parameters<typeof import("./my-trips.server").getSharedTripInput>[0]) => {
    const { getSharedTripInput } = await import("./my-trips.server");
    return getSharedTripInput(data);
  })
  .handler(async ({ data }) => {
    const { getSharedTripHandler } = await import("./my-trips.server");
    return getSharedTripHandler({ data });
  });
