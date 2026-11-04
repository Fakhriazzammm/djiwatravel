import { createServerFn } from "@tanstack/react-start";

// RPC declarations. Implementations, the AI key and the admin guard stay server-only.

export const getReceiptScanStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getAuthenticatedUser } = await import("./customer-session.fn");
  const { receiptScanStatus } = await import("./receipt-scan.server");
  const user = await getAuthenticatedUser();
  return receiptScanStatus(user.id);
});

export const getReceiptFxRate = createServerFn({ method: "GET" })
  .validator(async (data: unknown) => {
    const { fxRateInput } = await import("./receipt-scan.server");
    return fxRateInput(data);
  })
  .handler(async ({ data }) => {
    const { getAuthenticatedUser } = await import("./customer-session.fn");
    const { fetchFxRate } = await import("./receipt-scan.server");
    await getAuthenticatedUser();
    return fetchFxRate(data);
  });

export const saveScannedExpenses = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveScannedInput } = await import("./receipt-scan.server");
    return saveScannedInput(data);
  })
  .handler(async ({ data }) => {
    const { getAuthenticatedUser } = await import("./customer-session.fn");
    const { saveScannedExpenses: save } = await import("./receipt-scan.server");
    const user = await getAuthenticatedUser();
    return save(user.id, data);
  });

export const getAdminReceiptScan = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminReceiptScanHandler } = await import("./receipt-scan.server");
  return getAdminReceiptScanHandler();
});

export const saveAdminReceiptScan = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveReceiptScanConfigInput } = await import("./receipt-scan.server");
    return saveReceiptScanConfigInput(data);
  })
  .handler(async ({ data }) => {
    const { saveReceiptScanConfigHandler } = await import("./receipt-scan.server");
    return saveReceiptScanConfigHandler({ data });
  });
