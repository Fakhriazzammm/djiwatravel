import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { BackBar, Page } from "@/components/shell";
import { getGuestOrders } from "@/lib/guest-orders.server";
import { saveGuestAccess } from "@/lib/orders";

export const Route = createFileRoute("/order-status")({ component: OrderStatus });

function OrderStatus() {
  const [form, setForm] = useState({ code: "", email: "", whatsapp: "" });
  const [result, setResult] = useState<{
    orderId: string;
    accessToken: string;
    status?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const recover = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/order-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicOrderCode: form.code,
          email: form.email,
          whatsapp: form.whatsapp,
        }),
      });
      const data = (await response.json()) as {
        orderId?: string;
        accessToken?: string;
        error?: string;
      };
      if (!response.ok || !data.orderId || !data.accessToken)
        throw new Error(data.error || "Data pesanan belum dapat diverifikasi.");
      saveGuestAccess(data.orderId, data.accessToken);
      const orders = await getGuestOrders({
        data: [{ orderId: data.orderId, accessToken: data.accessToken }],
      });
      setResult({
        orderId: data.orderId,
        accessToken: data.accessToken,
        ...(orders[0]?.status ? { status: orders[0].status } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data pesanan belum dapat diverifikasi.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page tabs={false}>
      <BackBar title="Cek status pesanan" />
      <div className="mt-5 rounded-2xl bg-surface p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">
          Masukkan kode pesanan dan kedua kontak saat checkout. Data dipakai hanya untuk verifikasi
          akses singkat.
        </p>
        <form onSubmit={recover} className="mt-4 space-y-3">
          <input
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="Kode pesanan"
            className="h-12 w-full rounded-xl bg-background px-4 outline-none"
          />
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email checkout"
            className="h-12 w-full rounded-xl bg-background px-4 outline-none"
          />
          <input
            required
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            placeholder="WhatsApp checkout"
            className="h-12 w-full rounded-xl bg-background px-4 outline-none"
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            disabled={busy}
            className="w-full rounded-xl bg-brand-red px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Memeriksa…" : "Lihat pesanan"}
          </button>
        </form>
        {result && (
          <div className="mt-4 rounded-xl bg-brand-red-soft p-4 text-sm">
            <p className="font-semibold">Pesanan ditemukan</p>
            <p className="mt-1 text-muted-foreground">Status: {result.status || "diproses"}</p>
            <Link
              to="/order/$id"
              params={{ id: result.orderId }}
              className="mt-3 inline-flex font-semibold text-brand-red"
            >
              Buka detail pesanan →
            </Link>
          </div>
        )}
      </div>
    </Page>
  );
}
