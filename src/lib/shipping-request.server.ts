/**
 * Request helpers for the two multipart Kirim Barang endpoints (booking with photos, add a photo):
 * origin check, the signed-in customer, and a size-capped body read. Server only.
 */

export const SHIPPING_BODY_LIMIT = 14 * 1024 * 1024;

/** The verified customer behind the request, after the same-origin check the other upload endpoints use. */
export async function shippingCustomerFromRequest(request: Request): Promise<{ id: string }> {
  const origin = request.headers.get("origin");
  const { configuredAppOrigin } = await import("./mayar-gateway");
  const { discoveryOriginAllowed } = await import("./shopper-discovery");
  const development = process.env["NODE_ENV"] !== "production";
  let allowed = !origin || (development && origin === new URL(request.url).origin);
  if (!allowed) {
    try {
      allowed = discoveryOriginAllowed(origin, configuredAppOrigin(), request.url, development);
    } catch {
      allowed = false;
    }
  }
  if (!allowed) throw Object.assign(new Error("Origin tidak diizinkan"), { status: 403 });
  const { isLocalDevelopmentHost, LOCAL_DEMO_USER } = await import("./local-development");
  if (isLocalDevelopmentHost(new URL(request.url).hostname)) return LOCAL_DEMO_USER;
  const { authenticateCustomerRequest } = await import("./customer-session.server");
  return authenticateCustomerRequest(request);
}

/** Reads a multipart body without trusting Content-Length, stopping at the limit. */
export async function readShippingForm(request: Request): Promise<FormData> {
  if (Number(request.headers.get("content-length") || 0) > SHIPPING_BODY_LIMIT)
    throw Object.assign(new Error("Foto terlalu besar."), { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error("Permintaan kosong"), { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > SHIPPING_BODY_LIMIT) {
      await reader.cancel();
      throw Object.assign(new Error("Foto terlalu besar."), { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return new Response(bytes, {
    headers: { "content-type": request.headers.get("content-type") || "" },
  }).formData();
}

export async function blobBytes(value: FormDataEntryValue | null): Promise<Uint8Array | null> {
  return value instanceof Blob && value.size > 0 ? new Uint8Array(await value.arrayBuffer()) : null;
}
