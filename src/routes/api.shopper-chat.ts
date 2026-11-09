import { createFileRoute } from "@tanstack/react-router";
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

/** Sends one chat message with an optional photo (multipart), as the signed-in customer. */
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
    const { z } = await import("zod");
    const threadId = z
      .string()
      .uuid()
      .parse(String(form.get("threadId") || ""));
    const clientKey = String(form.get("clientKey") || "");
    const { sendCustomerMessage } = await import("@/lib/shopper-chat.server");
    const result = await sendCustomerMessage({
      subject: user.id,
      email: user.email,
      threadId,
      body: String(form.get("body") || ""),
      clientKey: /^[0-9a-f-]{36}$/i.test(clientKey) ? clientKey : null,
      photo: photo instanceof Blob ? new Uint8Array(await photo.arrayBuffer()) : null,
    });
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pesan belum terkirim";
    const auth = /autentikasi/i.test(message);
    return json(
      { error: auth ? "Masuk untuk mengirim pesan." : message },
      auth ? 401 : /batas|terlalu cepat/i.test(message) ? 429 : 422,
    );
  }
}
export const Route = createFileRoute("/api/shopper-chat")({
  server: { handlers: { POST: ({ request }) => receive(request) } },
});
