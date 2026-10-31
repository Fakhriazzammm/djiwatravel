import { createServerFn } from "@tanstack/react-start";

export const getHomeEsimFunnel = createServerFn({ method: "GET" }).handler(async () => {
  const { getHomeEsimFunnelHandler } = await import("./home-esim-events.server");
  return getHomeEsimFunnelHandler();
});
