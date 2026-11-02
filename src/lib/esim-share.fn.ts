import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.

export const getEsimShareState = createServerFn({ method: "GET" })
  .validator(
    async (data: Parameters<typeof import("./esim-share.server").getEsimShareStateInput>[0]) => {
      const { getEsimShareStateInput } = await import("./esim-share.server");
      return getEsimShareStateInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { getEsimShareStateHandler } = await import("./esim-share.server");
    return getEsimShareStateHandler({ data });
  });

export const createEsimShareLink = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./esim-share.server").createEsimShareLinkInput>[0]) => {
      const { createEsimShareLinkInput } = await import("./esim-share.server");
      return createEsimShareLinkInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { createEsimShareLinkHandler } = await import("./esim-share.server");
    return createEsimShareLinkHandler({ data });
  });

export const revokeEsimShareLink = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./esim-share.server").revokeEsimShareLinkInput>[0]) => {
      const { revokeEsimShareLinkInput } = await import("./esim-share.server");
      return revokeEsimShareLinkInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { revokeEsimShareLinkHandler } = await import("./esim-share.server");
    return revokeEsimShareLinkHandler({ data });
  });

/** Public read; the recipient's claim cookie decides between preview and open. */
export const getSharedEsim = createServerFn({ method: "GET" })
  .validator(
    async (data: Parameters<typeof import("./esim-share.server").getSharedEsimInput>[0]) => {
      const { getSharedEsimInput } = await import("./esim-share.server");
      return getSharedEsimInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { getSharedEsimHandler } = await import("./esim-share.server");
    return getSharedEsimHandler({ data });
  });

/** Explicit button press: the first browser to claim binds the link to an HttpOnly cookie. */
export const claimSharedEsim = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./esim-share.server").claimSharedEsimInput>[0]) => {
      const { claimSharedEsimInput } = await import("./esim-share.server");
      return claimSharedEsimInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { claimSharedEsimHandler } = await import("./esim-share.server");
    return claimSharedEsimHandler({ data });
  });
