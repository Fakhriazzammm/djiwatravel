import { z } from "zod";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { recordAdminAction } from "./admin-audit.server";
import { provisionSettledTravelOrder } from "./mayar-provisioning.server";

const inputSchema = z.object({ orderId: z.string().uuid() });
export const adminProvisioningInput = (data: unknown) => inputSchema.parse(data);

export async function retryAdminProvisioningHandler({ data }: { data: unknown }) {
  const input = adminProvisioningInput(data);
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const result = await provisionSettledTravelOrder(input.orderId);
  await recordAdminAction({
    actor,
    action: "provisioning.retry",
    entityType: "order",
    entityId: input.orderId,
    reason: "Retry provisioning manual",
    after: { result: (result as { status?: string } | null)?.status ?? null },
  }).catch(() => undefined);
  return { orderId: input.orderId, ...result };
}
