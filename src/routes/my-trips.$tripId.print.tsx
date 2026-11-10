import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Printer } from "lucide-react";
import { getTripExport } from "@/lib/trip-export.fn";

export const Route = createFileRoute("/my-trips/$tripId/print")({
  validateSearch: (search: Record<string, unknown>) => ({
    auto: search["auto"] === "1" || search["auto"] === 1 || search["auto"] === true,
  }),
  loader: ({ params }) => getTripExport({ data: { tripId: params.tripId } }),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: PrintTrip,
});

/**
 * The trip as a clean document. "Cetak / Simpan PDF" opens the browser's print sheet, whose
 * "Simpan sebagai PDF" gives the file (works on phones too, with any alphabet).
 */
function PrintTrip() {
  const { title, body } = Route.useLoaderData();
  const { tripId } = Route.useParams();
  const { auto } = Route.useSearch();
  useEffect(() => {
    if (!auto) return;
    const timer = window.setTimeout(() => window.print(), 700);
    return () => window.clearTimeout(timer);
  }, [auto]);
  return (
    <div className="min-h-dvh bg-white text-[#1a1a1f]">
      <style>{`
        @page { size: A4; margin: 16mm 14mm; }
        .trip-doc h1 { font-size: 24px; } .trip-doc h2 { font-size: 16px; margin: 20px 0 6px; }
        .trip-doc h3 { font-size: 13px; margin: 14px 0 4px; }
        .trip-doc table { width: 100%; border-collapse: collapse; }
        .trip-doc tr { break-inside: avoid; } .trip-doc h2, .trip-doc h3 { break-after: avoid; }
        @media print { .no-print { display: none !important; } body { background: #fff; } }
      `}</style>
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-white/95 px-3 py-2 backdrop-blur">
        <Link
          to="/my-trips/$tripId"
          params={{ tripId }}
          aria-label="Kembali ke perjalanan"
          className="tap grid size-9 place-items-center rounded-full bg-secondary"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{title}</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="tap inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-red px-4 text-[13px] font-bold text-white"
        >
          <Printer className="size-4" aria-hidden="true" /> Cetak / Simpan PDF
        </button>
      </div>
      <article
        className="trip-doc mx-auto max-w-[800px] px-4 py-5 text-[13px] leading-relaxed"
        data-testid="trip-doc"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </div>
  );
}
