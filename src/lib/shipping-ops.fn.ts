import { createServerFn } from "@tanstack/react-start";

// RPC declarations for hub operations and field staff. Guards live in shipping-ops.server.ts.

export const getOpsMe = createServerFn({ method: "GET" }).handler(async () => {
  const { getOpsMeHandler } = await import("./shipping-ops.server");
  return getOpsMeHandler();
});

export const scanOps = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shipping-ops.server")).scanOpsInput(data))
  .handler(async ({ data }) => (await import("./shipping-ops.server")).scanOpsHandler({ data }));

export const createBatch = createServerFn({ method: "POST" })
  .validator(async (data: unknown) =>
    (await import("./shipping-ops.server")).createBatchInput(data),
  )
  .handler(async ({ data }) =>
    (await import("./shipping-ops.server")).createBatchHandler({ data }),
  );

export const listBatches = createServerFn({ method: "POST" })
  .validator(async (data: unknown) =>
    (await import("./shipping-ops.server")).listBatchesInput(data),
  )
  .handler(async ({ data }) =>
    (await import("./shipping-ops.server")).listBatchesHandler({ data }),
  );

export const getBatch = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shipping-ops.server")).batchIdInput(data))
  .handler(async ({ data }) => (await import("./shipping-ops.server")).getBatchHandler({ data }));

export const unloadFromBatch = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shipping-ops.server")).unloadInput(data))
  .handler(async ({ data }) => (await import("./shipping-ops.server")).unloadHandler({ data }));

export const departBatch = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shipping-ops.server")).departInput(data))
  .handler(async ({ data }) =>
    (await import("./shipping-ops.server")).departBatchHandler({ data }),
  );

export const arriveBatch = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shipping-ops.server")).arriveInput(data))
  .handler(async ({ data }) =>
    (await import("./shipping-ops.server")).arriveBatchHandler({ data }),
  );

export const markShippingProblem = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shipping-ops.server")).problemInput(data))
  .handler(async ({ data }) =>
    (await import("./shipping-ops.server")).markProblemHandler({ data }),
  );

export const resolveShippingProblem = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shipping-ops.server")).orderIdInput(data))
  .handler(async ({ data }) =>
    (await import("./shipping-ops.server")).resolveProblemHandler({ data }),
  );

export const correctShippingStatus = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shipping-ops.server")).correctInput(data))
  .handler(async ({ data }) =>
    (await import("./shipping-ops.server")).correctStatusHandler({ data }),
  );

export const listShippingStaff = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./shipping-ops.server")).listStaffHandler(),
);

export const saveShippingStaff = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shipping-ops.server")).saveStaffInput(data))
  .handler(async ({ data }) => (await import("./shipping-ops.server")).saveStaffHandler({ data }));

export const getOpsOrder = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shipping-ops.server")).orderIdInput(data))
  .handler(async ({ data }) =>
    (await import("./shipping-ops.server")).getOpsOrderHandler({ data }),
  );

export const listHubQueue = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shipping-ops.server")).queueInput(data))
  .handler(async ({ data }) =>
    (await import("./shipping-ops.server")).listHubQueueHandler({ data }),
  );
