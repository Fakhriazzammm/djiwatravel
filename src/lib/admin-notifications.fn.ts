import { createServerFn } from "@tanstack/react-start";

export const getAdminNotifications = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminNotificationsHandler } = await import("./admin-notifications.server");
  return getAdminNotificationsHandler();
});

export const revokeAdminNotification = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminNotificationRevokeInput } = await import("./admin-notifications.server");
    return adminNotificationRevokeInput(data);
  })
  .handler(async ({ data }) => {
    const { revokeAdminNotificationHandler } = await import("./admin-notifications.server");
    return revokeAdminNotificationHandler({ data });
  });
