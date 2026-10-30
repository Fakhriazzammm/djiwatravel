import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  BedDouble,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Coffee,
  Hotel,
  MapPin,
  Plane,
  Plus,
  Ticket,
  Utensils,
  WalletCards,
} from "lucide-react";
import { BackBar, Page, btnRed, btnSoft, group } from "@/components/shell";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { displayBudgetCategory, displayChecklistTitle } from "@/lib/my-trips-home";
import { isTripAuthenticationError, runTripMutation } from "@/lib/trip-actions";
import {
  deleteBookingRecord,
  deleteChecklist,
  deleteExpense,
  deleteItinerary,
  getTripSection,
  patchBudget,
  patchChecklist,
  postBooking,
  postChecklist,
  postExpense,
  postItinerary,
} from "@/lib/my-trips.fn";

export const Route = createFileRoute("/my-trips/$tripId/$section")({
  loader: async ({ params, location }) => {
    try {
      return await getTripSection({
        data: { tripId: params.tripId, section: params.section as FeatureId },
      });
    } catch (error) {
      if (isTripAuthenticationError(error)) {
        throw redirect({ to: "/profile", search: { returnTo: location.href } });
      }
      throw error;
    }
  },
  component: TripSection,
});
const labels: Record<string, string> = {
  budget: "Anggaran",
  expenses: "Pengeluaran",
  itinerary: "Agenda",
  checklist: "Checklist",
  bookings: "Pemesanan",
  places: "Saved Places",
  documents: "Documents",
  group: "Travel Group",
  "split-bill": "Split Bill",
  currency: "Currency",
  "ai-planner": "AI Planner",
};
type FeatureId = "budget" | "expenses" | "itinerary" | "checklist" | "bookings";
const featureTabs: Array<{ id: FeatureId; label: string }> = [
  { id: "itinerary", label: "Agenda" },
  { id: "bookings", label: "Pemesanan" },
  { id: "budget", label: "Anggaran" },
  { id: "checklist", label: "Checklist" },
  { id: "expenses", label: "Pengeluaran" },
];

export function TripFeatureNav({ tripId, active }: { tripId: string; active?: FeatureId }) {
  return (
    <nav
      aria-label="Fitur perjalanan"
      className="sticky top-0 z-20 -mx-4 mt-4 overflow-x-auto border-y border-border/60 bg-background/95 px-4 py-2 backdrop-blur-md scrollbar-none"
    >
      <div className="flex w-max gap-1.5">
        {featureTabs.map((tab) => (
          <Link
            key={tab.id}
            to="/my-trips/$tripId/$section"
            params={{ tripId, section: tab.id }}
            className={`tap flex min-h-11 items-center rounded-full px-4 text-[13px] font-semibold whitespace-nowrap transition-colors ${active === tab.id ? "bg-foreground text-background shadow-sm" : "bg-secondary text-muted-foreground"}`}
            aria-current={active === tab.id ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
type Item = {
  id: string;
  name?: unknown;
  allocated_minor?: unknown;
  spent_minor?: unknown;
  expense_count?: unknown;
  description?: unknown;
  original_currency?: unknown;
  original_amount_minor?: unknown;
  converted_currency?: unknown;
  converted_amount_minor?: unknown;
  category_id?: unknown;
  category_name?: unknown;
  activity_date?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  title?: unknown;
  location?: unknown;
  notes?: unknown;
  activity_category?: unknown;
  booking_reference?: unknown;
  is_completed?: unknown;
  status?: unknown;
};
type BudgetSummary = {
  allocatedMinor: number;
  spentMinor: number;
  uncategorizedSpentMinor: number;
  uncategorizedCount: number;
  budgetMinor: number;
};
type CategoryOption = {
  id: string;
  name: string;
  allocated_minor: number;
  currency: string;
};
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const money = (value: unknown, currency: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: currency.trim(),
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0) / 100);

function TripSection() {
  const { section, tripId } = Route.useParams();
  const data = Route.useLoaderData();
  const router = useRouter();
  const items = data.items as Item[];
  const trip = data.trip as unknown as {
    id: string;
    name: string;
    destination_name: string;
    departure_date: string | null;
    return_date: string | null;
    primary_currency: string;
    total_budget_minor: number;
  };
  const refresh = () => router.invalidate();
  const summary = data.summary as BudgetSummary | null;
  const categories = data.categories as CategoryOption[];
  return (
    <Page>
      <BackBar title={trip.destination_name || trip.name} />
      <div className="pt-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Ruang perjalanan
        </p>
        <h1 className="mt-1 text-[28px] font-bold tracking-[-0.04em]">
          {labels[section] ?? "Perjalanan"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{trip.name}</p>
      </div>
      <TripFeatureNav tripId={tripId} active={section as FeatureId} />
      <div className="mt-5 space-y-4">
        {section === "budget" && (
          <BudgetEditor
            items={items}
            currency={trip.primary_currency}
            summary={summary}
            onSaved={refresh}
          />
        )}
        {section === "expenses" && (
          <ExpenseEditor
            tripId={tripId}
            currency={trip.primary_currency}
            items={items}
            categories={categories}
            onSaved={refresh}
          />
        )}
        {section === "itinerary" && (
          <ItineraryEditor tripId={tripId} items={items} onSaved={refresh} />
        )}
        {section === "checklist" && (
          <ChecklistEditor tripId={tripId} items={items} onSaved={refresh} />
        )}
        {section === "bookings" && (
          <BookingEditor tripId={tripId} items={items} onSaved={refresh} />
        )}
        {["places", "documents", "group", "split-bill", "currency", "ai-planner"].includes(
          section,
        ) && (
          <div className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">
            Fitur ini belum memiliki editor khusus.
          </div>
        )}
      </div>
    </Page>
  );
}

function BudgetEditor({
  items,
  currency,
  summary,
  onSaved,
}: {
  items: Item[];
  currency: string;
  summary: BudgetSummary | null;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((x) => [x.id, String(Number(x.allocated_minor ?? 0) / 100)])),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const allocated =
    summary?.allocatedMinor ??
    items.reduce((sum, item) => sum + Number(item.allocated_minor ?? 0), 0);
  const spent =
    summary?.spentMinor ?? items.reduce((sum, item) => sum + Number(item.spent_minor ?? 0), 0);
  const budget = summary?.budgetMinor ?? 0;
  const target = budget > 0 ? budget : allocated;
  const remaining = target - spent;
  const percent = target > 0 ? Math.min(100, Math.round((spent / target) * 100)) : 0;
  const unallocated = Math.max(0, target - allocated);

  async function save(id: string) {
    setSaving(id);
    try {
      await runTripMutation({
        action: () =>
          patchBudget({ data: { id, allocatedMinor: Math.round(Number(values[id] || 0) * 100) } }),
        refresh: onSaved,
        successMessage: "Alokasi anggaran disimpan",
        failureMessage: "Anggaran belum tersimpan. Periksa nilainya lalu coba lagi.",
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[24px] bg-foreground p-5 text-background">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-background/65">Realisasi anggaran</p>
            <p className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">
              {money(spent, currency)}
            </p>
            <p className="mt-1 text-xs text-background/65">
              dari {target > 0 ? money(target, currency) : "anggaran yang belum diatur"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-background/15 px-2.5 py-1 text-xs font-bold tabular-nums">
            {percent}%
          </span>
        </div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-background/20"
          role="progressbar"
          aria-label="Realisasi anggaran perjalanan"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-full rounded-full bg-background transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-background/70">
          <div>
            <p>Sisa anggaran</p>
            <p className="mt-0.5 text-sm font-semibold text-background">
              {money(remaining, currency)}
            </p>
          </div>
          <div>
            <p>Dialokasikan</p>
            <p className="mt-0.5 text-sm font-semibold text-background">
              {money(allocated, currency)}
            </p>
          </div>
        </div>
      </div>

      {summary && summary.uncategorizedSpentMinor > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Pengeluaran belum berkategori</p>
          <p className="mt-0.5 text-[13px] text-amber-800">
            {money(summary.uncategorizedSpentMinor, currency)} dari {summary.uncategorizedCount}{" "}
            transaksi belum masuk kategori. Pilih kategori saat mencatat pengeluaran agar
            realisasinya terpetakan.
          </p>
        </div>
      )}

      {target > 0 && unallocated > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          {money(unallocated, currency)} dari anggaran belum dialokasikan ke kategori.
        </p>
      )}

      <section>
        <div className="mb-2 flex items-end justify-between gap-3 px-1">
          <p className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
            Anggaran per kategori
          </p>
          <span className="text-[11px] text-muted-foreground">{items.length} kategori</span>
        </div>
        <div className="space-y-2.5">
          {items.length ? (
            items.map((item) => {
              const allocation = Number(item.allocated_minor ?? 0);
              const categorySpent = Number(item.spent_minor ?? 0);
              const categoryRemaining = allocation - categorySpent;
              const categoryPercent =
                allocation > 0
                  ? Math.min(100, Math.round((categorySpent / allocation) * 100))
                  : categorySpent > 0
                    ? 100
                    : 0;
              const dirty = values[item.id] !== String(allocation / 100);
              return (
                <div
                  key={item.id}
                  className="rounded-2xl bg-surface p-4 shadow-[0_2px_12px_rgba(15,23,42,0.035)] ring-1 ring-border/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {displayBudgetCategory(String(item.name ?? "Kategori"))}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {Number(item.expense_count ?? 0)} transaksi
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        categoryRemaining < 0
                          ? "bg-brand-red-soft text-brand-red"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {categoryRemaining < 0
                        ? `Lewat ${money(Math.abs(categoryRemaining), currency)}`
                        : `Sisa ${money(categoryRemaining, currency)}`}
                    </span>
                  </div>
                  <div
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-label={`Realisasi anggaran ${displayBudgetCategory(String(item.name ?? "Kategori"))}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={categoryPercent}
                  >
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${
                        categoryRemaining < 0 ? "bg-brand-red" : "bg-foreground"
                      }`}
                      style={{ width: `${categoryPercent}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-[11px] font-medium text-muted-foreground">
                      Batas kategori
                      <input
                        aria-label={`Anggaran ${displayBudgetCategory(String(item.name ?? "Kategori"))}`}
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={values[item.id]}
                        onChange={(e) => setValues({ ...values, [item.id]: e.target.value })}
                        className="mt-1 min-h-11 w-full rounded-xl bg-secondary px-3 text-right text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-brand-red/25"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void save(item.id)}
                      disabled={saving === item.id || !dirty}
                      className="tap min-h-11 shrink-0 rounded-xl px-3 text-xs font-bold text-brand-red disabled:text-muted-foreground/50"
                    >
                      {saving === item.id ? "Menyimpan…" : dirty ? "Simpan" : "Tersimpan"}
                    </button>
                  </div>
                  <p className="mt-1 text-right text-[11px] text-muted-foreground">
                    Terpakai {money(categorySpent, currency)}
                  </p>
                </div>
              );
            })
          ) : (
            <p className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">
              Belum ada kategori budget.
            </p>
          )}
        </div>
      </section>
    </section>
  );
}

function ExpenseEditor({
  tripId,
  currency,
  items,
  categories,
  onSaved,
}: {
  tripId: string;
  currency: string;
  items: Item[];
  categories: CategoryOption[];
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    description: "",
    date: today(),
    amount: "",
    categoryId: "",
  });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const totalInTripCurrency = items.reduce((sum, item) => {
    const convertedCurrency = String(item.converted_currency ?? "").trim();
    const originalCurrency = String(item.original_currency ?? "").trim();
    if (convertedCurrency === currency) return sum + Number(item.converted_amount_minor ?? 0);
    if (originalCurrency === currency) return sum + Number(item.original_amount_minor ?? 0);
    return sum + Number(item.converted_amount_minor ?? item.original_amount_minor ?? 0);
  }, 0);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const amount = Math.round(Number(form.amount) * 100);
      const saved = await runTripMutation({
        action: () =>
          postExpense({
            data: {
              tripId,
              description: form.description,
              transactionDate: form.date,
              originalAmountMinor: amount,
              originalCurrency: currency,
              convertedAmountMinor: amount,
              convertedCurrency: currency,
              exchangeRateStatus: "manual",
              categoryId: form.categoryId || undefined,
            },
          }),
        refresh: onSaved,
        successMessage: "Pengeluaran disimpan",
        failureMessage: "Pengeluaran belum tersimpan. Periksa data lalu coba lagi.",
      });
      if (saved) {
        setForm({ description: "", date: today(), amount: "", categoryId: "" });
        setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  }
  return (
    <section>
      <div className="mb-4 rounded-[22px] bg-surface p-4 ring-1 ring-border/50">
        <p className="text-xs font-medium text-muted-foreground">Pengeluaran tercatat</p>
        <p className="mt-1 text-2xl font-bold">{money(totalInTripCurrency, currency)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{items.length} transaksi</p>
      </div>
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className={`${btnRed} min-h-12 w-full rounded-2xl`}
      >
        Tambah pengeluaran
      </button>
      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-7"
        >
          <div
            className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25"
            aria-hidden="true"
          />
          <SheetHeader className="mb-5 text-left">
            <SheetTitle>Catat pengeluaran</SheetTitle>
            <SheetDescription>Tambahkan transaksi ke anggaran perjalananmu.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submit} className="space-y-3">
            <input
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Contoh: Tiket kereta"
              className="min-h-12 w-full rounded-2xl bg-secondary px-4 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand-red/25"
            />
            <div className="flex gap-2">
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="min-h-12 min-w-0 flex-1 rounded-2xl bg-secondary px-4 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
              />
              <input
                required
                min="1"
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="Nominal"
                className="min-h-12 w-32 rounded-2xl bg-secondary px-4 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand-red/25"
              />
            </div>
            <label className="block space-y-1.5 text-[13px] font-semibold">
              Kategori anggaran
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="min-h-12 w-full rounded-2xl bg-secondary px-4 text-[15px] font-normal outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
              >
                <option value="">Tanpa kategori</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {displayBudgetCategory(category.name)}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={saving} className={`${btnRed} min-h-12 rounded-2xl`}>
              {saving ? "Menyimpan…" : "Tambah pengeluaran"}
            </button>
          </form>
        </SheetContent>
      </Sheet>
      <EditableList
        items={items}
        empty="Belum ada pengeluaran."
        render={(x) => {
          const categoryId = String(x.category_id ?? "");
          const categoryName =
            String(x.category_name ?? "") ||
            (categoryId ? (categoryNames.get(categoryId) ?? "") : "");
          return `${String(x.description ?? "")} · ${money(
            x.original_amount_minor,
            String(x.original_currency ?? currency),
          )}${categoryName ? ` · ${displayBudgetCategory(categoryName)}` : ""}`;
        }}
        onDelete={async (id) => {
          await runTripMutation({
            action: () => deleteExpense({ data: { id } }),
            refresh: onSaved,
            successMessage: "Pengeluaran dihapus",
            failureMessage: "Pengeluaran belum terhapus. Coba lagi.",
          });
        }}
      />
    </section>
  );
}

export function ItineraryEditor({
  tripId,
  items,
  onSaved,
}: {
  tripId: string;
  items: Item[];
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    title: "",
    date: today(),
    startTime: "",
    endTime: "",
    location: "",
    category: "",
  });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await runTripMutation({
        action: () =>
          postItinerary({
            data: {
              tripId,
              title: form.title,
              activityDate: form.date,
              startTime: form.startTime || undefined,
              endTime: form.endTime || undefined,
              location: form.location || undefined,
              activityCategory: form.category || undefined,
            },
          }),
        refresh: onSaved,
        successMessage: "Aktivitas disimpan",
        failureMessage: "Aktivitas belum tersimpan. Periksa tanggal dan waktu lalu coba lagi.",
      });
      if (saved) {
        setForm({
          title: "",
          date: form.date,
          startTime: "",
          endTime: "",
          location: "",
          category: "",
        });
        setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  }

  const days = groupItineraryByDay(items);
  return (
    <section className="space-y-4" aria-label="Agenda perjalanan">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="tap flex min-h-10 items-center gap-2 rounded-full bg-brand-red px-4 text-sm font-semibold text-white"
          aria-expanded={showForm}
        >
          <Plus className="size-4" /> Tambah aktivitas
        </button>
      </div>
      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border-border/70 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-7 sm:rounded-t-[28px]"
        >
          <div
            className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25"
            aria-hidden="true"
          />
          <SheetHeader className="mb-5 pr-8 text-left">
            <SheetTitle className="text-[22px] tracking-tight">Tambah aktivitas</SheetTitle>
            <SheetDescription>
              Susun rencana perjalananmu. Semua waktu mengikuti zona lokal.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="agenda-title" className="text-[13px] font-semibold">
                Nama aktivitas
              </label>
              <input
                id="agenda-title"
                required
                autoFocus
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Contoh: Makan malam"
                className="min-h-12 w-full rounded-xl border border-border/70 bg-secondary/70 px-3.5 text-[15px] outline-none transition focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="agenda-date" className="text-[13px] font-semibold">
                  Tanggal
                </label>
                <input
                  id="agenda-date"
                  required
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                  className="min-h-12 w-full min-w-0 rounded-xl border border-border/70 bg-secondary/70 px-3 text-sm outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="agenda-location" className="text-[13px] font-semibold">
                  Lokasi <span className="font-normal text-muted-foreground">(opsional)</span>
                </label>
                <input
                  id="agenda-location"
                  value={form.location}
                  onChange={(event) => setForm({ ...form, location: event.target.value })}
                  placeholder="Tambahkan lokasi"
                  className="min-h-12 w-full min-w-0 rounded-xl border border-border/70 bg-secondary/70 px-3 text-sm outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
                />
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold">
                Waktu <span className="font-normal text-muted-foreground">(opsional)</span>
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                Jika selesai lebih awal dari mulai, aktivitas dianggap berlanjut sampai hari
                berikutnya.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 text-xs text-muted-foreground">
                  Mulai
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                    className="min-h-12 w-full rounded-xl border border-border/70 bg-secondary/70 px-3 text-sm text-foreground outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
                  />
                </label>
                <label className="space-y-1.5 text-xs text-muted-foreground">
                  Selesai
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                    className="min-h-12 w-full rounded-xl border border-border/70 bg-secondary/70 px-3 text-sm text-foreground outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
                  />
                </label>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="agenda-category" className="text-[13px] font-semibold">
                Kategori <span className="font-normal text-muted-foreground">(opsional)</span>
              </label>
              <select
                id="agenda-category"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                className="min-h-12 w-full rounded-xl border border-border/70 bg-secondary/70 px-3 text-sm outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
              >
                <option value="">Pilih kategori</option>
                <option value="flight">Penerbangan</option>
                <option value="hotel">Hotel</option>
                <option value="food">Makan</option>
                <option value="attraction">Atraksi</option>
                <option value="transport">Transportasi</option>
                <option value="other">Lainnya</option>
              </select>
            </div>
            <div className="sticky bottom-0 -mx-5 flex gap-3 border-t border-border/60 bg-background/95 px-5 pb-1 pt-4 backdrop-blur">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className={`${btnSoft} min-h-12 flex-1 rounded-full`}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`${btnRed} min-h-12 flex-[1.4] rounded-full disabled:opacity-60`}
              >
                {saving ? "Menyimpan…" : "Simpan aktivitas"}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      {days.length ? (
        days.map((day) => (
          <ItineraryDay
            key={day.date}
            date={day.date}
            items={day.items}
            onDelete={async (id) => {
              await runTripMutation({
                action: () => deleteItinerary({ data: { id } }),
                refresh: onSaved,
                successMessage: "Aktivitas dihapus",
                failureMessage: "Aktivitas belum terhapus. Coba lagi.",
              });
            }}
          />
        ))
      ) : (
        <div className="rounded-2xl bg-secondary p-6 text-center">
          <CalendarDays className="mx-auto size-9 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-semibold">Belum ada aktivitas</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Rencana perjalananmu akan tersusun di sini.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="tap mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-background px-4 text-sm font-semibold text-brand-red"
          >
            <Plus className="size-4" /> Tambah aktivitas
          </button>
        </div>
      )}
    </section>
  );
}

function groupItineraryByDay(items: Item[]) {
  const groups = new Map<string, Item[]>();
  [...items]
    .sort((a, b) =>
      `${itineraryDateKey(a.activity_date)}T${String(a.start_time ?? "99:99")}`.localeCompare(
        `${itineraryDateKey(b.activity_date)}T${String(b.start_time ?? "99:99")}`,
      ),
    )
    .forEach((item) => {
      const date = itineraryDateKey(item.activity_date);
      groups.set(date, [...(groups.get(date) ?? []), item]);
    });
  return [...groups.entries()].map(([date, groupedItems]) => ({ date, items: groupedItems }));
}

function itineraryDateKey(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const raw = String(value ?? "").trim();
  const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly) return dateOnly[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function formatItineraryDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { weekday: "", full: "Tanggal belum diatur" };
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return {
    weekday: new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(date),
    full: new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date),
  };
}

function ItineraryDay({
  date,
  items,
  onDelete,
}: {
  date: string;
  items: Item[];
  onDelete: (id: string) => Promise<void>;
}) {
  const dateLabel = formatItineraryDate(date);
  return (
    <section className="rounded-[20px] bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold capitalize tracking-tight">
          {dateLabel.weekday ? `${dateLabel.weekday}, ` : ""}
          {dateLabel.full}
        </h3>
        <span className="shrink-0 text-xs text-muted-foreground">{items.length} aktivitas</span>
      </div>
      <div className="mt-2 divide-y divide-border/60">
        {items.map((item) => (
          <ItineraryItem key={item.id} item={item} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

function ItineraryItem({
  item,
  onDelete,
}: {
  item: Item;
  onDelete: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const time = String(item.start_time ?? "").slice(0, 5);
  const endTime = String(item.end_time ?? "").slice(0, 5);
  const Icon = itineraryIcon(item.activity_category, item.title);
  async function remove() {
    setDeleting(true);
    try {
      await onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  }
  return (
    <article className="flex items-start gap-3 py-3 first:pt-1 last:pb-1">
      <div className="w-11 shrink-0 pt-0.5 text-right text-xs font-medium tabular-nums text-muted-foreground">
        {time || "—"}
      </div>
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="size-3.5" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold leading-snug">
              {String(item.title ?? "Aktivitas")}
            </h4>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {item.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {String(item.location)}
                </span>
              ) : (
                <span>Lokasi belum diatur</span>
              )}
              {endTime && time && (
                <span>
                  {time}–{endTime}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={deleting}
            className="tap shrink-0 rounded-lg px-1.5 py-1 text-xs font-semibold text-muted-foreground hover:text-brand-red"
            aria-label={`Hapus ${String(item.title ?? "aktivitas")}`}
          >
            {deleting ? "…" : "Hapus"}
          </button>
        </div>
        {item.booking_reference ? (
          <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
            Booking tersimpan
          </span>
        ) : (
          <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
            Perlu booking
          </span>
        )}
      </div>
    </article>
  );
}

function itineraryIcon(category: unknown, title: unknown) {
  const value = `${String(category ?? "")} ${String(title ?? "")}`.toLowerCase();
  if (
    value.includes("flight") ||
    value.includes("airport") ||
    value.includes("bandara") ||
    value.includes("penerbangan")
  )
    return Plane;
  if (
    value.includes("hotel") ||
    value.includes("check-in") ||
    value.includes("check in") ||
    value.includes("accommodation")
  )
    return BedDouble;
  if (
    value.includes("food") ||
    value.includes("dinner") ||
    value.includes("makan") ||
    value.includes("lunch")
  )
    return Utensils;
  if (value.includes("ticket") || value.includes("attraction") || value.includes("atraksi"))
    return Ticket;
  if (value.includes("coffee") || value.includes("cafe")) return Coffee;
  return MapPin;
}

function ChecklistEditor({
  tripId,
  items,
  onSaved,
}: {
  tripId: string;
  items: Item[];
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const done = items.filter((item) => Boolean(item.is_completed)).length;
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await runTripMutation({
        action: () => postChecklist({ data: { tripId, title } }),
        refresh: onSaved,
        successMessage: "Checklist ditambahkan",
        failureMessage: "Checklist belum tersimpan. Coba lagi.",
      });
      if (saved) {
        setTitle("");
        setShowAdd(false);
      }
    } finally {
      setSaving(false);
    }
  }
  async function updateItem(id: string, action: () => Promise<unknown>, message: string) {
    setBusyItemId(id);
    try {
      await runTripMutation({
        action,
        refresh: onSaved,
        successMessage: message,
        failureMessage: "Checklist belum diperbarui. Coba lagi.",
      });
    } finally {
      setBusyItemId(null);
    }
  }
  return (
    <section>
      <div className="mb-4 rounded-[22px] bg-surface p-4 ring-1 ring-border/50">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Persiapan</span>
          <span className="text-muted-foreground">
            {done}/{items.length}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-brand-red transition-[width]"
            style={{ width: `${items.length ? Math.round((done / items.length) * 100) : 0}%` }}
          />
        </div>
      </div>
      <div className={`${group} divide-y divide-border/60`}>
        {items.length ? (
          items.map((x) => (
            <div key={x.id} className="flex min-h-[60px] items-center gap-3 px-4 py-2">
              <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(x.is_completed)}
                  disabled={busyItemId === x.id}
                  onChange={(e) =>
                    void updateItem(
                      x.id,
                      () => patchChecklist({ data: { id: x.id, completed: e.target.checked } }),
                      e.target.checked ? "Checklist ditandai selesai" : "Checklist diperbarui",
                    )
                  }
                  className="size-5 accent-brand-red"
                />
                <span className={x.is_completed ? "line-through text-muted-foreground" : ""}>
                  {displayChecklistTitle(String(x.title ?? ""))}
                </span>
              </label>
              <button
                type="button"
                disabled={busyItemId === x.id}
                onClick={() =>
                  void updateItem(
                    x.id,
                    () => deleteChecklist({ data: { id: x.id } }),
                    "Checklist dihapus",
                  )
                }
                className="min-h-11 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-brand-red disabled:opacity-50"
              >
                {busyItemId === x.id ? "…" : "Hapus"}
              </button>
            </div>
          ))
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Belum ada checklist.</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setShowAdd(true)}
        className={`${btnRed} mt-3 min-h-12 w-full rounded-2xl`}
      >
        Tambah checklist
      </button>
      <Sheet open={showAdd} onOpenChange={setShowAdd}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[88dvh] w-full max-w-lg rounded-t-[28px] px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-7"
        >
          <div
            className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25"
            aria-hidden="true"
          />
          <SheetHeader className="mb-5 text-left">
            <SheetTitle>Tambah checklist</SheetTitle>
            <SheetDescription>
              Tambahkan hal yang perlu disiapkan untuk perjalanan.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={add} className="flex gap-2">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tambah checklist"
              className="min-h-12 min-w-0 flex-1 rounded-xl bg-secondary px-3 text-sm"
            />
            <button disabled={saving} className={btnSoft}>
              {saving ? "Menyimpan…" : "Tambah"}
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </section>
  );
}

function BookingEditor({
  tripId,
  items,
  onSaved,
}: {
  tripId: string;
  items: Item[];
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({ category: "Lainnya", title: "", date: "", provider: "" });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await runTripMutation({
        action: () =>
          postBooking({
            data: {
              tripId,
              category: form.category,
              title: form.title,
              bookingDate: form.date || undefined,
              provider: form.provider || undefined,
            },
          }),
        refresh: onSaved,
        successMessage: "Pemesanan disimpan",
        failureMessage: "Pemesanan belum tersimpan. Periksa data lalu coba lagi.",
      });
      if (saved) {
        setForm({ category: "Lainnya", title: "", date: "", provider: "" });
        setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  }
  return (
    <section>
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className={`${btnRed} mb-4 min-h-12 w-full rounded-2xl`}
      >
        Tambah pemesanan
      </button>
      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-7"
        >
          <div
            className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25"
            aria-hidden="true"
          />
          <SheetHeader className="mb-5 text-left">
            <SheetTitle>Tambah pemesanan</SheetTitle>
            <SheetDescription>
              Simpan detail tiket, hotel, transportasi, atau aktivitas.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="flex gap-2">
              <input
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Kategori"
                className="min-h-12 w-1/3 rounded-2xl bg-secondary px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
              />
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Nama booking"
                className="min-h-12 min-w-0 flex-1 rounded-2xl bg-secondary px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand-red/25"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="min-h-12 min-w-0 flex-1 rounded-2xl bg-secondary px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
              />
              <input
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                placeholder="Provider"
                className="min-h-12 min-w-0 flex-1 rounded-2xl bg-secondary px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand-red/25"
              />
            </div>
            <button disabled={saving} className={`${btnRed} min-h-12 rounded-2xl`}>
              {saving ? "Menyimpan…" : "Tambah booking"}
            </button>
          </form>
        </SheetContent>
      </Sheet>
      <EditableList
        items={items}
        empty="Belum ada booking."
        render={(x) => `${String(x.title ?? "")} · ${String(x.status ?? "manual")}`}
        onDelete={async (id) => {
          await runTripMutation({
            action: () => deleteBookingRecord({ data: { id } }),
            refresh: onSaved,
            successMessage: "Pemesanan dihapus",
            failureMessage: "Pemesanan belum terhapus. Coba lagi.",
          });
        }}
      />
    </section>
  );
}

function EditableList({
  items,
  empty,
  render,
  onDelete,
}: {
  items: Item[];
  empty: string;
  render: (x: Item) => string;
  onDelete: (id: string) => Promise<void>;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  async function remove(id: string) {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }
  return (
    <div className="mt-4 space-y-2">
      {items.length ? (
        items.map((x) => (
          <div
            key={x.id}
            className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-sm"
          >
            <span className="min-w-0 flex-1">{render(x)}</span>
            <button
              type="button"
              disabled={deletingId === x.id}
              onClick={() => void remove(x.id)}
              className="text-xs font-semibold text-brand-red disabled:opacity-50"
            >
              {deletingId === x.id ? "…" : "Hapus"}
            </button>
          </div>
        ))
      ) : (
        <div className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">{empty}</div>
      )}
    </div>
  );
}

const workspaceGroups = [
  {
    title: "Rencana",
    items: [
      { id: "itinerary", title: "Agenda", icon: CalendarDays },
      { id: "bookings", title: "Pemesanan", icon: Hotel },
    ],
  },
  {
    title: "Persiapan",
    items: [{ id: "checklist", title: "Checklist", icon: ClipboardCheck }],
  },
  {
    title: "Keuangan",
    items: [{ id: "expenses", title: "Pengeluaran", icon: WalletCards }],
  },
] as const;

export function TripWorkspace({
  tripId,
  expenses,
  itinerary,
  checklist,
  bookings,
}: {
  tripId: string;
  expenses: unknown[];
  itinerary: unknown[];
  checklist: unknown[];
  bookings: unknown[];
}) {
  const completed = (checklist as Item[]).filter((item) => Boolean(item.is_completed)).length;
  const summary = {
    expenses: expenses.length ? `${expenses.length} catatan` : "Catat pengeluaran",
    itinerary: itinerary.length ? `${itinerary.length} agenda` : "Tambah agenda",
    checklist: checklist.length
      ? `${completed} dari ${checklist.length} selesai`
      : "Tambah checklist",
    bookings: bookings.length ? `${bookings.length} pemesanan` : "Tambah pemesanan",
  };

  return (
    <div className="mt-7 space-y-6" aria-label="Kelola perjalanan">
      {workspaceGroups.map((group) => (
        <section key={group.title} aria-labelledby={`workspace-${group.title}`}>
          <h2
            id={`workspace-${group.title}`}
            className="px-3 text-[13px] font-semibold text-muted-foreground"
          >
            {group.title}
          </h2>
          <div className="mt-3 overflow-hidden rounded-[22px] bg-surface shadow-[0_4px_18px_rgba(15,23,42,0.04)] ring-1 ring-border/50">
            {group.items.map(({ id, title, icon: Icon }) => (
              <Link
                key={id}
                to="/my-trips/$tripId/$section"
                params={{ tripId, section: id }}
                className="tap flex min-h-[68px] items-center gap-3 border-b border-border/55 px-4 py-3 transition-colors last:border-b-0 active:bg-secondary/60"
              >
                <Icon className="size-5 shrink-0 text-foreground/65" strokeWidth={1.8} />
                <span className="min-w-0 flex-1 text-[15px] font-medium">{title}</span>
                <span className="max-w-[46%] truncate rounded-full bg-secondary px-2.5 py-1 text-right text-[11px] font-medium text-muted-foreground">
                  {summary[id]}
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground/55"
                  strokeWidth={2}
                />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
