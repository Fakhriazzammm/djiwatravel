import { createServerFn } from "@tanstack/react-start";

export const getTripExport = createServerFn({ method: "GET" })
  .validator(async (data: unknown) => (await import("./trip-export.server")).tripExportInput(data))
  .handler(async ({ data }) => (await import("./trip-export.server")).tripExportHandler({ data }));
