import { createServerFn } from "@tanstack/react-start";

export const listTravoMemory = createServerFn({ method: "GET" }).handler(async () => {
  const { listMemoryHandler } = await import("./travo-docs.server");
  return listMemoryHandler();
});
export const addTravoMemory = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./travo-docs.server")).addMemoryInput(data))
  .handler(async ({ data }) => (await import("./travo-docs.server")).addMemoryHandler({ data }));
export const deleteTravoMemory = createServerFn({ method: "POST" })
  .validator(async (data: unknown) =>
    (await import("./travo-docs.server")).memoryIdInputParse(data),
  )
  .handler(async ({ data }) => (await import("./travo-docs.server")).deleteMemoryHandler({ data }));
export const clearTravoMemory = createServerFn({ method: "POST" }).handler(async () =>
  (await import("./travo-docs.server")).clearMemoryHandler(),
);

export const getAdminTravoDocs = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./travo-docs.server")).adminListDocsHandler(),
);
export const saveAdminTravoDoc = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./travo-docs.server")).saveDocInput(data))
  .handler(async ({ data }) => (await import("./travo-docs.server")).adminSaveDocHandler({ data }));
export const deleteAdminTravoDoc = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./travo-docs.server")).deleteDocInput(data))
  .handler(async ({ data }) =>
    (await import("./travo-docs.server")).adminDeleteDocHandler({ data }),
  );
export const restoreAdminTravoDocs = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => data as { reason: string })
  .handler(async ({ data }) =>
    (await import("./travo-docs.server")).adminRestoreDocsHandler({ data }),
  );
