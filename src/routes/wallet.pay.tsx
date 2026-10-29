import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DjiwaPayBrowser } from "@/components/djiwa-pay-browser";

export const Route = createFileRoute("/wallet/pay")({
  head: () => ({
    meta: [
      { title: "Djiwa Pay — Djiwa Travel" },
      { name: "description", content: "Buka Djiwa Pay di dalam Djiwa Travel." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WalletPay,
});

function WalletPay() {
  const navigate = useNavigate();

  return (
    <DjiwaPayBrowser
      open
      layout="page"
      onOpenChange={(open) => {
        if (!open) void navigate({ to: "/wallet" });
      }}
    />
  );
}
