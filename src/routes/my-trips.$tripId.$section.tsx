import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
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
  X,
} from "lucide-react";
import { BackBar, Page, btnRed, btnSoft, group, label, row } from "@/components/shell";
import { TripProgress } from "@/components/trip-progress";
import { displayBudgetCategory, displayChecklistTitle, getTripProgress } from "@/lib/my-trips-home";
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
} from "@/lib/my-trips.server";

export const Route = createFileRoute("/my-trips/$tripId/$section")({
  loader: ({ params }) =>
    getTripSection({
      data: { tripId: params.tripId, section: params.section as FeatureId },
    }),
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
      className="mt-4 -mx-4 overflow-x-auto border-y border-border/60 bg-background/90 px-4 py-2.5 backdrop-blur-sm scrollbar-none"
    >
      <div className="flex w-max gap-1 rounded-xl bg-secondary/80 p-1">
        {featureTabs.map((tab) => (
          <Link
            key={tab.id}
            to="/my-trips/$tripId/$section"
            params={{ tripId, section: tab.id }}
            className={`tap flex min-h-9 items-center rounded-full px-3 text-[13px] font-semibold whitespace-nowrap transition-colors ${active === tab.id ? "bg-surface text-foreground" : "text-muted-foreground"}`}
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
  description?: unknown;
  original_currency?: unknown;
  original_amount_minor?: unknown;
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
    itinerary_count: number;
    checklist_total: number;
    checklist_done: number;
    booking_count: number;
    expense_count: number;
  };
  const refresh = () => {
    void router.invalidate();
    toast.success("Progres perjalanan diperbarui");
  };
  const progress = getTripProgress(trip);
  return (
    <Page>
      <BackBar title={trip.name} />
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold tracking-[-0.035em]">
          {labels[section] ?? "Perjalanan"}
        </h1>
      </div>
      <TripFeatureNav tripId={tripId} active={section as FeatureId} />
      <div className="mt-4">
        <TripProgress {...progress} tripId={tripId} />
      </div>
      <div className="mt-5 space-y-4">
        {section === "budget" && (
          <BudgetEditor items={items} currency={trip.primary_currency} onSaved={refresh} />
        )}
        {section === "expenses" && (
          <ExpenseEditor
            tripId={tripId}
            currency={trip.primary_currency}
            items={items}
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
  onSaved,
}: {
  items: Item[];
  currency: string;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((x) => [x.id, String(Number(x.allocated_minor ?? 0) / 100)])),
  );
  const [saving, setSaving] = useState<string | null>(null);
  async function save(id: string) {
    setSaving(id);
    try {
      await patchBudget({
        data: { id, allocatedMinor: Math.round(Number(values[id] || 0) * 100) },
      });
      onSaved();
    } finally {
      setSaving(null);
    }
  }
  return (
    <section>
      <p className={label}>Alokasi budget</p>
      <div className={group}>
        <div className={row}>
          <span className="text-sm text-muted-foreground">Total kategori</span>
          <strong>
            {money(
              items.reduce((s, x) => s + Number(x.allocated_minor ?? 0), 0),
              currency,
            )}
          </strong>
        </div>
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className={row}>
              <span className="min-w-0 flex-1 text-sm font-medium">
                {displayBudgetCategory(String(item.name ?? "Kategori"))}
              </span>
              <input
                type="number"
                min="0"
                value={values[item.id]}
                onChange={(e) => setValues({ ...values, [item.id]: e.target.value })}
                className="w-28 rounded-lg bg-secondary px-2 py-1 text-right text-sm"
              />
              <button
                type="button"
                onClick={() => void save(item.id)}
                className="text-xs font-semibold text-brand-red"
              >
                {saving === item.id ? "…" : "Simpan"}
              </button>
            </div>
          ))
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Belum ada kategori budget.</p>
        )}
      </div>
    </section>
  );
}

function ExpenseEditor({
  tripId,
  currency,
  items,
  onSaved,
}: {
  tripId: string;
  currency: string;
  items: Item[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ description: "", date: today(), amount: "" });
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const amount = Math.round(Number(form.amount) * 100);
      await postExpense({
        data: {
          tripId,
          description: form.description,
          transactionDate: form.date,
          originalAmountMinor: amount,
          originalCurrency: currency,
          convertedAmountMinor: amount,
          convertedCurrency: currency,
          exchangeRateStatus: "manual",
        },
      });
      setForm({ description: "", date: today(), amount: "" });
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <section>
      <p className={label}>Tambah pengeluaran</p>
      <form onSubmit={submit} className={`${group} space-y-2 p-3`}>
        <input
          required
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Contoh: Tiket kereta"
          className="w-full rounded-xl bg-secondary px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            required
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="min-w-0 flex-1 rounded-xl bg-secondary px-3 py-2 text-sm"
          />
          <input
            required
            min="1"
            type="number"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="Nominal"
            className="w-32 rounded-xl bg-secondary px-3 py-2 text-sm"
          />
        </div>
        <button disabled={saving} className={btnRed}>
          {saving ? "Menyimpan…" : "Tambah pengeluaran"}
        </button>
      </form>
      <EditableList
        items={items}
        empty="Belum ada pengeluaran."
        render={(x) =>
          `${String(x.description ?? "")} · ${money(x.original_amount_minor, String(x.original_currency ?? currency))}`
        }
        onDelete={async (id) => {
          await deleteExpense({ data: { id } });
          onSaved();
        }}
      />
    </section>
  );
}

function ItineraryEditor({
  tripId,
  items,
  onSaved,
}: {
  tripId: string;
  items: Item[];
  onSaved: () => void;
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
  const [showForm, setShowForm] = useState(items.length === 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await postItinerary({
        data: {
          tripId,
          title: form.title,
          activityDate: form.date,
          startTime: form.startTime || undefined,
          endTime: form.endTime || undefined,
          location: form.location || undefined,
          activityCategory: form.category || undefined,
        },
      });
      setForm({
        title: "",
        date: form.date,
        startTime: "",
        endTime: "",
        location: "",
        category: "",
      });
      setShowForm(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const days = groupItineraryByDay(items);
  return (
    <section className="space-y-4" aria-label="Agenda perjalanan">
      <div className="flex items-center justify-end">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="tap flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-brand-red px-3 text-sm font-semibold text-white"
            aria-expanded={showForm}
          >
            {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
            {showForm ? "Tutup" : "Tambah"}
          </button>
        </div>
      </div>
      {showForm && (
        <form
          onSubmit={submit}
          className="rounded-2xl bg-surface p-4"
        >
          <div className="flex items-center justify-between">
            <p className={label}>Tambah aktivitas</p>
            <span className="text-[11px] text-muted-foreground">Semua waktu lokal perjalanan</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              required
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Contoh: Makan malam di Ximending"
              className="rounded-xl bg-secondary px-3 py-2.5 text-sm sm:col-span-2"
            />
            <input
              required
              type="date"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
              className="rounded-xl bg-secondary px-3 py-2.5 text-sm"
            />
            <input
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
              placeholder="Lokasi"
              className="rounded-xl bg-secondary px-3 py-2.5 text-sm"
            />
            <input
              type="time"
              value={form.startTime}
              onChange={(event) => setForm({ ...form, startTime: event.target.value })}
              aria-label="Waktu mulai"
              className="rounded-xl bg-secondary px-3 py-2.5 text-sm"
            />
            <input
              type="time"
              value={form.endTime}
              onChange={(event) => setForm({ ...form, endTime: event.target.value })}
              aria-label="Waktu selesai"
              className="rounded-xl bg-secondary px-3 py-2.5 text-sm"
            />
            <select
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              aria-label="Kategori aktivitas"
              className="rounded-xl bg-secondary px-3 py-2.5 text-sm sm:col-span-2"
            >
              <option value="">Kategori aktivitas (opsional)</option>
              <option value="flight">Penerbangan</option>
              <option value="hotel">Hotel</option>
              <option value="food">Makan</option>
              <option value="attraction">Atraksi</option>
              <option value="transport">Transportasi</option>
              <option value="other">Lainnya</option>
            </select>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className={btnSoft}>
              Batal
            </button>
            <button disabled={saving} className={btnRed}>
              {saving ? "Menyimpan…" : "Simpan aktivitas"}
            </button>
          </div>
        </form>
      )}
      {days.length ? (
        days.map((day) => (
          <ItineraryDay
            key={day.date}
            date={day.date}
            items={day.items}
            onDelete={async (id) => {
              await deleteItinerary({ data: { id } });
              onSaved();
            }}
          />
        ))
      ) : (
        <div className="rounded-2xl bg-secondary p-6 text-center">
          <CalendarDays className="mx-auto size-9 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-semibold">Belum ada aktivitas</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tambahkan agenda pertama untuk mulai menyusun perjalanan.
          </p>
        </div>
      )}
    </section>
  );
}

function groupItineraryByDay(items: Item[]) {
  const groups = new Map<string, Item[]>();
  [...items]
    .sort((a, b) =>
      `${String(a.activity_date ?? "")}T${String(a.start_time ?? "99:99")}`.localeCompare(
        `${String(b.activity_date ?? "")}T${String(b.start_time ?? "99:99")}`,
      ),
    )
    .forEach((item) => {
      const date = String(item.activity_date ?? "");
      groups.set(date, [...(groups.get(date) ?? []), item]);
    });
  return [...groups.entries()].map(([date, groupedItems]) => ({ date, items: groupedItems }));
}

function formatItineraryDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { weekday: "Tanggal", full: value };
  return {
    weekday: new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(date),
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
    <section className="rounded-2xl bg-surface p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-red">
            {dateLabel.weekday}
          </p>
          <h3 className="mt-1 text-base font-bold capitalize">{dateLabel.full}</h3>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {items.length} aktivitas
        </span>
      </div>
      <div className="relative mt-4 space-y-0 before:absolute before:bottom-4 before:left-[3.4rem] before:top-4 before:w-px before:bg-border/80">
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
    <article className="relative flex gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="w-11 shrink-0 pt-1 text-right text-xs font-bold tabular-nums text-foreground">
        {time || "—"}
      </div>
      <div className="relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-surface bg-brand-red-soft text-brand-red ring-1 ring-brand-red/15">
        <Icon className="size-3.5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-border/60 bg-background/70 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-bold leading-snug">{String(item.title ?? "Aktivitas")}</h4>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {item.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {String(item.location)}
                </span>
              ) : (
                <span>Lokasi belum diatur</span>
              )}
              {endTime && (
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
          <ChevronRight
            className="mt-1 size-4 shrink-0 text-muted-foreground/60"
            aria-hidden="true"
          />
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
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await postChecklist({ data: { tripId, title } });
      setTitle("");
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <section>
      <p className={label}>Checklist perjalanan</p>
      <div className={group}>
        {items.length ? (
          items.map((x) => (
            <div key={x.id} className={row}>
              <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(x.is_completed)}
                  onChange={(e) =>
                    void patchChecklist({ data: { id: x.id, completed: e.target.checked } }).then(
                      onSaved,
                    )
                  }
                  className="size-4 accent-brand-red"
                />
                <span className={x.is_completed ? "line-through text-muted-foreground" : ""}>
                  {displayChecklistTitle(String(x.title ?? ""))}
                </span>
              </label>
              <button
                type="button"
                onClick={() => void deleteChecklist({ data: { id: x.id } }).then(onSaved)}
                className="text-xs text-brand-red"
              >
                Hapus
              </button>
            </div>
          ))
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Belum ada checklist.</p>
        )}
      </div>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tambah checklist"
          className="min-w-0 flex-1 rounded-xl bg-secondary px-3 py-2 text-sm"
        />
        <button disabled={saving} className={btnSoft}>
          Tambah
        </button>
      </form>
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
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ category: "Lainnya", title: "", date: "", provider: "" });
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await postBooking({
        data: {
          tripId,
          category: form.category,
          title: form.title,
          bookingDate: form.date || undefined,
          provider: form.provider || undefined,
        },
      });
      setForm({ category: "Lainnya", title: "", date: "", provider: "" });
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <section>
      <p className={label}>Tambah booking</p>
      <form onSubmit={submit} className={`${group} space-y-2 p-3`}>
        <div className="flex gap-2">
          <input
            required
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="Kategori"
            className="w-1/3 rounded-xl bg-secondary px-3 py-2 text-sm"
          />
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Nama booking"
            className="min-w-0 flex-1 rounded-xl bg-secondary px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="min-w-0 flex-1 rounded-xl bg-secondary px-3 py-2 text-sm"
          />
          <input
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
            placeholder="Provider"
            className="min-w-0 flex-1 rounded-xl bg-secondary px-3 py-2 text-sm"
          />
        </div>
        <button disabled={saving} className={btnRed}>
          {saving ? "Menyimpan…" : "Tambah booking"}
        </button>
      </form>
      <EditableList
        items={items}
        empty="Belum ada booking."
        render={(x) => `${String(x.title ?? "")} · ${String(x.status ?? "manual")}`}
        onDelete={async (id) => {
          await deleteBookingRecord({ data: { id } });
          onSaved();
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
              onClick={() => void onDelete(x.id)}
              className="text-xs font-semibold text-brand-red"
            >
              Hapus
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
          <div className="mt-2 overflow-hidden rounded-2xl bg-surface">
            {group.items.map(({ id, title, icon: Icon }) => (
              <Link
                key={id}
                to="/my-trips/$tripId/$section"
                params={{ tripId, section: id }}
                className="tap flex min-h-[60px] items-center gap-3 border-b border-border/55 px-4 py-3 transition-colors last:border-b-0 active:bg-secondary/60"
              >
                <Icon className="size-5 shrink-0 text-foreground/65" strokeWidth={1.8} />
                <span className="min-w-0 flex-1 text-[15px] font-medium">{title}</span>
                <span className="max-w-[46%] truncate text-right text-[13px] text-muted-foreground">
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
