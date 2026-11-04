import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Camera,
  CircleHelp,
  Ellipsis,
  ImageIcon,
  Hotel,
  Car,
  Minus,
  Plane,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Siren,
  Ticket,
  Trash2,
  Utensils,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { FixedLayer } from "@/components/motion-primitives";
import { ReceiptPhotoSheet, ScanReceiptBanner } from "@/components/receipt-scan-entry";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { MoneyInput } from "@/components/money-input";
import { btnRed } from "@/components/shell";
import { ConfirmDialog, TripActionSheet, iosGroup, iosHeading } from "@/components/trip-ios";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  deleteBudgetCategoryRecord,
  deleteExpense,
  patchBudget,
  postBudgetCategory,
  postExpense,
} from "@/lib/my-trips.fn";
import { displayBudgetCategory } from "@/lib/my-trips-home";
import { isTripAuthenticationError, runTripMutation } from "@/lib/trip-actions";
import { compactMoney, stepFor } from "@/lib/trip-budget-format";
import { formatTripMoney } from "@/lib/trip-money";
import { UNAVAILABLE_RECEIPT_SCAN, type ReceiptScanStatus } from "@/lib/receipt-scan";

type Row = Record<string, unknown> & { id: string };
export type BudgetSummary = {
  allocatedMinor: number;
  spentMinor: number;
  uncategorizedSpentMinor: number;
  uncategorizedCount: number;
  budgetMinor: number;
};
export type CategoryOption = {
  id: string;
  name: string;
  allocated_minor: number;
  currency: string;
};

const CATEGORY_STYLE: Array<{ match: RegExp; icon: LucideIcon; color: string }> = [
  { match: /penerbangan|flight/i, icon: Plane, color: "#007aff" },
  { match: /akomodasi|accommodation|hotel|penginapan/i, icon: Hotel, color: "#5856d6" },
  { match: /transport/i, icon: Car, color: "#34c759" },
  { match: /makan|food|kuliner/i, icon: Utensils, color: "#ff9500" },
  { match: /aktivitas|attraction|wisata/i, icon: Ticket, color: "#af52de" },
  { match: /belanja|shopping/i, icon: ShoppingBag, color: "#ff2d55" },
  { match: /esim|internet|sim/i, icon: Wifi, color: "#32ade6" },
  { match: /visa/i, icon: BadgeCheck, color: "#00a699" },
  { match: /asuransi|insurance/i, icon: ShieldCheck, color: "#30b0c7" },
  { match: /darurat|emergency/i, icon: Siren, color: "#ff3b30" },
  { match: /lain|other/i, icon: Ellipsis, color: "#8e8e93" },
];
const styleFor = (name: unknown): { icon: LucideIcon; color: string } =>
  CATEGORY_STYLE.find((entry) => entry.match.test(String(name ?? ""))) ?? {
    icon: CircleHelp,
    color: "#8e8e93",
  };

const money = (minor: unknown, currency: unknown) => formatTripMoney(minor, currency);

const field =
  "min-h-11 w-full min-w-0 rounded-xl bg-secondary px-3 text-[16px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand-red/25";

function SheetFrame({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[22px] bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2"
      >
        <div
          className="mx-auto mb-2 h-1 w-9 rounded-full bg-muted-foreground/30"
          aria-hidden="true"
        />
        <div className="mb-3 flex min-h-9 items-center justify-between">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="tap min-h-9 pr-3 text-[15px] text-brand-red"
          >
            Batal
          </button>
          <SheetTitle className="text-[15px] font-semibold">{title}</SheetTitle>
          <span className="w-12" aria-hidden="true" />
        </div>
        <SheetDescription className="sr-only">{title}</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ Anggaran */

export function BudgetEditor({
  tripId,
  items,
  currency,
  summary,
  onSaved,
  receiptScan = UNAVAILABLE_RECEIPT_SCAN,
}: {
  tripId: string;
  items: Row[];
  currency: string;
  summary: BudgetSummary | null;
  onSaved: () => Promise<void>;
  receiptScan?: ReceiptScanStatus;
}) {
  const [scanning, setScanning] = useState(false);
  const [limits, setLimits] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((x) => [x.id, Number(x["allocated_minor"] ?? 0)])),
  );
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState("");
  const [menuFor, setMenuFor] = useState<Row | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saved = useRef<Record<string, number>>(
    Object.fromEntries(items.map((x) => [x.id, Number(x["allocated_minor"] ?? 0)])),
  );
  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach(clearTimeout);
  }, []);

  const step = stepFor(currency) * 100;
  const allocated = Object.values(limits).reduce((sum, value) => sum + value, 0);
  const spent =
    summary?.spentMinor ?? items.reduce((sum, item) => sum + Number(item["spent_minor"] ?? 0), 0);
  const budget = summary?.budgetMinor ?? 0;
  const target = budget > 0 ? budget : allocated;
  const remaining = target - spent;
  const percent = target > 0 ? Math.min(100, Math.round((spent / target) * 100)) : 0;
  const uncategorized = summary?.uncategorizedSpentMinor ?? 0;

  const donut = useMemo(() => {
    const base = Math.max(target, allocated, 1);
    let at = 0;
    const stops = items
      .map((item) => {
        const share = ((limits[item.id] ?? 0) / base) * 100;
        if (share <= 0) return "";
        const from = at;
        at += share;
        return `${styleFor(item["name"]).color} ${from}% ${Math.min(at, 100)}%`;
      })
      .filter(Boolean);
    return stops.length
      ? `conic-gradient(${stops.join(", ")}, var(--secondary) 0)`
      : "var(--secondary)";
  }, [items, limits, target, allocated]);

  function persist(id: string, minor: number) {
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      try {
        await patchBudget({ data: { id, allocatedMinor: minor } });
        saved.current[id] = minor;
        await onSaved();
      } catch (error) {
        setLimits((current) => ({ ...current, [id]: saved.current[id] ?? 0 }));
        toast.error(
          isTripAuthenticationError(error)
            ? "Sesi berakhir. Masuk kembali untuk melanjutkan."
            : "Batas belum tersimpan. Coba lagi.",
        );
      }
    }, 500);
  }

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const ok = await runTripMutation({
        action: () => postBudgetCategory({ data: { tripId, name: newName.trim() } }),
        refresh: onSaved,
        successMessage: "Kategori ditambahkan",
        failureMessage: "Kategori belum tersimpan. Nama mungkin sudah dipakai.",
      });
      if (ok) {
        setNewName("");
        setAdding(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(item: Row) {
    setBusy(true);
    try {
      clearTimeout(timers.current[item.id]);
      const ok = await runTripMutation({
        action: () => deleteBudgetCategoryRecord({ data: { id: item.id } }),
        refresh: onSaved,
        successMessage: "Kategori dihapus",
        failureMessage: "Kategori belum terhapus. Coba lagi.",
      });
      if (ok) setConfirmRemove(null);
    } finally {
      setBusy(false);
    }
  }

  function setLimit(id: string, minor: number) {
    const next = Math.max(0, minor);
    setLimits((current) => ({ ...current, [id]: next }));
    persist(id, next);
  }

  return (
    <section className="space-y-3">
      {receiptScan.available && <ScanReceiptBanner onScan={() => setScanning(true)} />}
      {scanning && (
        <ReceiptScanner
          tripId={tripId}
          tripCurrency={currency}
          categories={items.map((x) => ({ id: x.id, name: String(x["name"] ?? "") }))}
          status={receiptScan}
          budget={target > 0 ? { budgetMinor: target, spentMinor: spent } : null}
          onClose={() => setScanning(false)}
          onChanged={onSaved}
        />
      )}
      <div className={`flex items-center gap-3 p-3.5 ${iosGroup}`}>
        <div
          role="img"
          aria-label={`${percent}% anggaran terpakai`}
          className="grid size-[104px] shrink-0 place-items-center rounded-full"
          style={{ background: donut }}
        >
          <span className="grid size-[70px] place-items-center rounded-full bg-surface text-center text-[10px] leading-tight text-muted-foreground">
            <span>
              Terpakai
              <b className="block text-[15px] tracking-tight text-foreground">{percent}%</b>
            </span>
          </span>
        </div>
        <dl className="min-w-0 flex-1 space-y-1.5">
          <div>
            <dt className="text-[11px] text-muted-foreground">Terpakai</dt>
            <dd className="truncate text-[15px] font-bold tracking-tight">
              {money(spent, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Sisa</dt>
            <dd
              className={`truncate text-[14px] font-semibold ${remaining < 0 ? "text-destructive" : "text-success"}`}
            >
              {money(remaining, currency)}
            </dd>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {target > 0 ? `dari ${money(target, currency)}` : "Anggaran belum diatur"}
          </p>
        </dl>
      </div>

      {uncategorized > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-warning/15 px-3 py-2 text-[12px] text-warning-foreground">
          <span>
            {money(uncategorized, currency)} belum berkategori
            {summary && summary.uncategorizedCount > 1 ? ` · ${summary.uncategorizedCount}` : ""}
          </span>
        </div>
      )}

      <section>
        <h2 className={`${iosHeading} flex justify-between`}>
          <span>Batas per kategori</span>
          <span className="normal-case tracking-normal">{items.length}</span>
        </h2>
        <div className={iosGroup}>
          {items.length ? (
            items.map((item) => {
              const { icon: Icon, color } = styleFor(item["name"]);
              const limit = limits[item.id] ?? 0;
              const used = Number(item["spent_minor"] ?? 0);
              const name = displayBudgetCategory(String(item["name"] ?? "Kategori"));
              const over = limit > 0 && used > limit;
              return (
                <div
                  key={item.id}
                  className="flex min-h-[52px] items-center gap-3 border-b border-border/60 px-3 last:border-b-0"
                >
                  <button
                    type="button"
                    aria-label={`Opsi kategori ${name}`}
                    onClick={() => setMenuFor(item)}
                    className="tap flex min-h-[52px] min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-white"
                      style={{ background: color }}
                    >
                      <Icon className="size-[17px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{name}</span>
                      <span
                        className={`block truncate text-[11px] ${over || (limit === 0 && used > 0) ? "text-warning-foreground" : "text-muted-foreground"}`}
                      >
                        {over
                          ? `Melebihi ${compactMoney(used - limit, currency)}`
                          : limit === 0 && used === 0
                            ? "Belum diatur"
                            : `Terpakai ${compactMoney(used, currency)}`}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center rounded-[9px] bg-secondary">
                    <button
                      type="button"
                      aria-label={`Kurangi batas ${name}`}
                      disabled={limit <= 0}
                      onClick={() => setLimit(item.id, limit - step)}
                      className="tap grid size-9 place-items-center text-brand-red disabled:opacity-30"
                    >
                      <Minus className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Ketik batas ${name}`}
                      onClick={() => {
                        setEditing(item);
                        setDraft(limit ? String(Math.round(limit / 100)) : "");
                      }}
                      className="tap min-w-[58px] px-1 text-center text-[12px] font-semibold tabular-nums"
                    >
                      {compactMoney(limit, currency)}
                    </button>
                    <button
                      type="button"
                      aria-label={`Tambah batas ${name}`}
                      onClick={() => setLimit(item.id, limit + step)}
                      className="tap grid size-9 place-items-center text-brand-red"
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="p-4 text-[14px] text-muted-foreground">Belum ada kategori anggaran.</p>
          )}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="tap flex min-h-[48px] w-full items-center gap-3 px-3 text-[15px] text-brand-red"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-brand-red/10">
              <Plus className="size-[18px]" aria-hidden="true" />
            </span>
            Tambah kategori
          </button>
        </div>
        <p className="px-4 pt-1.5 text-[11px] text-muted-foreground">
          − / + mengubah {money(step, currency)}. Ketuk angka untuk mengetik, ketuk nama untuk
          menghapus kategori.
        </p>
      </section>

      <SheetFrame open={adding} onOpenChange={setAdding} title="Kategori baru">
        <form onSubmit={addCategory} className="space-y-3">
          <input
            required
            autoFocus
            maxLength={80}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Mis. Oleh-oleh"
            aria-label="Nama kategori"
            className={field}
          />
          <button
            disabled={busy || !newName.trim()}
            className={`${btnRed} min-h-10 w-full rounded-xl`}
          >
            {busy ? "Menyimpan…" : "Tambah kategori"}
          </button>
        </form>
      </SheetFrame>

      <TripActionSheet
        open={Boolean(menuFor)}
        onOpenChange={(open) => !open && setMenuFor(null)}
        title={displayBudgetCategory(String(menuFor?.["name"] ?? ""))}
        actions={[
          {
            label: "Ketik batas",
            onSelect: () => {
              if (!menuFor) return;
              setEditing(menuFor);
              setDraft(limits[menuFor.id] ? String(Math.round(limits[menuFor.id]! / 100)) : "");
            },
          },
          {
            label: "Hapus kategori",
            icon: Trash2,
            destructive: true,
            onSelect: () => setConfirmRemove(menuFor),
          },
        ]}
      />
      <ConfirmDialog
        open={Boolean(confirmRemove)}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        title="Hapus kategori?"
        description={`Pengeluaran di “${displayBudgetCategory(String(confirmRemove?.["name"] ?? ""))}” tidak ikut terhapus, tetapi menjadi belum berkategori.`}
        confirmLabel="Hapus"
        destructive
        busy={busy}
        onConfirm={() => (confirmRemove ? removeCategory(confirmRemove) : undefined)}
      />

      <SheetFrame
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title={`Batas ${displayBudgetCategory(String(editing?.["name"] ?? ""))}`}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (editing) setLimit(editing.id, Math.round(Number(draft || 0) * 100));
            setEditing(null);
          }}
          className="space-y-3"
        >
          <MoneyInput
            autoFocus
            value={draft}
            onValueChange={setDraft}
            aria-label="Batas kategori"
            placeholder="Rp 0"
            className="w-full rounded-xl bg-transparent py-3 text-center text-[28px] font-bold tracking-tight outline-none placeholder:text-muted-foreground/40"
          />
          <p className="text-center text-[12px] text-muted-foreground">
            Terpakai {money(editing?.["spent_minor"], currency)}
          </p>
          <button className={`${btnRed} min-h-10 w-full rounded-xl`}>Simpan batas</button>
        </form>
      </SheetFrame>
    </section>
  );
}

/* --------------------------------------------------------------- Pengeluaran */

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const shiftDay = (key: string, delta: number) => {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayLabel = (key: string) => {
  const today = todayKey();
  if (key === today) return "Hari ini";
  if (key === shiftDay(today, -1)) return "Kemarin";
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "Tanpa tanggal"
    : new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(
        date,
      );
};
const dayKey = (value: unknown) => String(value ?? "").slice(0, 10);

/** Amount in the trip currency when known, otherwise the original amount. */
function inTripCurrency(item: Row, currency: string) {
  const converted = String(item["converted_currency"] ?? "").trim();
  const original = String(item["original_currency"] ?? "").trim();
  if (converted === currency) return Number(item["converted_amount_minor"] ?? 0);
  if (original === currency) return Number(item["original_amount_minor"] ?? 0);
  return Number(item["converted_amount_minor"] ?? item["original_amount_minor"] ?? 0);
}

export function ExpenseEditor({
  tripId,
  currency,
  items,
  categories,
  onSaved,
  initialCreating = false,
  receiptScan = UNAVAILABLE_RECEIPT_SCAN,
  budgetMinor = 0,
}: {
  tripId: string;
  currency: string;
  items: Row[];
  categories: CategoryOption[];
  onSaved: () => Promise<void>;
  /** Open the "catat biaya" form on arrival (from the Ringkas "+" sheet). */
  initialCreating?: boolean;
  /** Scan struk availability and today's quota (Admin switch + server AI key). */
  receiptScan?: ReceiptScanStatus;
  /** Trip budget in minor units, for "sisa anggaran" after scanning. */
  budgetMinor?: number;
}) {
  const [scanning, setScanning] = useState(false);
  const [photoOf, setPhotoOf] = useState<Row | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [creating, setCreating] = useState(initialCreating);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [form, setForm] = useState({
    description: "",
    date: todayKey(),
    amount: "",
    categoryId: "",
  });

  const categoryName = (item: Row) => {
    const id = String(item["category_id"] ?? "");
    return (
      String(item["category_name"] ?? "") ||
      categories.find((category) => category.id === id)?.name ||
      ""
    );
  };

  const visible = items.filter(
    (item) =>
      filter === "all" ||
      (filter === "none" ? !item["category_id"] : String(item["category_id"]) === filter),
  );
  const total = items.reduce((sum, item) => sum + inTripCurrency(item, currency), 0);
  const activeDays = new Set(items.map((item) => dayKey(item["transaction_date"]))).size;
  const average = activeDays ? Math.round(total / activeDays) : 0;
  const usedCategories = categories.filter((category) =>
    items.some((item) => String(item["category_id"]) === category.id),
  );

  const groups = useMemo(() => {
    // One flat list like the prototype, newest first; the date moves into each row.
    const rows = [...visible].sort((a, b) =>
      dayKey(b["transaction_date"]).localeCompare(dayKey(a["transaction_date"])),
    );
    return rows.length ? ([["all", rows]] as [string, Row[]][]) : [];
  }, [visible]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const amount = Math.round(Number(form.amount) * 100);
      const ok = await runTripMutation({
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
      if (ok) {
        setForm({ description: "", date: todayKey(), amount: "", categoryId: "" });
        setCreating(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Row) {
    setSaving(true);
    try {
      const ok = await runTripMutation({
        action: () => deleteExpense({ data: { id: item.id } }),
        refresh: onSaved,
        successMessage: "Pengeluaran dihapus",
        failureMessage: "Pengeluaran belum terhapus. Coba lagi.",
      });
      if (ok) setConfirmDelete(null);
    } finally {
      setSaving(false);
    }
  }

  const chip = (id: string, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setFilter(id)}
      aria-pressed={filter === id}
      className={`tap min-h-9 shrink-0 rounded-full px-3.5 text-[12px] font-medium ring-1 ring-border/60 ${
        filter === id ? "bg-foreground text-background ring-0" : "bg-surface"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="space-y-3">
      {budgetMinor > 0 && (
        <div className={`${iosGroup} p-3`} data-testid="remaining-card">
          <p className="text-[11px] text-muted-foreground">Sisa anggaran</p>
          <p className="text-[22px] font-bold tracking-tight tabular-nums">
            {money(Math.max(budgetMinor - total, 0), currency)}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-brand-red"
              style={{ width: `${Math.min(100, Math.round((total / budgetMinor) * 100))}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {total > budgetMinor
              ? `Melebihi ${money(total - budgetMinor, currency)}`
              : `Terpakai ${money(total, currency)} dari ${money(budgetMinor, currency)}`}
          </p>
        </div>
      )}
      {receiptScan.available && <ScanReceiptBanner onScan={() => setScanning(true)} />}
      <div className="grid grid-cols-2 gap-3">
        <div className={`${iosGroup} p-3`}>
          <p className="text-[11px] text-muted-foreground">Total</p>
          <p className="truncate text-[15px] font-bold tracking-tight">{money(total, currency)}</p>
        </div>
        <div className={`${iosGroup} p-3`}>
          <p className="text-[11px] text-muted-foreground">Rata-rata / hari</p>
          <p className="truncate text-[15px] font-bold tracking-tight">
            {money(average, currency)}
          </p>
        </div>
      </div>

      {items.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {chip("all", "Semua")}
          {usedCategories.map((category) =>
            chip(category.id, displayBudgetCategory(category.name)),
          )}
          {items.some((item) => !item["category_id"]) && chip("none", "Tanpa kategori")}
        </div>
      )}

      {groups.length ? (
        groups.map(([key, rows]) => (
          <section key={key}>
            <h2 className={iosHeading}>Pengeluaran · {rows.length}</h2>
            <div className={iosGroup}>
              {rows.map((item) => {
                const name = categoryName(item);
                const { icon: Icon, color } = name
                  ? styleFor(name)
                  : { icon: CircleHelp, color: "#8e8e93" };
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item)}
                    className="tap flex min-h-[52px] w-full items-center gap-3 border-b border-border/60 px-3 text-left last:border-b-0"
                  >
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-white"
                      style={{ background: color }}
                    >
                      <Icon className="size-[17px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">
                        {String(item["description"] ?? "Pengeluaran")}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {name ? displayBudgetCategory(name) : "Belum berkategori"} ·{" "}
                        {dayLabel(dayKey(item["transaction_date"]))}
                        {item["from_scan"] ? " · dari scan" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                      −{compactMoney(inTripCurrency(item, currency), currency)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <div className={`${iosGroup} p-4 text-center`}>
          <p className="text-[15px] font-semibold">
            {items.length ? "Tidak ada pengeluaran di kategori ini" : "Belum ada pengeluaran"}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {receiptScan.available
              ? "Ketuk Scan untuk foto struk, atau + untuk catat manual."
              : "Ketuk “Catat” untuk menambah transaksi pertamamu."}
          </p>
        </div>
      )}

      <FixedLayer>
        {receiptScan.available ? (
          <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex items-center gap-2">
            <button
              type="button"
              aria-label="Catat manual"
              onClick={() => setCreating(true)}
              className="tap grid size-11 place-items-center rounded-full bg-surface text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
            >
              <Plus className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Scan struk"
              onClick={() => setScanning(true)}
              className="tap flex h-14 items-center gap-2 rounded-full bg-brand-red px-4 text-[15px] font-semibold text-white shadow-[0_6px_16px_rgba(196,49,58,0.45)]"
            >
              <Camera className="size-6" aria-hidden="true" />
              Scan
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="tap fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-11 items-center gap-1.5 rounded-full bg-brand-red px-4 text-[14px] font-semibold text-white shadow-[0_8px_18px_rgba(229,72,77,0.4)]"
          >
            <Plus className="size-[18px]" aria-hidden="true" /> Catat
          </button>
        )}
      </FixedLayer>
      {scanning && (
        <ReceiptScanner
          tripId={tripId}
          tripCurrency={currency}
          categories={categories.map((category) => ({ id: category.id, name: category.name }))}
          status={receiptScan}
          budget={budgetMinor > 0 ? { budgetMinor, spentMinor: total } : null}
          onClose={() => setScanning(false)}
          onChanged={onSaved}
        />
      )}

      <SheetFrame open={creating} onOpenChange={setCreating} title="Catat pengeluaran">
        <form onSubmit={submit} className="space-y-3">
          <MoneyInput
            required
            autoFocus
            value={form.amount}
            onValueChange={(digits) => setForm({ ...form, amount: digits })}
            aria-label="Nominal"
            placeholder="Rp 0"
            className="w-full bg-transparent py-2 text-center text-[28px] font-bold tracking-tight outline-none placeholder:text-muted-foreground/40"
          />
          <input
            required
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Catatan, mis. Makan siang"
            aria-label="Catatan"
            className={field}
          />
          <input
            required
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            aria-label="Tanggal"
            className={field}
          />
          <div>
            <p className={iosHeading}>Kategori</p>
            <div className="flex flex-wrap gap-2">
              {[{ id: "", name: "" }, ...categories].map((category) => {
                const on = form.categoryId === category.id;
                return (
                  <button
                    key={category.id || "none"}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setForm({ ...form, categoryId: category.id })}
                    className={`tap min-h-9 rounded-full px-3 text-[12px] font-medium ring-1 ring-border/60 ${
                      on ? "bg-foreground text-background ring-0" : "bg-surface"
                    }`}
                  >
                    {category.id ? displayBudgetCategory(category.name) : "Tanpa kategori"}
                  </button>
                );
              })}
            </div>
          </div>
          <button disabled={saving} className={`${btnRed} min-h-10 w-full rounded-xl`}>
            {saving ? "Menyimpan…" : "Simpan pengeluaran"}
          </button>
        </form>
      </SheetFrame>

      <TripActionSheet
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title={String(selected?.["description"] ?? "Pengeluaran")}
        actions={[
          ...(selected?.["receipt_scan_id"]
            ? [
                {
                  label: "Lihat foto struk",
                  icon: ImageIcon,
                  onSelect: () => setPhotoOf(selected),
                },
              ]
            : []),
          {
            label: "Hapus pengeluaran",
            icon: Trash2,
            destructive: true,
            onSelect: () => setConfirmDelete(selected),
          },
        ]}
      />
      <ReceiptPhotoSheet
        scanId={photoOf ? String(photoOf["receipt_scan_id"] ?? "") || null : null}
        title={String(photoOf?.["description"] ?? "")}
        onClose={() => setPhotoOf(null)}
      />
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Hapus pengeluaran?"
        description={`“${String(confirmDelete?.["description"] ?? "")}” akan dihapus dari catatan.`}
        confirmLabel="Hapus"
        destructive
        busy={saving}
        onConfirm={() => (confirmDelete ? remove(confirmDelete) : undefined)}
      />
    </section>
  );
}
