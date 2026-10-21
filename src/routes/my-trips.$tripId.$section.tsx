import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BackBar, Page } from "@/components/shell";
import {
  getTrip,
  postChecklist,
  postExpense,
  postItinerary,
} from "@/lib/my-trips.server";

export const Route = createFileRoute("/my-trips/$tripId/$section")({
  loader: ({ params }) => getTrip({ data: { tripId: params.tripId } }),
  component: TripSection,
});
const labels: Record<string, string> = {
  budget: "Budget",
  expenses: "Expenses",
  itinerary: "Itinerary",
  checklist: "Checklist",
  bookings: "Bookings",
  places: "Saved Places",
  documents: "Documents",
  group: "Travel Group",
  "split-bill": "Split Bill",
  currency: "Currency",
  "ai-planner": "AI Planner",
};
function TripSection() {
  const { section, tripId } = Route.useParams();
  const data = Route.useLoaderData();
  const trip = data.trip as unknown as {
    id: string;
    name: string;
    primary_currency: string;
    total_budget_minor: number;
  };
  const title = labels[section] ?? "Perjalanan";
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submitExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      await postExpense({ data: {
        tripId, description: String(form.get("description") ?? ""), transactionDate: String(form.get("transactionDate") ?? ""),
        originalAmountMinor: Math.round(Number(form.get("amount") ?? 0) * 100), originalCurrency: trip.primary_currency,
        convertedAmountMinor: Math.round(Number(form.get("amount") ?? 0) * 100), convertedCurrency: trip.primary_currency,
      }});
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Pengeluaran belum dapat disimpan."); setSaving(false); }
  }
  async function submitItinerary(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      await postItinerary({ data: {
        tripId, activityDate: String(form.get("activityDate") ?? ""), startTime: String(form.get("startTime") ?? "") || undefined,
        title: String(form.get("title") ?? ""), location: String(form.get("location") ?? "") || undefined,
      }}); window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Agenda belum dapat disimpan."); setSaving(false); }
  }
  async function submitChecklist(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setSaving(true);
    const form = new FormData(event.currentTarget);
    try { await postChecklist({ data: { tripId, title: String(form.get("title") ?? "") }}); window.location.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Checklist belum dapat disimpan."); setSaving(false); }
  }
  return (
    <Page>
      <BackBar title={title} />
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Kelola {title.toLowerCase()} untuk {trip.name}.
      </p>
      <div className="mt-6 space-y-3">
        {section === "budget" && (
          <div className="rounded-2xl bg-surface p-4">
            <p className="text-sm text-muted-foreground">Total budget</p>
            <p className="mt-1 text-2xl font-bold">
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: String(trip.primary_currency).trim(),
                maximumFractionDigits: 0,
              }).format(Number(trip.total_budget_minor) / 100)}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Pengeluaran tercatat: {data.expenses.length} transaksi.
            </p>
          </div>
        )}
        {section === "expenses" && (
          <>
            <QuickForm onSubmit={submitExpense} saving={saving} submitLabel="Simpan pengeluaran">
              <input name="description" required placeholder="Contoh: makan malam" className="field" />
              <input name="transactionDate" required type="date" className="field" />
              <input name="amount" required min="1" step="1" type="number" placeholder={`Nominal (${trip.primary_currency})`} className="field" />
            </QuickForm>
            <List
            title="Pengeluaran"
            items={data.expenses.map(
              (item) =>
                `${item.description} · ${item.original_currency} ${Number(item.original_amount_minor) / 100}`,
            )}
            empty="Belum ada pengeluaran."
            />
          </>
        )}
        {section === "itinerary" && (
          <>
            <QuickForm onSubmit={submitItinerary} saving={saving} submitLabel="Tambah agenda">
              <input name="title" required placeholder="Judul agenda" className="field" />
              <input name="activityDate" required type="date" className="field" />
              <input name="startTime" type="time" className="field" />
              <input name="location" placeholder="Lokasi (opsional)" className="field" />
            </QuickForm>
            <List
            title="Agenda"
            items={data.itinerary.map((item) => `${item.activity_date} · ${item.title}`)}
            empty="Belum ada agenda."
            />
          </>
        )}
        {section === "checklist" && (
          <>
            <QuickForm onSubmit={submitChecklist} saving={saving} submitLabel="Tambah checklist">
              <input name="title" required placeholder="Contoh: Cetak itinerary" className="field" />
            </QuickForm>
            <List
            title="Checklist"
            items={data.checklist.map((item) => `${item.is_completed ? "✓" : "○"} ${item.title}`)}
            empty="Belum ada checklist."
            />
          </>
        )}
        {section === "bookings" && (
          <div className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">
            Booking belum memiliki form input. Tambahkan booking dari integrasi reservasi atau simpan detail manual setelah modul booking diaktifkan.
          </div>
        )}
        {false && section === "bookings" && (
          <List
            title="Bookings manual"
            items={data.bookings.map((item) => `${item.title} · ${item.status}`)}
            empty="Belum ada booking manual."
          />
        )}
        {["places", "documents", "group", "split-bill", "currency", "ai-planner"].includes(
          section,
        ) && (
          <div className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">
            Fitur ini tersedia sebagai bagian dari My Trips dan tetap menggunakan data private trip.
            Tambahkan item dari dashboard atau integrasi berikutnya.
          </div>
        )}
        {error && <p className="rounded-xl bg-brand-red-soft px-3 py-2 text-sm text-brand-red" role="alert">{error}</p>}
      </div>
      <Link
        to="/my-trips/$tripId"
        params={{ tripId }}
        className="mt-6 block text-center text-sm font-semibold text-brand-red"
      >
        Kembali ke detail perjalanan
      </Link>
    </Page>
  );
}
function List({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="space-y-2">
        {items.length ? (
          items.map((item) => (
            <div key={item} className="rounded-2xl bg-surface px-4 py-3 text-sm">
              {item}
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">{empty}</div>
        )}
      </div>
    </section>
  );
}

function QuickForm({ onSubmit, saving, submitLabel, children }: { onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; saving: boolean; submitLabel: string; children: React.ReactNode }) {
  return <form onSubmit={onSubmit} className="space-y-2 rounded-2xl bg-surface p-4 ring-1 ring-border/50">{children}<button disabled={saving} className="w-full rounded-xl bg-brand-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Menyimpan…" : submitLabel}</button></form>;
}
