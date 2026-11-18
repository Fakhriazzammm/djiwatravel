import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShippingBookingForm } from "@/components/shipping/shipping-booking-form";
import {
  createShippingOrder,
  getLastShippingRecipient,
  getShippingStatus,
} from "@/lib/shipping.fn";
import { DEFAULT_SHIPPING_CONFIG, normalizeShippingConfig } from "@/lib/shipping";

export const Route = createFileRoute("/kirim-barang/baru")({
  head: () => ({
    meta: [
      { title: "Kirim Barang ke Jepang — Djiwa Travel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: async () => {
    const status = await getShippingStatus().catch(() => ({
      config: DEFAULT_SHIPPING_CONFIG,
      available: false,
    }));
    // Signed out: no previous recipient and the form asks to sign in at the end.
    const last = await getLastShippingRecipient()
      .then((value) => ({ signedIn: true as const, value }))
      .catch(() => ({ signedIn: false as const, value: null }));
    return {
      config: normalizeShippingConfig(status.config),
      available: status.available,
      signedIn: last.signedIn,
      last: last.value,
    };
  },
  component: NewShipment,
});

function NewShipment() {
  const { config, available, signedIn, last } = Route.useLoaderData();
  const navigate = useNavigate();
  return (
    <ShippingBookingForm
      config={config}
      available={available}
      signedIn={signedIn}
      last={last}
      onSubmit={(payload) => createShippingOrder({ data: payload })}
      onCreated={(id) =>
        void navigate({ to: "/kirim-barang/$id", params: { id }, search: { baru: true } })
      }
    />
  );
}
