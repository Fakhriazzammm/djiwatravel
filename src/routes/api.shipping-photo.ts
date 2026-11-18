import { createFileRoute } from "@tanstack/react-router";

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Attaches one photo (multipart: orderId, photo) to a shipment. The team adds weigh-in photos; the
 * signed-in owner adds proof photos while the parcel is still waiting or at the drop point.
 */
async function receive(request: Request) {
  try {
    const { shippingCustomerFromRequest, readShippingForm, blobBytes } =
      await import("@/lib/shipping-request.server");
    const form = await readShippingForm(request);
    const orderId = String(form.get("orderId") || "");
    const bytes = await blobBytes(form.get("photo"));
    if (!/^[0-9a-f-]{36}$/i.test(orderId) || !bytes)
      return json({ error: "Pilih foto dulu." }, 400);
    const { addShippingPhoto, addCustomerShippingPhoto } = await import("@/lib/shipping.server");
    if (form.get("as") === "admin") {
      return json(await addShippingPhoto(orderId, bytes));
    }
    const user = await shippingCustomerFromRequest(request);
    return json(await addCustomerShippingPhoto(user.id, orderId, bytes));
  } catch (error) {
    const status = (error as { status?: number }).status;
    return json(
      { error: error instanceof Error ? error.message : "Foto belum terunggah" },
      status ?? 422,
    );
  }
}

export const Route = createFileRoute("/api/shipping-photo")({
  server: { handlers: { POST: ({ request }) => receive(request) } },
});
