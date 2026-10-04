import { assertTransition, type ResellerOrderStatus } from "./reseller-order";
import type { VerifiedPaymentEvent } from "./payment-gateway";
import type { ResellerRepository } from "./reseller-repository";

export async function settlePaidPayment(repo: ResellerRepository, event: VerifiedPaymentEvent, expectedAmountIdr: number) {
  if (event.status !== "PAID") throw new Error("Hanya event PAID yang boleh menyelesaikan order");
  if (event.amountIdr !== expectedAmountIdr) throw new Error("Nominal payment tidak cocok dengan order");
  if (await repo.hasWebhookFingerprint(event.eventId)) return { duplicate: true as const, order: await repo.getOrder(event.orderId) };
  const order = await repo.getOrder(event.orderId);
  if (!order) throw new Error("Order payment tidak ditemukan");
  assertTransition(order.status as ResellerOrderStatus, "PAYMENT_CONFIRMED");
  const updated = await repo.updateOrderStatus(order.id, "PAYMENT_CONFIRMED");
  await repo.rememberWebhookFingerprint(event.eventId);
  return { duplicate: false as const, order: updated };
}
