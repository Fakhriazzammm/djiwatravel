import { createServerFn } from "@tanstack/react-start";

// RPC declarations. The admin guard, tokens and Google calls stay server-only.

export const getAdminGoogle = createServerFn({ method: "GET" }).handler(async () => {
  const { readGoogleAdmin } = await import("./google-admin.server");
  return readGoogleAdmin();
});

export const runAdminGoogleAction = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { googleAdminActionInput } = await import("./google-admin.server");
    return googleAdminActionInput(data);
  })
  .handler(async ({ data }) => {
    const { runGoogleAdminAction } = await import("./google-admin.server");
    return runGoogleAdminAction(data);
  });
