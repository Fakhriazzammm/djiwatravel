import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Page } from "@/components/shell";
import { Skeleton } from "@/components/ui/skeleton";

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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

  return (
    <Page tabs={false}>
      <header className="flex h-14 items-center gap-3">
        <Link
          to="/profile"
          search={{ admin: undefined }}
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
        <div role="status" aria-live="polite" aria-busy="true" className="mt-6">
          <span className="sr-only">Memuat kelayakan refund…</span>
          <div aria-hidden="true" className="rounded-2xl bg-surface p-4">
            <Skeleton className="h-5 w-40 motion-reduce:animate-none" />
            <div className="mt-3 divide-y divide-border/70">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex min-h-12 items-center justify-between gap-4 py-2">
                  <Skeleton className="h-3 w-24 motion-reduce:animate-none" />
                  <Skeleton className="h-4 w-20 motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          </div>
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
          <section className="mt-6 rounded-2xl bg-surface p-4" aria-labelledby="eligibility-title">
            <h2 id="eligibility-title" className="text-lg font-bold">
              Ringkasan pesanan
            </h2>
            <dl className="mt-3 divide-y divide-border/70 text-sm">
              <div className="flex min-h-12 items-center justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Kode pesanan</dt>
                <dd className="text-right font-semibold">{eligibility.public_order_code}</dd>
              </div>
              <div className="flex min-h-12 items-center justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-semibold">{eligibility.status}</dd>
              </div>
              <div className="flex min-h-12 items-center justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Provisioning</dt>
                <dd className="text-right font-semibold">
                  {eligibility.provisioning_started ? "Sudah dimulai" : "Belum dimulai"}
                </dd>
              </div>
            </dl>
          </section>
          <section className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div>
                <h2 className="font-bold">Fitur refund belum tersedia</h2>
                <p className="mt-1 text-sm">
                  Pengajuan refund online belum tersedia. Status di atas bukan persetujuan atau
                  bukti pengembalian dana. Hubungi tim bantuan untuk menanyakan pesananmu.
                </p>
              </div>
            </div>
            <Link
              to="/support"
              className="mt-4 inline-flex min-h-11 items-center font-semibold underline underline-offset-2"
            >
              Hubungi bantuan
            </Link>
          </section>
        </>
      )}
      <Link
        to="/profile"
        search={{ admin: undefined }}
        className="mt-8 inline-flex min-h-11 items-center font-semibold text-brand-red underline underline-offset-2"
      >
        Kembali ke profil
      </Link>
    </Page>
  );
}
