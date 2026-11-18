import { createFileRoute } from "@tanstack/react-router";

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

/** Creates one booking with its proof photos (multipart: `payload` JSON + `photo` files) as the signed-in customer. */
async function receive(request: Request) {
  try {
    const { shippingCustomerFromRequest, readShippingForm, blobBytes } =
      await import("@/lib/shipping-request.server");
    const user = await shippingCustomerFromRequest(request);
    const form = await readShippingForm(request);
    const { createShippingBooking, createShippingOrderInput } =
      await import("@/lib/shipping.server");
    let payload: ReturnType<typeof createShippingOrderInput>;
    try {
      payload = createShippingOrderInput(JSON.parse(String(form.get("payload") || "")));
    } catch {
      return json({ error: "Data booking tidak lengkap. Periksa lagi formnya." }, 400);
    }
    const photos: Uint8Array[] = [];
    for (const entry of form.getAll("photo")) {
      const bytes = await blobBytes(entry);
      if (bytes) photos.push(bytes);
    }
    return json(await createShippingBooking({ user, data: payload, photos }));
  } catch (error) {
    const status = (error as { status?: number }).status;
    const message = error instanceof Error ? error.message : "Booking belum berhasil";
    const auth = /autentikasi|masuk dulu/i.test(message);
    return json(
      { error: auth ? "Masuk dulu untuk membuat booking." : message },
      status ?? (auth ? 401 : 422),
    );
  }
}

export const Route = createFileRoute("/api/shipping-booking")({
  server: { handlers: { POST: ({ request }) => receive(request) } },
});
