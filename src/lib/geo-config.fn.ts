import { createServerFn } from "@tanstack/react-start";

export const getAdminGeoConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminGeoConfigHandler } = await import("./geo-config.server");
  return getAdminGeoConfigHandler();
});

export const saveGeoConfig = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveGeoConfigInput } = await import("./geo-config.server");
    return saveGeoConfigInput(data);
  })
  .handler(async ({ data }) => {
    const { saveGeoConfigHandler } = await import("./geo-config.server");
    return saveGeoConfigHandler({ data });
  });
