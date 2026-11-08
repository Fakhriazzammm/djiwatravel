import { createServerFn } from "@tanstack/react-start";

// RPC declarations. Guards, ownership and database access stay in personal-shopper.server.ts.

export const getShopperStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getShopperStatusHandler } = await import("./personal-shopper.server");
  return getShopperStatusHandler();
});

export const getShopperCatalog = createServerFn({ method: "GET" })
  .validator(async (data: unknown) => {
    const { shopperCatalogInput } = await import("./personal-shopper.server");
    return shopperCatalogInput(data);
  })
  .handler(async ({ data }) => {
    const { getShopperCatalogHandler } = await import("./personal-shopper.server");
    return getShopperCatalogHandler({ data });
  });

export const getLastShoppingAddress = createServerFn({ method: "GET" }).handler(async () => {
  const { getLastShoppingAddressHandler } = await import("./personal-shopper.server");
  return getLastShoppingAddressHandler();
});

export const createShoppingOrder = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { createShoppingOrderInput } = await import("./personal-shopper.server");
    return createShoppingOrderInput(data);
  })
  .handler(async ({ data }) => {
    const { createShoppingOrderHandler } = await import("./personal-shopper.server");
    return createShoppingOrderHandler({ data });
  });

export const payShoppingOrder = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { shoppingOrderIdInput } = await import("./personal-shopper.server");
    return shoppingOrderIdInput(data);
  })
  .handler(async ({ data }) => {
    const { payShoppingOrderHandler } = await import("./personal-shopper.server");
    return payShoppingOrderHandler({ data });
  });

export const verifyShoppingPayment = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { shoppingOrderIdInput } = await import("./personal-shopper.server");
    return shoppingOrderIdInput(data);
  })
  .handler(async ({ data }) => {
    const { verifyShoppingPaymentHandler } = await import("./personal-shopper.server");
    return verifyShoppingPaymentHandler({ data });
  });

export const listMyShoppingOrders = createServerFn({ method: "GET" }).handler(async () => {
  const { listMyShoppingOrdersHandler } = await import("./personal-shopper.server");
  return listMyShoppingOrdersHandler();
});

export const getMyShoppingOrder = createServerFn({ method: "GET" })
  .validator(async (data: unknown) => {
    const { shoppingOrderIdInput } = await import("./personal-shopper.server");
    return shoppingOrderIdInput(data);
  })
  .handler(async ({ data }) => {
    const { getMyShoppingOrderHandler } = await import("./personal-shopper.server");
    return getMyShoppingOrderHandler({ data });
  });

/* Admin */

export const getAdminShopping = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminShoppingHandler } = await import("./personal-shopper.server");
  return getAdminShoppingHandler();
});

export const saveAdminShopperConfig = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveShopperConfigInput } = await import("./personal-shopper.server");
    return saveShopperConfigInput(data);
  })
  .handler(async ({ data }) => {
    const { saveShopperConfigHandler } = await import("./personal-shopper.server");
    return saveShopperConfigHandler({ data });
  });

export const runAdminShoppingAction = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminShoppingActionInput } = await import("./personal-shopper.server");
    return adminShoppingActionInput(data);
  })
  .handler(async ({ data }) => {
    const { adminShoppingActionHandler } = await import("./personal-shopper.server");
    return adminShoppingActionHandler({ data });
  });

export const refreshAdminShopperCatalog = createServerFn({ method: "POST" }).handler(async () => {
  const { refreshShopperCatalogAdminHandler } = await import("./personal-shopper.server");
  return refreshShopperCatalogAdminHandler();
});

export const adminShopperCatalog = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminShopperCatalogInput } = await import("./personal-shopper.server");
    return adminShopperCatalogInput(data);
  })
  .handler(async ({ data }) => {
    const { adminShopperCatalogHandler } = await import("./personal-shopper.server");
    return adminShopperCatalogHandler({ data });
  });
