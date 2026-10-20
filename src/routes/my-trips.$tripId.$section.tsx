import { createFileRoute, Link } from "@tanstack/react-router";
import { BackBar, Page } from "@/components/shell";
import { getTrip } from "@/lib/my-trips.server";

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
          <List
            title="Pengeluaran"
            items={data.expenses.map(
              (item) =>
                `${item.description} · ${item.original_currency} ${Number(item.original_amount_minor) / 100}`,
            )}
            empty="Belum ada pengeluaran."
          />
        )}
        {section === "itinerary" && (
          <List
            title="Agenda"
            items={data.itinerary.map((item) => `${item.activity_date} · ${item.title}`)}
            empty="Belum ada agenda."
          />
        )}
        {section === "checklist" && (
          <List
            title="Checklist"
            items={data.checklist.map((item) => `${item.is_completed ? "✓" : "○"} ${item.title}`)}
            empty="Belum ada checklist."
          />
        )}
        {section === "bookings" && (
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
