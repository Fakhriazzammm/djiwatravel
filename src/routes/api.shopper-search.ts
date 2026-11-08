import { createFileRoute } from "@tanstack/react-router";
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
async function receive(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const { configuredAppOrigin } = await import("@/lib/mayar-gateway");
    const { discoveryOriginAllowed } = await import("@/lib/shopper-discovery");
    if (
      !discoveryOriginAllowed(
        origin,
        configuredAppOrigin(),
        request.url,
        process.env["NODE_ENV"] !== "production",
      )
    )
      return json({ error: "Origin tidak diizinkan" }, 403);
    const { authenticateCustomerRequest } = await import("@/lib/customer-session.server");
    const user = await authenticateCustomerRequest(request);
    const limit = 6 * 1024 * 1024;
    if (Number(request.headers.get("content-length") || 0) > limit)
      return json({ error: "Foto maksimal 5 MB." }, 413);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Permintaan kosong" }, 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        return json({ error: "Foto maksimal 5 MB." }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    const form = await new Response(bytes, {
      headers: { "content-type": request.headers.get("content-type") || "" },
    }).formData();
    const photo = form.get("photo");
    const { searchDiscovery } = await import("@/lib/shopper-discovery.server");
    const result = await searchDiscovery({
      subject: user.id,
      clientKey: String(form.get("clientKey") || ""),
      url: String(form.get("url") || ""),
      note: String(form.get("note") || ""),
      ...(photo instanceof Blob ? { photo: new Uint8Array(await photo.arrayBuffer()) } : {}),
    });
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pencarian belum tersedia";
    const auth = /autentikasi/i.test(message);
    return json(
      { error: auth ? "Masuk untuk mencari dan menyimpan barang incaranmu." : message },
      auth ? 401 : /batas/i.test(message) ? 429 : 422,
    );
  }
}
export const Route = createFileRoute("/api/shopper-search")({
  server: { handlers: { POST: ({ request }) => receive(request) } },
});
