import { createServerFn } from "@tanstack/react-start";

// Admin RPC declarations. Implementations and the admin guard stay server-only.

export const getAdminEsimSharing = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminEsimSharingHandler } = await import("./esim-share.server");
  return getAdminEsimSharingHandler();
});

export const saveAdminEsimSharing = createServerFn({ method: "POST" })
  .validator(
    async (
      data: Parameters<typeof import("./esim-share.server").saveEsimSharingConfigInput>[0],
    ) => {
      const { saveEsimSharingConfigInput } = await import("./esim-share.server");
      return saveEsimSharingConfigInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { saveEsimSharingConfigHandler } = await import("./esim-share.server");
    return saveEsimSharingConfigHandler({ data });
  });

export const getAdminEsimShareState = createServerFn({ method: "GET" })
  .validator(
    async (
      data: Parameters<typeof import("./esim-share.server").getAdminEsimShareStateInput>[0],
    ) => {
      const { getAdminEsimShareStateInput } = await import("./esim-share.server");
      return getAdminEsimShareStateInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { getAdminEsimShareStateHandler } = await import("./esim-share.server");
    return getAdminEsimShareStateHandler({ data });
  });

export const revokeAdminEsimShare = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./esim-share.server").revokeAdminEsimShareInput>[0]) => {
      const { revokeAdminEsimShareInput } = await import("./esim-share.server");
      return revokeAdminEsimShareInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { revokeAdminEsimShareHandler } = await import("./esim-share.server");
    return revokeAdminEsimShareHandler({ data });
  });
