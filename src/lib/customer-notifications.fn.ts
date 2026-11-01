import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
// Route loaders must call these instead of fetching "/api/..." relatively, because a relative
// URL cannot be resolved during server-side rendering. Input is validated by listSchema on the
// server (listCustomerNotifications parses it).
export const getCustomerNotificationsFeed = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as Record<string, unknown>)
  .handler(async ({ data }) => {
    const { listCustomerNotifications } = await import("./customer-notifications.server");
    return listCustomerNotifications(data);
  });
