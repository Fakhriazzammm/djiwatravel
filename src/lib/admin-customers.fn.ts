import { createServerFn } from "@tanstack/react-start";

export const getAdminCustomers = createServerFn({ method: "GET" })
  .validator(
    async (
      data: Parameters<typeof import("./admin-customers.server").adminCustomersInput>[0],
    ) => {
      const { adminCustomersInput } = await import("./admin-customers.server");
      return adminCustomersInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { getAdminCustomersHandler } = await import("./admin-customers.server");
    return getAdminCustomersHandler({ data });
  });
