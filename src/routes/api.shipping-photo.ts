import { createFileRoute } from "@tanstack/react-router";

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

/** Admin attaches one weigh-in photo (multipart: orderId, photo) to a shipment. */
async function receive(request: Request) {
  try {
    const { requireAdmin } = await import("@/lib/admin-guard");
    await requireAdmin();
    const limit = 6 * 1024 * 1024;
    if (Number(request.headers.get("content-length") || 0) > limit)
      return json({ error: "Foto maksimal 5 MB." }, 413);
    const form = await request.formData();
    const orderId = String(form.get("orderId") || "");
    const photo = form.get("photo");
    if (!/^[0-9a-f-]{36}$/i.test(orderId) || !(photo instanceof Blob) || photo.size === 0)
      return json({ error: "Pilih foto dulu." }, 400);
    if (photo.size > limit) return json({ error: "Foto maksimal 5 MB." }, 413);
    const { addShippingPhoto } = await import("@/lib/shipping.server");
    return json(await addShippingPhoto(orderId, new Uint8Array(await photo.arrayBuffer())));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Foto belum terunggah" }, 422);
  }
}

export const Route = createFileRoute("/api/shipping-photo")({
  server: { handlers: { POST: ({ request }) => receive(request) } },
});
