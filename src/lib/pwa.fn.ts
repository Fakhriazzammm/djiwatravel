import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.

/** Public, customer-safe PWA policy plus the VAPID public key (null while push is off). */
export const getPwaConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getPwaConfigHandler } = await import("./pwa.server");
  return getPwaConfigHandler();
});

export const getAdminPwa = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminPwaHandler } = await import("./pwa.server");
  return getAdminPwaHandler();
});

export const savePwaConfig = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { savePwaConfigInput } = await import("./pwa.server");
    return savePwaConfigInput(data);
  })
  .handler(async ({ data }) => {
    const { savePwaConfigHandler } = await import("./pwa.server");
    return savePwaConfigHandler({ data });
  });

export const sendPwaNotification = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { sendPwaNotificationInput } = await import("./pwa.server");
    return sendPwaNotificationInput(data);
  })
  .handler(async ({ data }) => {
    const { sendPwaNotificationHandler } = await import("./pwa.server");
    return sendPwaNotificationHandler({ data });
  });
