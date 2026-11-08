import { createServerFn } from "@tanstack/react-start";

// RPC declarations. Implementations, both provider keys and the admin guard stay server-only.

export const getPlaceIdeasStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { placeIdeasStatusHandler } = await import("./place-ideas.server");
  return placeIdeasStatusHandler();
});

export const loadPlaceIdeas = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { placeIdeasInput } = await import("./place-ideas.server");
    return placeIdeasInput(data);
  })
  .handler(async ({ data }) => {
    const { placeIdeasHandler } = await import("./place-ideas.server");
    return placeIdeasHandler({ data });
  });

export const getAdminPlaceIdeas = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminPlaceIdeasHandler } = await import("./place-ideas.server");
  return getAdminPlaceIdeasHandler();
});

export const saveAdminPlaceIdeas = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { savePlaceIdeasConfigInput } = await import("./place-ideas.server");
    return savePlaceIdeasConfigInput(data);
  })
  .handler(async ({ data }) => {
    const { savePlaceIdeasConfigHandler } = await import("./place-ideas.server");
    return savePlaceIdeasConfigHandler({ data });
  });

export const hideAdminPlaceIdea = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { hidePlaceIdeaInput } = await import("./place-ideas.server");
    return hidePlaceIdeaInput(data);
  })
  .handler(async ({ data }) => {
    const { hidePlaceIdeaHandler } = await import("./place-ideas.server");
    return hidePlaceIdeaHandler({ data });
  });

export const clearAdminPlaceIdeasCache = createServerFn({ method: "POST" }).handler(async () => {
  const { clearPlaceIdeasCacheHandler } = await import("./place-ideas.server");
  return clearPlaceIdeasCacheHandler();
});

export const pinItemOnMap = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { pinItemInput } = await import("./place-ideas.server");
    return pinItemInput(data);
  })
  .handler(async ({ data }) => {
    const { pinItemOnMapHandler } = await import("./place-ideas.server");
    return pinItemOnMapHandler({ data });
  });
