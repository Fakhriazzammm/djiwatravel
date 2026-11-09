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
