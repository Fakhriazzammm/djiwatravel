import { createServerFn } from "@tanstack/react-start";
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";

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
  packageInfoList: z.array(z.object({
    packageCode: z.string().trim().min(1).max(120),
    count: z.number().int().positive().max(20),
    price: z.number().nonnegative().optional(),
    periodNum: z.number().int().positive().optional(),
  })).min(1).max(20),
});

export async function orderEsimAccessProfilesServer(data: z.infer<typeof orderSchema>) {
  // This function is intentionally server-only. Do not wrap provisioning in a
  // public createServerFn: callers must pass through the settled-order worker.
  return request("/api/v1/open/esim/order", data);
}
