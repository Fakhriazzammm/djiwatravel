import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Page } from "@/components/shell";

type Eligibility = {
  public_order_code: string;
  status: string;
  eligible: boolean;
  reason: string;
  provisioning_started: boolean;
};
type RefundResponse = {
  eligibility?: Eligibility;
  accepted?: boolean;
  error?: string;
} & Partial<Eligibility>;

const safeEligibility = (payload: unknown): Eligibility | null => {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as RefundResponse).eligibility ?? (payload as RefundResponse);
  if (
    typeof value.public_order_code !== "string" ||
    typeof value.status !== "string" ||
    typeof value.eligible !== "boolean" ||
    typeof value.reason !== "string" ||
    typeof value.provisioning_started !== "boolean"
  )
    return null;
  return {
    public_order_code: value.public_order_code,
    status: value.status,
    eligible: value.eligible,
    reason: value.reason,
    provisioning_started: value.provisioning_started,
  };
};

async function readRefund(order: string): Promise<Eligibility> {
  const response = await fetch(`/api/customer-refund?order=${encodeURIComponent(order)}`, {
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json().catch(() => null);
  const eligibility = safeEligibility(payload);
  if (!response.ok || !eligibility) throw new Error("Status refund belum dapat dimuat. Coba lagi.");
  return eligibility;
}

async function requestRefund(order: string): Promise<RefundResponse> {
  const response = await fetch("/api/customer-refund", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ order }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object")
    throw new Error("Permintaan refund belum dapat diproses. Coba lagi.");
  return payload as RefundResponse;
}

export const Route = createFileRoute("/refund/$order")({
  head: () => ({
    meta: [
      { title: "Refund pesanan — Djiwa Travel" },
      { name: "description", content: "Periksa kelayakan refund pesananmu." },
    ],
  }),
  component: RefundPage,
});

function RefundPage() {
  const { order } = useParams({ from: "/refund/$order" });
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      setEligibility(await readRefund(order));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Status refund belum dapat dimuat. Coba lagi.",
      );
    } finally {
      setLoading(false);
    }
  }, [order]);
  useEffect(() => {
    void load();
  }, [load]);

  async function submitRequest() {
    if (!eligibility?.eligible || requesting) return;
    setRequesting(true);
    setError(null);
    try {
      const result = await requestRefund(order);
      if (result.error === "provider_refund_workflow_unavailable") setUnavailable(true);
      else setError("Permintaan refund belum dapat diproses. Coba lagi.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Permintaan refund belum dapat diproses. Coba lagi.",
      );
    } finally {
      setRequesting(false);
    }
  }

  return (
    <Page tabs={false}>
      <header className="flex h-14 items-center gap-3">
        <Link
          to="/profile"
          aria-label="Kembali ke profil"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-brand-red"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="text-base font-bold">Refund pesanan</h1>
      </header>
      <p className="mt-2 text-sm text-muted-foreground">
        Periksa status pengembalian dana dengan aman.
      </p>
      {loading && (
        <div
          role="status"
          className="mt-8 rounded-2xl border bg-surface p-6 text-center text-sm text-muted-foreground"
        >
          Memuat kelayakan refund…
        </div>
      )}
      {error && !loading && (
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex min-h-10 items-center gap-2 font-semibold underline"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Coba lagi
          </button>
        </div>
      )}
      {!loading && !error && eligibility && (
        <>
          <section
            className="mt-6 rounded-2xl border bg-surface p-4"
            aria-labelledby="eligibility-title"
          >
            <h2 id="eligibility-title" className="text-lg font-bold">
              Ringkasan pesanan
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Kode pesanan</dt>
                <dd className="font-semibold">{eligibility.public_order_code}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-semibold">{eligibility.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Provisioning</dt>
                <dd className="font-semibold">
                  {eligibility.provisioning_started ? "Sudah dimulai" : "Belum dimulai"}
                </dd>
              </div>
            </dl>
          </section>
          {eligibility.eligible ? (
            <section className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div>
                  <h2 className="font-bold">Pesanan tampak memenuhi syarat</h2>
                  <p className="mt-1 text-sm">
                    Kamu dapat mengajukan permintaan refund. Hasil akhir tetap mengikuti proses
                    penyedia pembayaran.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void submitRequest()}
                disabled={requesting || unavailable}
                className="mt-4 h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
              >
                {requesting ? "Mengirim…" : "Ajukan refund"}
              </button>
            </section>
          ) : (
            <section className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div>
                  <h2 className="font-bold">Refund belum dapat diajukan</h2>
                  <p className="mt-1 text-sm">
                    {eligibility.reason === "provisioning_already_started"
                      ? "Proses aktivasi sudah dimulai sehingga refund tidak dapat diajukan dari halaman ini."
                      : "Status pesanan ini belum memenuhi syarat refund."}
                  </p>
                </div>
              </div>
            </section>
          )}
          {unavailable && (
            <div
              role="status"
              className="mt-4 rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-950"
            >
              <p className="font-bold">Fitur refund belum tersedia</p>
              <p className="mt-1">
                Penyedia pembayaran belum menyediakan alur refund. Belum ada refund yang berhasil
                dibuat.
              </p>
            </div>
          )}
        </>
      )}
      <Link
        to="/profile"
        className="mt-8 inline-flex min-h-11 items-center font-semibold text-brand-red underline underline-offset-2"
      >
        Kembali ke profil
      </Link>
    </Page>
  );
}
