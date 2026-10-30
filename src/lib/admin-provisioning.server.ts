import { z } from "zod";
import { requireAdmin } from "./admin-guard";
import { provisionSettledTravelOrder } from "./mayar-provisioning.server";

const inputSchema = z.object({ orderId: z.string().uuid() });
export const adminProvisioningInput = (data: unknown) => inputSchema.parse(data);

export async function retryAdminProvisioningHandler({ data }: { data: unknown }) {
  const input = adminProvisioningInput(data);
  await requireAdmin();
  const result = await provisionSettledTravelOrder(input.orderId);
  return { orderId: input.orderId, ...result };
}
