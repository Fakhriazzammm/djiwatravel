import { createFileRoute } from "@tanstack/react-router";
import { CustomerAuth } from "@/components/customer-auth";
import { Page } from "@/components/shell";
import { ShippingOpsApp } from "@/components/shipping/ops/ops-app";
import { getOpsMe } from "@/lib/shipping-ops.fn";
import { HUB_LABEL } from "@/lib/shipping";

export const Route = createFileRoute("/petugas")({
  validateSearch: (search: Record<string, unknown>): { scan?: string } =>
    typeof search["scan"] === "string" && search["scan"].length <= 400
      ? { scan: search["scan"] }
      : {},
  head: () => ({
    meta: [
      { title: "Petugas Kirim Barang — Djiwa Travel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  // The page itself is public so a staff member can sign in; every action checks the account.
  loader: () => getOpsMe(),
  component: FieldApp,
});

function FieldApp() {
  const me = Route.useLoaderData();
  const { scan } = Route.useSearch();
  return (
    <Page tabs={false}>
      <div className="mb-3 flex items-center justify-between gap-2 pt-1">
        <div className="min-w-0">
          <h1 className="ios-title">Petugas</h1>
          <p className="ios-subtitle truncate">
            {me.registered
              ? `${me.name || me.email} · ${me.isAdmin ? "Admin" : me.hubs.map((h) => HUB_LABEL[h]).join(", ")}`
              : "Kirim Barang"}
          </p>
        </div>
      </div>
      {!me.signedIn ? (
        <div>
          <p className="mb-2 text-[13px] text-muted-foreground">
            Masuk dengan akun Google yang didaftarkan Admin sebagai petugas.
          </p>
          <CustomerAuth size="block" />
        </div>
      ) : !me.registered ? (
        <div className="ios-card p-3">
          <p className="text-[14px] font-bold">Akun ini belum terdaftar sebagai petugas</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Masuk sebagai {me.email}. Minta Admin mendaftarkan email ini di Admin › Kirim Barang ›
            Petugas, lalu muat ulang halaman ini.
          </p>
        </div>
      ) : (
        <ShippingOpsApp me={me} initialCode={scan ?? null} />
      )}
    </Page>
  );
}
