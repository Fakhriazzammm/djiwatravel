import { createServerFn } from "@tanstack/react-start";

// RPC declaration; the order query and Admin switch stay server-only.
export const getRecentPurchases = createServerFn({ method: "GET" }).handler(async () => {
  const { getRecentPurchasesHandler } = await import("./recent-purchases.server");
  return getRecentPurchasesHandler();
});
