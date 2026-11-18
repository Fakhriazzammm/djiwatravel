import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { RANGE_KEYS, resolveRange } from "./date-range";

export const getAdminCustomers = createServerFn({ method: "GET" })
  .validator(
    async (data: Parameters<typeof import("./admin-customers.server").adminCustomersInput>[0]) => {
      const { adminCustomersInput } = await import("./admin-customers.server");
      return adminCustomersInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { getAdminCustomersHandler } = await import("./admin-customers.server");
    return getAdminCustomersHandler({ data });
  });

export const exportAdminCustomers = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./admin-customers.server").adminCustomersInput>[0]) => {
      const { adminCustomersInput } = await import("./admin-customers.server");
      return adminCustomersInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { exportAdminCustomersHandler } = await import("./admin-customers.server");
    return exportAdminCustomersHandler({ data });
  });

export const getAdminCustomerGrowth = createServerFn({ method: "GET" })
  .validator(
    z.object({
      range: z.enum(RANGE_KEYS),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { getAdminCustomerGrowthHandler } = await import("./admin-customers.server");
    return getAdminCustomerGrowthHandler(resolveRange(data, "30h"));
  });

export const getAdminCustomerDetail = createServerFn({ method: "GET" })
  .validator(
    async (
      data: Parameters<typeof import("./admin-customers.server").adminCustomerDetailInput>[0],
    ) => {
      const { adminCustomerDetailInput } = await import("./admin-customers.server");
      return adminCustomerDetailInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { getAdminCustomerDetailHandler } = await import("./admin-customers.server");
    return getAdminCustomerDetailHandler({ data });
  });
