import { createHmac } from "node:crypto";

const ORDER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function djiwaTravelWalletIdempotencyKey(orderId: string) {
  if (!ORDER_ID_RE.test(orderId)) throw new Error("ID pesanan Djiwa Travel tidak valid");
  return "djiwa-travel-order:" + orderId;
}

export function buildTravelWalletChargeRequest(input: {
  orderId: string;
  amount: number;
  cookie: string;
  secret: string;
  timestamp: string;
}) {
  if (!ORDER_ID_RE.test(input.orderId)) throw new Error("ID pesanan Djiwa Travel tidak valid");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("Nominal pesanan tidak valid");
  if (!input.cookie.trim()) throw new Error("Autentikasi diperlukan");
  if (Buffer.byteLength(input.secret, "utf8") < 32) throw new Error("Bridge saldo Djiwa Pay belum dikonfigurasi");
  if (!/^\d{13}$/.test(input.timestamp)) throw new Error("Timestamp permintaan tidak valid");

  const body = JSON.stringify({ orderId: input.orderId, amount: input.amount });
  const signature = createHmac("sha256", input.secret)
    .update(input.timestamp + "." + body)
    .digest("hex");
  return {
    body,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      cookie: input.cookie,
      "x-travel-timestamp": input.timestamp,
      "x-travel-signature": signature,
    },
  };
}

export type DjiwaPayChargeOutcome =
  | { kind: "paid"; transactionId: string }
  | { kind: "insufficient_balance"; balance?: number }
  | { kind: "wallet_blocked" }
  | { kind: "pending" };

export function parseDjiwaPayChargeResponse(status: number, payload: unknown): DjiwaPayChargeOutcome {
  if (!payload || typeof payload !== "object") return { kind: "pending" };
  const body = payload as Record<string, unknown>;
  if (
    status === 200 &&
    body["success"] === true &&
    (body["status"] === "charged" || body["status"] === "already_charged") &&
    typeof body["transactionId"] === "string" &&
    body["transactionId"].trim()
  ) {
    return { kind: "paid", transactionId: body["transactionId"].trim() };
  }
  if (status === 409 && body["error"] === "INSUFFICIENT_BALANCE") {
    const balance = body["balance"];
    return {
      kind: "insufficient_balance",
      ...(typeof balance === "number" && Number.isSafeInteger(balance) && balance >= 0 ? { balance } : {}),
    };
  }
  if (status === 423 && body["error"] === "WALLET_BLOCKED") return { kind: "wallet_blocked" };
  return { kind: "pending" };
}
