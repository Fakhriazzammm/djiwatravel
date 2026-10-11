export type DjiwaPayTopup = {
  topup_id: string;
  invoice_id: string;
  invoice_url: string;
  status: "pending";
};

const IDEMPOTENCY_KEY_PREFIX = "djiwa_travel_djiwa_pay_topup_key:";

/** Start a new invoice flow without reusing the previous pending request key. */
export function resetDjiwaPayTopupIdempotency(userId: string) {
  localStorage.removeItem(`${IDEMPOTENCY_KEY_PREFIX}${userId}`);
}

function idempotencyKey(userId: string) {
  const key = `${IDEMPOTENCY_KEY_PREFIX}${userId}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const value = `travel_topup_${crypto.randomUUID()}`;
  localStorage.setItem(key, value);
  return value;
}

export async function beginDjiwaPayTopup(amount: number, userId: string): Promise<DjiwaPayTopup> {
  const response = await fetch("/api/djiwa-pay/topup", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount, idempotencyKey: idempotencyKey(userId) }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      payload && typeof payload.error === "string" ? payload.error : "Top up gagal. Coba lagi.",
    );
  return payload as DjiwaPayTopup;
}
