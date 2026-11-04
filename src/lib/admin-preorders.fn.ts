import { createServerFn } from "@tanstack/react-start";

export const readAdminPreorders = createServerFn({ method: "GET" }).handler(async () => {
  const { readAdminPreordersHandler } = await import("./admin-preorders.server");
  return readAdminPreordersHandler();
});

export const runAdminPreorderAction = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminPreorderActionInput } = await import("./admin-preorders.server");
    return adminPreorderActionInput(data);
  })
  .handler(async ({ data }) => {
    const { runAdminPreorderActionHandler } = await import("./admin-preorders.server");
    return runAdminPreorderActionHandler({ data });
  });
