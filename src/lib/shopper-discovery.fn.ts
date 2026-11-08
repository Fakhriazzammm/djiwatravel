import { createServerFn } from "@tanstack/react-start";
export const getDiscoveryStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { discoveryConfig } = await import("./shopper-discovery.server");
  return (await discoveryConfig()).config;
});
export const getMyDiscoveryRequests = createServerFn({ method: "GET" }).handler(async () => {
  const { listDiscoveryRequests } = await import("./shopper-discovery.server");
  return listDiscoveryRequests();
});
export const runCustomerDiscoveryAction = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { requestActionInput } = await import("./shopper-discovery.server");
    return requestActionInput(data);
  })
  .handler(async ({ data }) => {
    const { customerDiscoveryAction } = await import("./shopper-discovery.server");
    return customerDiscoveryAction(data);
  });
export const acceptDiscoveryQuote = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { acceptDiscoveryInput } = await import("./shopper-discovery.server");
    return acceptDiscoveryInput(data);
  })
  .handler(async ({ data }) => {
    const { acceptDiscoveryOffer } = await import("./shopper-discovery.server");
    return acceptDiscoveryOffer(data);
  });
export const getAdminDiscovery = createServerFn({ method: "GET" }).handler(async () => {
  const { adminDiscoveryData } = await import("./shopper-discovery.server");
  return adminDiscoveryData();
});
export const runAdminDiscoveryAction = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminDiscoveryInput } = await import("./shopper-discovery.server");
    return adminDiscoveryInput(data);
  })
  .handler(async ({ data }) => {
    const { adminDiscoveryAction } = await import("./shopper-discovery.server");
    return adminDiscoveryAction(data);
  });
export const saveAdminDiscoverySettings = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { discoverySettingsInput } = await import("./shopper-discovery.server");
    return discoverySettingsInput(data);
  })
  .handler(async ({ data }) => {
    const { saveDiscoverySettings } = await import("./shopper-discovery.server");
    return saveDiscoverySettings(data);
  });
