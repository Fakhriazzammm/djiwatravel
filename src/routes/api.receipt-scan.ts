import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Reads one receipt photo (multipart: tripId, photo). Auth and ownership come from the session. */
async function receive(request: Request) {
  try {
    const { authenticateCustomerRequest } = await import("@/lib/customer-session.server");
    const { scanReceipt } = await import("@/lib/receipt-scan.server");
    const user = await authenticateCustomerRequest(request);
    const form = await request.formData();
    const tripId = String(form.get("tripId") ?? "");
    const photo = form.get("photo");
    if (!/^[0-9a-f-]{36}$/i.test(tripId) || !(photo instanceof Blob))
      return json({ ok: false, code: "bad_image", message: "Permintaan tidak valid." }, 400);
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const result = await scanReceipt({ userId: user.id, tripId, bytes });
    return json(result, result.ok ? 200 : result.code === "limit" ? 429 : 422);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/autentikasi/i.test(message))
      return json(
        { ok: false, code: "unavailable", message: "Sesi berakhir. Masuk kembali." },
        401,
      );
    console.error("[receipt-scan] request failed", message);
    return json({ ok: false, code: "unavailable", message: "Struk belum bisa dibaca." }, 500);
  }
}

export const Route = createFileRoute("/api/receipt-scan")({
  server: { handlers: { POST: ({ request }) => receive(request) } },
});
