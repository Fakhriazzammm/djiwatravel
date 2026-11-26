import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ShippingBookingForm,
  type ShippingBookingPayload,
} from "@/components/shipping/shipping-booking-form";
import { getLastShippingRecipient, getShippingStatus } from "@/lib/shipping.fn";
import { DEFAULT_PUBLIC_SHIPPING_CONFIG } from "@/lib/shipping";

export const Route = createFileRoute("/kirim-barang/baru")({
  head: () => ({
    meta: [
      { title: "Kirim Barang ke Jepang — Djiwa Travel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: async () => {
    const status = await getShippingStatus().catch(() => ({
      config: DEFAULT_PUBLIC_SHIPPING_CONFIG,
      available: false,
    }));
    // Signed out: no previous recipient and the form asks to sign in at the end.
    const last = await getLastShippingRecipient()
      .then((value) => ({ signedIn: true as const, value }))
      .catch(() => ({ signedIn: false as const, value: null }));
    return {
      config: status.config,
      available: status.available,
      signedIn: last.signedIn,
      last: last.value,
    };
  },
  component: NewShipment,
});

/** Sends the booking and its photos in one request, so a booking never exists without them. */
async function createBookingWithPhotos(
  payload: ShippingBookingPayload,
  photos: File[],
): Promise<{ id: string }> {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  for (const photo of photos) form.append("photo", photo, photo.name);
  const response = await fetch("/api/shipping-booking", { method: "POST", body: form });
  const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!response.ok || !body.id) throw new Error(body.error || "Booking belum berhasil, coba lagi.");
  return { id: body.id };
}

function NewShipment() {
  const { config, available, signedIn, last } = Route.useLoaderData();
  const navigate = useNavigate();
  return (
    <ShippingBookingForm
      config={config}
      available={available}
      signedIn={signedIn}
      last={last}
      onSubmit={createBookingWithPhotos}
      onCreated={(id) =>
        void navigate({ to: "/kirim-barang/$id", params: { id }, search: { baru: true } })
      }
    />
  );
}
