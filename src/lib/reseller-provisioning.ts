import { assertTransition, buildProvisioningDraft, type ProvisioningOrderDraft } from "./reseller-order";
import type { ResellerRepository } from "./reseller-repository";

export type ProvisioningResult = { providerTransactionId: string; providerOrderNo?: string; status: string; payload: unknown };
export interface EsimProvisioningGateway { provision(draft: ProvisioningOrderDraft): Promise<ProvisioningResult>; }

/** Provisioning is deliberately gated by PAYMENT_CONFIRMED; no unpaid order reaches the provider. */
export async function provisionConfirmedOrder(repo: ResellerRepository, gateway: EsimProvisioningGateway, input: Omit<ProvisioningOrderDraft, "transactionId">) {
  const order = await repo.getOrder(input.orderId);
  if (!order) throw new Error("Order provisioning tidak ditemukan");
  if (order.status !== "PAYMENT_CONFIRMED") throw new Error("Provisioning hanya boleh setelah pembayaran terkonfirmasi");
  assertTransition(order.status, "PROVISIONING");
  await repo.updateOrderStatus(order.id, "PROVISIONING");
  return gateway.provision(buildProvisioningDraft(input));
}
