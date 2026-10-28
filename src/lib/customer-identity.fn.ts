import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const identityInput = z.object({
  authenticatedEmail: z.string().email().max(254),
  cookie: z.string().max(4096),
});

export type CanonicalCustomerIdentity = { sourceId: string; email: string };

export const getCanonicalCustomerIdentity = createServerFn({ method: "POST" })
  .validator(identityInput)
  .handler(async ({ data }): Promise<CanonicalCustomerIdentity> => {
    const { resolveCanonicalCustomerIdentity } = await import("./customer-identity.server");
    return resolveCanonicalCustomerIdentity(data.authenticatedEmail, data.cookie);
  });
