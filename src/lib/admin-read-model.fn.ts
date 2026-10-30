import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const getAdminOrders = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminOrdersHandler } = await import("./admin-read-model.server");
  return getAdminOrdersHandler();
});

export const getAdminOrderDetail = createServerFn({ method: "GET" })
  .validator(
    async (
      data: Parameters<typeof import("./admin-read-model.server").getAdminOrderDetailInput>[0],
    ) => {
      const { getAdminOrderDetailInput } = await import("./admin-read-model.server");
      return getAdminOrderDetailInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { getAdminOrderDetailHandler } = await import("./admin-read-model.server");
    return getAdminOrderDetailHandler({ data });
  });

export const getAdminPayments = createServerFn({ method: "GET" })
  .validator(
    async (
      data: Parameters<typeof import("./admin-read-model.server").getAdminPaymentsInput>[0],
    ) => {
      const { getAdminPaymentsInput } = await import("./admin-read-model.server");
      return getAdminPaymentsInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { getAdminPaymentsHandler } = await import("./admin-read-model.server");
    return getAdminPaymentsHandler({ data });
  });

export const getAdminProvisioning = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminProvisioningHandler } = await import("./admin-read-model.server");
  return getAdminProvisioningHandler();
});

export const getAdminSupportCases = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminSupportCasesHandler } = await import("./admin-read-model.server");
  return getAdminSupportCasesHandler();
});

export const getAdminRefundRequests = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminRefundRequestsHandler } = await import("./admin-read-model.server");
  return getAdminRefundRequestsHandler();
});

export const getAdminDashboard = createServerFn({ method: "GET" })
  .validator(
    async (
      data: Parameters<typeof import("./admin-read-model.server").getAdminDashboardInput>[0],
    ) => {
      const { getAdminDashboardInput } = await import("./admin-read-model.server");
      return getAdminDashboardInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { getAdminDashboardHandler } = await import("./admin-read-model.server");
    return getAdminDashboardHandler({ data });
  });
