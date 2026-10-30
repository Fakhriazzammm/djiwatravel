import {
  createNoArgServerFnProxy,
  createServerFnProxy,
  executeServerFn,
} from "./server-fn-proxy";
import type * as Server from "./admin-read-model.server";

const getAdminOrderDetailRpc = createServerFnProxy<
  Parameters<typeof Server.getAdminOrderDetail>[0]["data"],
  Awaited<ReturnType<typeof Server.getAdminOrderDetail>>
>("GET", async (data) =>
  executeServerFn((await import("./admin-read-model.server")).getAdminOrderDetail, "GET", data),
);

const getAdminPaymentsRpc = createServerFnProxy<
  Parameters<typeof Server.getAdminPayments>[0]["data"],
  Awaited<ReturnType<typeof Server.getAdminPayments>>
>("GET", async (data) =>
  executeServerFn((await import("./admin-read-model.server")).getAdminPayments, "GET", data),
);

const getAdminDashboardRpc = createServerFnProxy<
  Parameters<typeof Server.getAdminDashboard>[0]["data"],
  Awaited<ReturnType<typeof Server.getAdminDashboard>>
>("GET", async (data) =>
  executeServerFn((await import("./admin-read-model.server")).getAdminDashboard, "GET", data),
);

export const getAdminOrders = createNoArgServerFnProxy("GET", async () =>
  executeServerFn((await import("./admin-read-model.server")).getAdminOrders, "GET"),
);
export const getAdminOrderDetail = (input: Parameters<typeof Server.getAdminOrderDetail>[0]) =>
  getAdminOrderDetailRpc(input);
export const getAdminPayments = (input: Parameters<typeof Server.getAdminPayments>[0]) =>
  getAdminPaymentsRpc(input);
export const getAdminDashboard = (input: Parameters<typeof Server.getAdminDashboard>[0]) =>
  getAdminDashboardRpc(input);
export const getAdminProvisioning = createNoArgServerFnProxy("GET", async () =>
  executeServerFn((await import("./admin-read-model.server")).getAdminProvisioning, "GET"),
);
export const getAdminSupportCases = createNoArgServerFnProxy("GET", async () =>
  executeServerFn((await import("./admin-read-model.server")).getAdminSupportCases, "GET"),
);
export const getAdminRefundRequests = createNoArgServerFnProxy("GET", async () =>
  executeServerFn((await import("./admin-read-model.server")).getAdminRefundRequests, "GET"),
);
