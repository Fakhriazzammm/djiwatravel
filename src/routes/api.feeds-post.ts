import { createFileRoute } from "@tanstack/react-router";

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

/** Creates one Feeds post (multipart, optional photo) as the signed-in customer. */
async function receive(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const { configuredAppOrigin } = await import("@/lib/mayar-gateway");
    const { discoveryOriginAllowed } = await import("@/lib/shopper-discovery");
    const development = process.env["NODE_ENV"] !== "production";
    let allowed = !origin || (development && origin === new URL(request.url).origin);
    if (!allowed) {
      try {
        allowed = discoveryOriginAllowed(origin, configuredAppOrigin(), request.url, development);
      } catch {
        allowed = false;
      }
    }
    if (!allowed) return json({ error: "Origin tidak diizinkan" }, 403);
    const { isLocalDevelopmentHost, LOCAL_DEMO_USER } = await import("@/lib/local-development");
    let user: { id: string };
    if (isLocalDevelopmentHost(new URL(request.url).hostname)) user = LOCAL_DEMO_USER;
    else {
      const { authenticateCustomerRequest } = await import("@/lib/customer-session.server");
      user = await authenticateCustomerRequest(request);
    }
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
    const { createFeedPost } = await import("@/lib/feeds.server");
    const result = await createFeedPost({
      subject: user.id,
      body: String(form.get("body") || ""),
      kind: String(form.get("kind") || "cerita"),
      destinationCode: String(form.get("destination") || "") || null,
      placeName: String(form.get("place") || "") || null,
      photo: photo instanceof Blob && photo.size ? new Uint8Array(await photo.arrayBuffer()) : null,
    });
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Postingan belum terkirim";
    const auth = /autentikasi|masuk dulu/i.test(message);
    return json(
      { error: auth ? "Masuk untuk memposting." : message },
      auth ? 401 : /batas/i.test(message) ? 429 : 422,
    );
  }
}

export const Route = createFileRoute("/api/feeds-post")({
  server: { handlers: { POST: ({ request }) => receive(request) } },
});
