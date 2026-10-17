import { createHmac, timingSafeEqual } from "node:crypto";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "REFUNDED";
export type PaymentIntent = {
  id: string;
  orderId: string;
  amountIdr: number;
  status: PaymentStatus;
  checkoutUrl?: string;
  providerReference?: string;
};
export type VerifiedPaymentEvent = {
  eventId: string;
  orderId: string;
  status: PaymentStatus;
  amountIdr: number;
  providerReference?: string;
  occurredAt: string;
};

export interface PaymentGateway {
  createPayment(input: {
    orderId: string;
    amountIdr: number;
    customerEmail: string;
  }): Promise<PaymentIntent>;
  verifyWebhook(rawBody: string, signature: string): VerifiedPaymentEvent;
}

/** Provider-neutral boundary. Bind a real gateway adapter after provider selection; never auto-confirms payment. */
export class HmacPaymentWebhookVerifier {
  constructor(private readonly secret = process.env["PAYMENT_WEBHOOK_SECRET"]) {}

  verifyWebhook(rawBody: string, signature: string): VerifiedPaymentEvent {
    if (!this.secret) throw new Error("PAYMENT_WEBHOOK_SECRET belum dikonfigurasi");
    const expected = createHmac("sha256", this.secret).update(rawBody, "utf8").digest("hex");
    const received = signature.replace(/^sha256=/, "").toLowerCase();
    if (
      !/^[0-9a-f]{64}$/.test(received) ||
      !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"))
    )
      throw new Error("Signature payment webhook tidak valid");
    const event = JSON.parse(rawBody) as Partial<VerifiedPaymentEvent>;
    if (!event.eventId || !event.orderId || !event.status || !event.amountIdr || !event.occurredAt)
      throw new Error("Payload payment webhook tidak lengkap");
    if (!["PENDING", "PAID", "FAILED", "EXPIRED", "REFUNDED"].includes(event.status))
      throw new Error("Status payment tidak dikenal");
    return event as VerifiedPaymentEvent;
  }
}
