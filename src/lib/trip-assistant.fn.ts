import { createServerFn } from "@tanstack/react-start";

// RPC declarations. Implementations, the AI key and the admin guard stay server-only.

export const loadTripAssistant = createServerFn({ method: "GET" })
  .validator(async (data: unknown) => {
    const { assistantLoadInput } = await import("./trip-assistant.server");
    return assistantLoadInput(data);
  })
  .handler(async ({ data }) => {
    const { assistantLoadHandler } = await import("./trip-assistant.server");
    return assistantLoadHandler({ data });
  });

export const sendTripAssistantMessage = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { assistantSendInput } = await import("./trip-assistant.server");
    return assistantSendInput(data);
  })
  .handler(async ({ data }) => {
    const { assistantSendHandler } = await import("./trip-assistant.server");
    return assistantSendHandler({ data });
  });

/** Same as sending a message, but yields the reply while the model writes it (then a `done`). */
export const streamTripAssistantMessage = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { assistantSendInput } = await import("./trip-assistant.server");
    return assistantSendInput(data);
  })
  .handler(async function* ({ data }) {
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    try {
      // nginx would otherwise hold the chunks back until its buffer fills.
      setResponseHeader("X-Accel-Buffering", "no");
      setResponseHeader("Cache-Control", "no-cache, no-transform");
    } catch {
      /* headers are an optimisation only */
    }
    const { assistantStreamHandler } = await import("./trip-assistant.server");
    yield* assistantStreamHandler({ data });
  });

export const resetTripAssistant = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { assistantLoadInput } = await import("./trip-assistant.server");
    return assistantLoadInput(data);
  })
  .handler(async ({ data }) => {
    const { assistantResetHandler } = await import("./trip-assistant.server");
    return assistantResetHandler({ data });
  });

export const applyTripAssistantProposal = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { assistantProposalInput } = await import("./trip-assistant.server");
    return assistantProposalInput(data);
  })
  .handler(async ({ data }) => {
    const { assistantApplyHandler } = await import("./trip-assistant.server");
    return assistantApplyHandler({ data });
  });

export const undoTripAssistantProposal = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { assistantProposalInput } = await import("./trip-assistant.server");
    return assistantProposalInput(data);
  })
  .handler(async ({ data }) => {
    const { assistantUndoHandler } = await import("./trip-assistant.server");
    return assistantUndoHandler({ data });
  });

export const dismissTripAssistantProposal = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { assistantProposalInput } = await import("./trip-assistant.server");
    return assistantProposalInput(data);
  })
  .handler(async ({ data }) => {
    const { assistantDismissHandler } = await import("./trip-assistant.server");
    return assistantDismissHandler({ data });
  });

export const swapTripPlace = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { assistantSwapInput } = await import("./trip-assistant.server");
    return assistantSwapInput(data);
  })
  .handler(async ({ data }) => {
    const { assistantSwapPlaceHandler } = await import("./trip-assistant.server");
    return assistantSwapPlaceHandler({ data });
  });

export const getAdminCityCosts = createServerFn({ method: "GET" }).handler(async () => {
  const { adminListCityCostsHandler } = await import("./trip-assistant.server");
  return adminListCityCostsHandler();
});

export const saveAdminCityCosts = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminSaveCityCostsInput } = await import("./trip-assistant.server");
    return adminSaveCityCostsInput(data);
  })
  .handler(async ({ data }) => {
    const { adminSaveCityCostsHandler } = await import("./trip-assistant.server");
    return adminSaveCityCostsHandler({ data });
  });

export const deleteAdminCityCosts = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminDeleteCityCostsInput } = await import("./trip-assistant.server");
    return adminDeleteCityCostsInput(data);
  })
  .handler(async ({ data }) => {
    const { adminDeleteCityCostsHandler } = await import("./trip-assistant.server");
    return adminDeleteCityCostsHandler({ data });
  });

export const openTripGoogleLink = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { assistantGoogleInput } = await import("./trip-assistant.server");
    return assistantGoogleInput(data);
  })
  .handler(async ({ data }) => {
    const { assistantOpenGoogleHandler } = await import("./trip-assistant.server");
    return assistantOpenGoogleHandler({ data });
  });

export const recordTripSummary = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { assistantLoadInput } = await import("./trip-assistant.server");
    return assistantLoadInput(data);
  })
  .handler(async ({ data }) => {
    const { assistantRecordSummaryHandler } = await import("./trip-assistant.server");
    return assistantRecordSummaryHandler({ data });
  });

export const pinTripPlaces = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { assistantLoadInput } = await import("./trip-assistant.server");
    return assistantLoadInput(data);
  })
  .handler(async ({ data }) => {
    const { assistantPinHandler } = await import("./trip-assistant.server");
    return assistantPinHandler({ data });
  });

export const getAdminTripAssistant = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminTripAssistantHandler } = await import("./trip-assistant.server");
  return getAdminTripAssistantHandler();
});

export const saveAdminTripAssistant = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveTripAssistantConfigInput } = await import("./trip-assistant.server");
    return saveTripAssistantConfigInput(data);
  })
  .handler(async ({ data }) => {
    const { saveTripAssistantConfigHandler } = await import("./trip-assistant.server");
    return saveTripAssistantConfigHandler({ data });
  });

export const clearAdminTripAssistantHistory = createServerFn({ method: "POST" }).handler(
  async () => {
    const { adminClearAssistantHistoryHandler } = await import("./trip-assistant.server");
    return adminClearAssistantHistoryHandler();
  },
);

/* Travo page: the same conversations as the trip chat, plus general ones. */

export const loadTravo = createServerFn({ method: "GET" })
  .validator(async (data: unknown) => {
    const { travoLoadInput } = await import("./trip-assistant.server");
    return travoLoadInput(data);
  })
  .handler(async ({ data }) => {
    const { travoLoadHandler } = await import("./trip-assistant.server");
    return travoLoadHandler({ data });
  });

export const listTravoConversations = createServerFn({ method: "GET" }).handler(async () => {
  const { travoListHandler } = await import("./trip-assistant.server");
  return travoListHandler();
});

export const deleteTravoConversation = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { travoConversationInput } = await import("./trip-assistant.server");
    return travoConversationInput(data);
  })
  .handler(async ({ data }) => {
    const { travoDeleteHandler } = await import("./trip-assistant.server");
    return travoDeleteHandler({ data });
  });

/** Public: whether Home may show the Travo tab (Admin switch on and the AI key set). */
export const getTravoEntry = createServerFn({ method: "GET" }).handler(async () => {
  const { travoEntryHandler } = await import("./trip-assistant.server");
  return travoEntryHandler();
});

/** All plans of one country (the "Paket lain" button of an eSIM card). Public catalogue data. */
export const listTravoEsimPlans = createServerFn({ method: "GET" })
  .validator(async (data: unknown) => {
    const { z } = await import("zod");
    return z.string().trim().length(2).parse(data);
  })
  .handler(async ({ data }) => {
    const { listEsimPlansHandler } = await import("./travo-cards.server");
    return listEsimPlansHandler(data);
  });
