import { createServerFn } from "@tanstack/react-start";

// RPC declarations. Guards, ownership and database access stay in shipping.server.ts.

export const getShippingStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getShippingStatusHandler } = await import("./shipping.server");
  return getShippingStatusHandler();
});

export const getLastShippingRecipient = createServerFn({ method: "GET" }).handler(async () => {
  const { getLastShippingRecipientHandler } = await import("./shipping.server");
  return getLastShippingRecipientHandler();
});

export const payShippingOrder = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { shippingOrderIdInput } = await import("./shipping.server");
    return shippingOrderIdInput(data);
  })
  .handler(async ({ data }) => {
    const { payShippingOrderHandler } = await import("./shipping.server");
    return payShippingOrderHandler({ data });
  });

export const verifyShippingPayment = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { shippingOrderIdInput } = await import("./shipping.server");
    return shippingOrderIdInput(data);
  })
  .handler(async ({ data }) => {
    const { verifyShippingPaymentHandler } = await import("./shipping.server");
    return verifyShippingPaymentHandler({ data });
  });

export const cancelShippingBooking = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { shippingOrderIdInput } = await import("./shipping.server");
    return shippingOrderIdInput(data);
  })
  .handler(async ({ data }) => {
    const { cancelShippingBookingHandler } = await import("./shipping.server");
    return cancelShippingBookingHandler({ data });
  });

export const confirmShippingDelivered = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { shippingOrderIdInput } = await import("./shipping.server");
    return shippingOrderIdInput(data);
  })
  .handler(async ({ data }) => {
    const { confirmShippingDeliveredHandler } = await import("./shipping.server");
    return confirmShippingDeliveredHandler({ data });
  });

export const listMyShippingOrders = createServerFn({ method: "GET" }).handler(async () => {
  const { listMyShippingOrdersHandler } = await import("./shipping.server");
  return listMyShippingOrdersHandler();
});

export const getMyShippingOrder = createServerFn({ method: "GET" })
  .validator(async (data: unknown) => {
    const { shippingOrderIdInput } = await import("./shipping.server");
    return shippingOrderIdInput(data);
  })
  .handler(async ({ data }) => {
    const { getMyShippingOrderHandler } = await import("./shipping.server");
    return getMyShippingOrderHandler({ data });
  });

export const deleteMyShippingPhoto = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { shippingPhotoIdInput } = await import("./shipping.server");
    return shippingPhotoIdInput(data);
  })
  .handler(async ({ data }) => {
    const { deleteMyShippingPhotoHandler } = await import("./shipping.server");
    return deleteMyShippingPhotoHandler({ data });
  });

/* Admin */

export const getAdminShipping = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminShippingHandler } = await import("./shipping.server");
  return getAdminShippingHandler();
});

export const saveAdminShippingConfig = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveShippingConfigInput } = await import("./shipping.server");
    return saveShippingConfigInput(data);
  })
  .handler(async ({ data }) => {
    const { saveShippingConfigHandler } = await import("./shipping.server");
    return saveShippingConfigHandler({ data });
  });

export const runAdminShippingAction = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminShippingActionInput } = await import("./shipping.server");
    return adminShippingActionInput(data);
  })
  .handler(async ({ data }) => {
    const { adminShippingActionHandler } = await import("./shipping.server");
    return adminShippingActionHandler({ data });
  });
