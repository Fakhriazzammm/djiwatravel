import { createServerFn } from "@tanstack/react-start";

export const mutateAdminSupport = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminSupportInput } = await import("./admin-support.server");
    return adminSupportInput(data);
  })
  .handler(async ({ data }) => {
    const { mutateAdminSupportHandler } = await import("./admin-support.server");
    return mutateAdminSupportHandler({ data });
  });
