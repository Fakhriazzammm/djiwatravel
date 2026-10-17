import { createServerFn } from "@tanstack/react-start";
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { RESELLER_CONFIG } from "./reseller-config";

const BASE_URL = "https://api.esimaccess.com";
const querySchema = z
  .object({
    locationCode: z.string().trim().max(8).optional(),
    type: z.string().trim().max(20).optional(),
    slug: z.string().trim().max(120).optional(),
    packageCode: z.string().trim().max(120).optional(),
    iccid: z.string().trim().max(40).optional(),
  })
  .default({});

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type ApiResponse<T extends JsonValue = JsonValue> = {
  errorCode?: string | number;
  errorMessage?: string;
  errorMsg?: string;
  obj?: T;
  data?: T;
};

async function request<T extends JsonValue = JsonValue>(
  path: string,
  body: Record<string, unknown> = {},
) {
  const accessCode = process.env["ESIM_ACCESS_CODE"];
  const secretKey = process.env["ESIM_ACCESS_SECRET_KEY"];
  if (!accessCode || !secretKey) throw new Error("eSIM Access belum dikonfigurasi di server");
  const requestId = randomUUID();
  const timestamp = String(Date.now());
  const requestBody = JSON.stringify(body);
  const signature = createHmac("sha256", secretKey)
    .update(timestamp + requestId + accessCode + requestBody)
    .digest("hex");
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "RT-AccessCode": accessCode,
      "RT-RequestID": requestId,
      "RT-Timestamp": timestamp,
      "RT-Signature": signature,
    },
    body: requestBody,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json()) as ApiResponse<T>;
  const code = payload.errorCode == null ? undefined : String(payload.errorCode);
  if (!response.ok || (code && code !== "0")) {
    throw new Error(
      payload.errorMessage ?? payload.errorMsg ?? `eSIM Access error ${code ?? response.status}`,
    );
  }
  return payload;
}

export const queryEsimAccessPackages = createServerFn({ method: "POST" })
  .validator(querySchema)
  .handler(({ data }) => request("/api/v1/open/package/list", data));

const orderSchema = z.object({
  transactionId: z.string().trim().min(1).max(120),
  packageInfoList: z
    .array(
      z.object({
        packageCode: z.string().trim().min(1).max(120),
        count: z.number().int().positive().max(20),
        price: z.number().nonnegative().optional(),
        periodNum: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(20),
});

export async function orderEsimAccessProfilesServer(data: z.infer<typeof orderSchema>) {
  // This function is intentionally server-only. Do not wrap provisioning in a
  // public createServerFn: callers must pass through the settled-order worker.
  return request("/api/v1/open/esim/order", data);
}

type ProviderPackageListItem = { packageCode?: string; price?: number };

/** Reads the eSIM profiles the provider has issued for one provider order number. */
export async function queryEsimAccessProfilesServer(input: { orderNo: string }) {
  return request("/api/v1/open/esim/query", {
    pager: { pageNum: 1, pageSize: 20 },
    orderNo: input.orderNo,
  });
}

/**
 * The provider rejects an order whose `price` no longer matches its catalogue
 * ("the package`s price is expired, please update it"), so reprice every package against the
 * live catalogue right before ordering. Unknown packages keep the stored price.
 */
export async function fetchEsimAccessPackagePrices(
  packageCodes: string[],
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  for (const code of new Set(packageCodes.filter(Boolean))) {
    try {
      const payload = await request("/api/v1/open/package/list", { packageCode: code });
      const list =
        (payload.obj as { packageList?: ProviderPackageListItem[] } | undefined)?.packageList ??
        (payload.data as { packageList?: ProviderPackageListItem[] } | undefined)?.packageList ??
        [];
      const match = list.find((item) => String(item.packageCode ?? "") === code) ?? list[0];
      const price = Number(match?.price);
      if (Number.isFinite(price) && price >= 0) prices[code] = price;
    } catch {
      // Keep the stored price when the catalogue is unreachable.
    }
  }
  return prices;
}

/** Provider balance in 1/10,000 USD units (193000 = US$19.30). */
export type ProviderBalance = {
  balanceUnits: number;
  usd: number;
  idrReference: number;
  fxRateIdr: number;
  fetchedAt: string;
};

export async function fetchEsimAccessBalanceServer(): Promise<ProviderBalance> {
  const payload = await request("/api/v1/open/balance/query", {});
  const obj = (payload.obj ?? payload.data) as { balance?: unknown } | undefined;
  const balanceUnits = Number(obj?.balance);
  if (!Number.isFinite(balanceUnits) || balanceUnits < 0) {
    throw new Error("Saldo provider tidak terbaca");
  }
  const usd = balanceUnits / 10_000;
  return {
    balanceUnits,
    usd,
    // Indicative only: the reseller FX config is the reference, not an accounting rate.
    idrReference: Math.round(usd * RESELLER_CONFIG.usdToIdr),
    fxRateIdr: RESELLER_CONFIG.usdToIdr,
    fetchedAt: new Date().toISOString(),
  };
}
