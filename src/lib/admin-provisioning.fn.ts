import { createServerFn } from "@tanstack/react-start";

export const retryAdminProvisioning = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminProvisioningInput } = await import("./admin-provisioning.server");
    return adminProvisioningInput(data);
  })
  .handler(async ({ data }) => {
    const { retryAdminProvisioningHandler } = await import("./admin-provisioning.server");
    return retryAdminProvisioningHandler({ data });
  });
