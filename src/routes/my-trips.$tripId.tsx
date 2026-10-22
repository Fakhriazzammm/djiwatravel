import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, MapPin, Pencil, Plane } from "lucide-react";
import { BackBar, Page, btnRed, btnSoft } from "@/components/shell";
import { getTrip, patchTrip } from "@/lib/my-trips.server";
import { TripFeatureNav, TripWorkspace } from "./my-trips.$tripId.$section";

export const Route = createFileRoute("/my-trips/$tripId")({ loader: ({ params }) => getTrip({ data: { tripId: params.tripId } }), component: TripDetail });
const dateLabel = (value?: string | null) => {
  if (!value) return "Belum diatur";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Belum diatur" : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date);
};
const money = (minor: number, currency: string) => new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);

function TripDetail() {
  const data = Route.useLoaderData();
  const showingSection = useRouterState({ select: (state) => state.matches.some((match) => match.routeId === "/my-trips/$tripId/$section") });
  if (showingSection) return <Outlet />;
  const trip = data.trip as unknown as { id: string; name: string; destination_name: string; destination_code: string; departure_date?: string | null; return_date?: string | null; travelers_count: number; primary_currency: string; total_budget_minor: number; timezone?: string; status: string };
  const remaining = Number(data.totals.remainingMinor ?? 0);
  const budget = Number(trip.total_budget_minor ?? 0);
  const spent = Number(data.totals.spentMinor ?? 0);
  const budgetPercent = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const checklistDone = (data.checklist as Array<{ is_completed?: unknown }>).filter((item) => Boolean(item.is_completed)).length;
  const checklistTotal = data.checklist.length;
  return <Page>
    <BackBar title="Detail Perjalanan" />
    <TripHeaderEditor trip={trip} onSaved={() => window.location.reload()} />
    <section className="mt-4 rounded-2xl bg-surface p-3.5 shadow-[0_5px_18px_rgba(15,23,42,0.045)] ring-1 ring-black/[0.035]">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Ringkasan dana</p><p className="mt-0.5 text-xl font-bold tracking-tight">{money(remaining, String(trip.primary_currency).trim())}</p><p className="mt-1 text-xs text-muted-foreground">tersisa dari total budget</p></div><span className="flex size-12 items-center justify-center rounded-2xl bg-brand-red-soft text-brand-red"><Plane className="size-5" strokeWidth={1.9} /></span></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-brand-red transition-[width] duration-500" style={{ width: `${budgetPercent}%` }} /></div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{money(spent, String(trip.primary_currency).trim())} terpakai</span><span>{budgetPercent}% digunakan</span></div>
    </section>
    <section className="mt-3 grid grid-cols-2 gap-3"><Metric label="Checklist" value={checklistTotal ? `${checklistDone}/${checklistTotal} selesai` : "Belum ada"} /><Metric label="Agenda" value={data.itinerary.length ? `${data.itinerary.length} agenda` : "Belum ada"} /></section>
    <TripFeatureNav tripId={trip.id} />
    <div className="mt-5 flex items-end justify-between gap-3 px-1"><div><h2 className="text-lg font-bold tracking-tight">Ringkasan perjalanan</h2><p className="mt-1 text-sm text-muted-foreground">Pilih fitur untuk mengelola perjalanan.</p></div><span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">Overview</span></div>
    <TripWorkspace tripId={trip.id} currency={String(trip.primary_currency).trim()} budget={data.budget} expenses={data.expenses} itinerary={data.itinerary} checklist={data.checklist} bookings={data.bookings} />
  </Page>;
}
function TripHeaderEditor({ trip, onSaved }: { trip: { id: string; name: string; destination_name: string; destination_code: string; departure_date?: string | null; return_date?: string | null; travelers_count: number; primary_currency: string; total_budget_minor: number; timezone?: string; status: string }; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: trip.name, destinationName: trip.destination_name, departureDate: trip.departure_date ?? "", returnDate: trip.return_date ?? "", travelersCount: trip.travelers_count, totalBudgetMinor: trip.total_budget_minor, timezone: trip.timezone ?? "", destinationCode: trip.destination_code, primaryCurrency: trip.primary_currency.trim() as "IDR" | "JPY" | "USD" | "SGD" | "KRW" });
  async function save(event: React.FormEvent) { event.preventDefault(); setSaving(true); try { await patchTrip({ data: { tripId: trip.id, ...form } }); setEditing(false); onSaved(); } finally { setSaving(false); } }
  if (!editing) return <header className="rounded-2xl bg-surface p-3.5 shadow-[0_5px_18px_rgba(15,23,42,0.045)] ring-1 ring-black/[0.035]"><div className="flex items-start gap-3"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-red-soft text-brand-red"><MapPin className="size-5" strokeWidth={1.9} /></span><div className="min-w-0 flex-1"><h1 className="text-lg font-bold tracking-tight">{trip.name}</h1><p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-3.5" />{trip.destination_name}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{trip.departure_date ? `${dateLabel(trip.departure_date)} — ${trip.return_date ? dateLabel(trip.return_date) : "Belum diatur"}` : "Jadwal belum diatur"}</p></div><button type="button" onClick={() => setEditing(true)} className="tap flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2.5 text-sm font-semibold text-brand-red" aria-label="Edit perjalanan"><Pencil className="size-4" />Edit</button></div></header>;
  const field = (key: "name" | "destinationName" | "departureDate" | "returnDate", placeholder: string, type = "text") => <input required type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} className="min-w-0 flex-1 rounded-xl bg-secondary px-3 py-2 text-sm" />;
  return <form onSubmit={save} className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border/50"><div className="grid gap-2 sm:grid-cols-2">{field("name", "Nama perjalanan")}{field("destinationName", "Destinasi")}{field("departureDate", "Berangkat", "date")}{field("returnDate", "Pulang", "date")}<input type="number" min="1" max="50" value={form.travelersCount} onChange={(e) => setForm({ ...form, travelersCount: Number(e.target.value) })} placeholder="Jumlah traveler" className="rounded-xl bg-secondary px-3 py-2 text-sm" /><input type="number" min="0" value={form.totalBudgetMinor / 100} onChange={(e) => setForm({ ...form, totalBudgetMinor: Math.round(Number(e.target.value || 0) * 100) })} placeholder="Total budget" className="rounded-xl bg-secondary px-3 py-2 text-sm" /></div><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className={btnSoft}>Batal</button><button disabled={saving} className={btnRed}>{saving ? "Menyimpan…" : "Simpan perjalanan"}</button></div></form>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-surface p-3 ring-1 ring-border/50"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 truncate text-sm font-bold">{value}</p></div>; }
