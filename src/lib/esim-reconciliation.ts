import { mapProviderStatus, shouldApplyProfileStatus, type EsimProfileStatus } from "./esim-access-webhooks";

export type ProviderSnapshot = { orderNo?: string; iccid?: string; status?: unknown; activationCode?: string; qrCode?: string; lpa?: string };
export type ReconciliationResult = { status: EsimProfileStatus; providerOrderNo?: string; iccid?: string; changed: boolean; attempts: number };

export async function withRetry<T>(fn: () => Promise<T>, options: { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {}) {
  const attempts = Math.max(1, options.attempts ?? 3);
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return { value: await fn(), attempts: attempt }; }
    catch (error) { lastError = error; if (attempt < attempts) await sleep((options.baseDelayMs ?? 250) * 2 ** (attempt - 1)); }
  }
  throw Object.assign(new Error("Provider tidak merespons setelah retry"), { cause: lastError });
}

export async function reconcileProviderOrder(input: {
  currentStatus: EsimProfileStatus;
  query: () => Promise<ProviderSnapshot>;
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ReconciliationResult> {
  const result = await withRetry(input.query, { attempts: input.attempts, sleep: input.sleep });
  const incoming = mapProviderStatus(result.value.status);
  return {
    status: shouldApplyProfileStatus(input.currentStatus, incoming) ? incoming : input.currentStatus,
    providerOrderNo: result.value.orderNo,
    iccid: result.value.iccid,
    changed: shouldApplyProfileStatus(input.currentStatus, incoming),
    attempts: result.attempts,
  };
}
