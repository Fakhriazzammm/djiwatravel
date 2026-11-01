import { createFileRoute } from "@tanstack/react-router";
import { Page, BackBar } from "@/components/shell";
import { CheckoutForm } from "@/components/checkout-form";
import { loadCheckout } from "@/lib/checkout-load.fn";

export const Route = createFileRoute("/checkout/$id")({
  loader: ({ params }) => loadCheckout({ data: params.id }),
  head: () => ({
    meta: [
      { title: "Checkout — Djiwa Travel" },
      { name: "description", content: "Bayar eSIM lewat QRIS atau saldo Djiwa Pay." },
      { property: "og:title", content: "Checkout — Djiwa Travel" },
      { property: "og:description", content: "Bayar eSIM lewat QRIS atau saldo Djiwa Pay." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Checkout,
});

function Checkout() {
  const data = Route.useLoaderData();
  return (
    <Page>
      <BackBar title="Checkout" />
      <CheckoutForm {...data} />
    </Page>
  );
}
