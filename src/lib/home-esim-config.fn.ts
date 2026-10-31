import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.

/** Public, customer-safe read of the Home eSIM settings (defaults on any failure). */
export const getHomeEsimConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getHomeEsimConfigHandler } = await import("./home-esim-config.server");
  return getHomeEsimConfigHandler();
});

/** Admin read: includes the version needed to detect concurrent edits. */
export const getAdminHomeEsimConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminHomeEsimConfigHandler } = await import("./home-esim-config.server");
  return getAdminHomeEsimConfigHandler();
});

export const saveHomeEsimConfig = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveHomeEsimConfigInput } = await import("./home-esim-config.server");
    return saveHomeEsimConfigInput(data);
  })
  .handler(async ({ data }) => {
    const { saveHomeEsimConfigHandler } = await import("./home-esim-config.server");
    return saveHomeEsimConfigHandler({ data });
  });
