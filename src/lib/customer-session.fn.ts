import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isLocalDevelopmentHost, LOCAL_DEMO_USER } from "./local-development";

export type { AuthenticatedUser } from "./customer-session.server";

const sessionInput = z.object({ cookie: z.string().max(4096).optional() }).optional();

export const getAuthenticatedUser = createServerFn({ method: "GET" })
  .validator(sessionInput)
  .handler(async ({ data }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const host = getRequestHeader("host")?.split(":")[0];
    if (isLocalDevelopmentHost(host)) return LOCAL_DEMO_USER;
    const cookie = data?.cookie ?? getRequestHeader("cookie");
    const { authenticateCustomerCookie } = await import("./customer-session.server");
    return authenticateCustomerCookie(cookie ?? "");
  });
