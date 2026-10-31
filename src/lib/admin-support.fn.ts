import { createServerFn } from "@tanstack/react-start";

export const getAdminSupportThread = createServerFn({ method: "GET" })
  .validator(async (data: { caseId: string }) => {
    const { adminSupportThreadInput } = await import("./admin-support.server");
    return adminSupportThreadInput(data);
  })
  .handler(async ({ data }) => {
    const { getAdminSupportThreadHandler } = await import("./admin-support.server");
    return getAdminSupportThreadHandler({ data });
  });

export const mutateAdminSupport = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminSupportInput } = await import("./admin-support.server");
    return adminSupportInput(data);
  })
  .handler(async ({ data }) => {
    const { mutateAdminSupportHandler } = await import("./admin-support.server");
    return mutateAdminSupportHandler({ data });
  });
