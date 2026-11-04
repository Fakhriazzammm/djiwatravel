import { useCallback, useEffect, useState } from "react";
import { ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DriveChip } from "@/components/trip-google-cards";
import { ConfirmDialog, iosGroup } from "@/components/trip-ios";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { itemsRemainder, type ExpenseDetail, type ExpenseItem } from "@/lib/expense-items";
import {
  getExpenseDetail,
  removeExpenseItem,
  saveExpenseItem,
  updateExpenseInfo,
} from "@/lib/expense-items.fn";
import { parseAmount } from "@/lib/receipt-scan-client";
import { formatReceiptAmount } from "@/lib/receipt-scan";
import { formatTripMoney } from "@/lib/trip-money";

type Row = Record<string, unknown> & { id: string };
type Category = { id: string; name: string };

const input =
  "min-h-10 w-full min-w-0 rounded-xl bg-secondary px-3 text-[14px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand-red/25";
const rowBtn =
  "tap flex min-h-12 w-full items-center gap-3 border-b border-border/60 px-3 text-left last:border-b-0";
const label =
  "mb-1.5 mt-4 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const smallPrimary =
  "tap min-h-9 rounded-lg bg-brand-red px-3.5 text-[13px] font-semibold text-white disabled:opacity-50";
const smallGhost =
  "tap min-h-9 rounded-lg border border-border px-3 text-[13px] font-semibold disabled:opacity-50";

const typed = (value: string) => {
  const amount = parseAmount(value);
  return amount !== null && amount > 0 ? Math.round(amount * 100) : null;
};
const majorText = (minor: number) => String(minor / 100).replace(".", ",");

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message && error.message.length < 140
    ? error.message
    : fallback;
}

/**
 * Detail of one expense: its line items with prices, each editable or removable, plus the expense's
 * name, date and category, the receipt photo and delete. Opened by tapping a row in Pengeluaran.
 * Removing or changing an item moves the expense total by that amount (tax and service are kept).
 */
export function ExpenseDetailSheet({
  row,
  tripCurrency,
  categories,
  onClose,
  onChanged,
  onShowPhoto,
  onDelete,
}: {
  row: Row | null;
  tripCurrency: string;
  categories: Category[];
  onClose: () => void;
  /** Refresh the expense list after the detail changed. */
  onChanged: () => Promise<void> | void;
  onShowPhoto: (row: Row) => void;
  onDelete: (row: Row) => void;
}) {
  const [detail, setDetail] = useState<ExpenseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // item id, "new" or null
  const [draft, setDraft] = useState({ name: "", amount: "" });
  const [infoOpen, setInfoOpen] = useState(false);
  const [info, setInfo] = useState({ description: "", date: "", categoryId: "" });
  const [busy, setBusy] = useState(false);
  const [confirmItem, setConfirmItem] = useState<ExpenseItem | null>(null);
  const id = row?.id ?? null;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const next = (await getExpenseDetail({ data: { id } })) as ExpenseDetail | null;
      if (next) setDetail(next);
      else setLoadFailed(true);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setDetail(null);
    setEditing(null);
    setInfoOpen(false);
    if (id) void load();
  }, [id, load]);

  if (!row) return null;
  const currency =
    detail?.originalCurrency ?? String(row["original_currency"] ?? tripCurrency).trim();
  const foreign = Boolean(detail) && detail!.originalCurrency !== detail!.convertedCurrency;
  const totalMinor = detail
    ? detail.convertedAmountMinor
    : Number(row["converted_amount_minor"] ?? row["original_amount_minor"] ?? 0);
  const totalCurrency =
    detail?.convertedCurrency ?? String(row["converted_currency"] ?? tripCurrency);
  const items = detail?.items ?? [];
  const remainder = detail
    ? itemsRemainder(
        detail.originalAmountMinor,
        items.map((item) => item.amountMinor),
      )
    : 0;
  const money = (minor: number) => formatReceiptAmount(minor / 100, currency);

  async function mutate<T>(work: () => Promise<T>, failure: string) {
    setBusy(true);
    try {
      const result = await work();
      await onChanged();
      return result;
    } catch (error) {
      toast.error(errorText(error, failure));
      return null;
    } finally {
      setBusy(false);
    }
  }

  const startEdit = (item: ExpenseItem | null) => {
    setInfoOpen(false);
    setEditing(item ? item.id : "new");
    setDraft(
      item ? { name: item.name, amount: majorText(item.amountMinor) } : { name: "", amount: "" },
    );
  };

  async function saveItem() {
    if (!detail) return;
    const amountMinor = typed(draft.amount);
    if (!draft.name.trim() || amountMinor === null) {
      toast.error("Isi nama item dan harga yang valid.");
      return;
    }
    const next = await mutate(
      () =>
        saveExpenseItem({
          data: {
            expenseId: detail.id,
            ...(editing && editing !== "new" ? { itemId: editing } : {}),
            name: draft.name.trim(),
            amountMinor,
          },
        }) as Promise<ExpenseDetail | null>,
      "Item belum tersimpan. Coba lagi.",
    );
    if (next) {
      setDetail(next);
      setEditing(null);
    }
  }

  async function deleteItem(item: ExpenseItem) {
    if (!detail) return;
    const next = await mutate(
      () =>
        removeExpenseItem({
          data: { expenseId: detail.id, itemId: item.id },
        }) as Promise<ExpenseDetail | null>,
      "Item belum terhapus. Coba lagi.",
    );
    if (!next) return;
    setDetail(next);
    setEditing(null);
    setConfirmItem(null);
    // Reversible: put the item back (and the total with it) from the toast.
    toast("Item dihapus", {
      action: {
        label: "Urungkan",
        onClick: () =>
          void (async () => {
            const restored = await mutate(
              () =>
                saveExpenseItem({
                  data: { expenseId: detail.id, name: item.name, amountMinor: item.amountMinor },
                }) as Promise<ExpenseDetail | null>,
              "Item belum dikembalikan.",
            );
            if (restored) setDetail(restored);
          })(),
      },
    });
  }

  async function saveInfo() {
    if (!detail) return;
    if (!info.description.trim() || !info.date) {
      toast.error("Isi nama dan tanggal.");
      return;
    }
    const next = await mutate(
      () =>
        updateExpenseInfo({
          data: {
            expenseId: detail.id,
            description: info.description.trim(),
            transactionDate: info.date,
            categoryId: info.categoryId || null,
          },
        }) as Promise<ExpenseDetail | null>,
      "Perubahan belum tersimpan. Coba lagi.",
    );
    if (next) {
      setDetail(next);
      setInfoOpen(false);
    }
  }

  const title = detail?.description ?? String(row["description"] ?? "Pengeluaran");
  const scanId =
    detail?.receiptScanId ?? (row["receipt_scan_id"] ? String(row["receipt_scan_id"]) : null);

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[22px] bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2"
        >
          <div
            className="mx-auto mb-2 h-1 w-9 rounded-full bg-muted-foreground/30"
            aria-hidden="true"
          />
          <div className="mb-2 flex min-h-9 items-center justify-between">
            <span className="w-12" aria-hidden="true" />
            <SheetTitle className="text-[15px] font-semibold">Detail pengeluaran</SheetTitle>
            <button
              type="button"
              onClick={onClose}
              className="tap min-h-9 pl-3 text-[15px] font-semibold text-brand-red"
            >
              Tutup
            </button>
          </div>
          <SheetDescription className="sr-only">
            Rincian item dan pengaturan {title}
          </SheetDescription>

          <div className={`${iosGroup} p-3`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold">{title}</p>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {detail?.categoryName ?? "Belum berkategori"} ·{" "}
                  {detail?.transactionDate ?? String(row["transaction_date"] ?? "").slice(0, 10)}
                </p>
              </div>
              <DriveChip status={row["drive_status"]} />
            </div>
            <p className="mt-2 text-[22px] font-bold tracking-tight tabular-nums">
              {formatTripMoney(totalMinor, totalCurrency)}
            </p>
            {foreign && detail && (
              <p className="text-[11px] text-muted-foreground">
                {money(detail.originalAmountMinor)}
                {detail.exchangeRate ? ` · kurs ${detail.exchangeRate}` : ""}
              </p>
            )}
          </div>

          <p className={label}>Rincian item{items.length ? ` · ${items.length}` : ""}</p>
          <div className={`${iosGroup} overflow-hidden`} data-testid="expense-items">
            {loading && !detail ? (
              <p className="px-3 py-3 text-[13px] text-muted-foreground">Memuat rincian…</p>
            ) : loadFailed ? (
              <div className="flex items-center gap-2 px-3 py-3">
                <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                  Rincian belum bisa dimuat.
                </p>
                <button type="button" onClick={() => void load()} className={smallGhost}>
                  Coba lagi
                </button>
              </div>
            ) : (
              <>
                {items.length === 0 && editing !== "new" && (
                  <p className="px-3 py-3 text-[13px] text-muted-foreground">
                    {detail?.notes
                      ? detail.notes
                      : "Belum ada rincian item. Tambahkan untuk mencatat harga per item."}
                  </p>
                )}
                {items.map((item) =>
                  editing === item.id ? (
                    <ItemForm
                      key={item.id}
                      draft={draft}
                      setDraft={setDraft}
                      busy={busy}
                      onSave={() => void saveItem()}
                      onCancel={() => setEditing(null)}
                      onDelete={() => setConfirmItem(item)}
                    />
                  ) : (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => startEdit(item)}
                      aria-label={`Ubah ${item.name}`}
                      className={rowBtn}
                    >
                      <span className="min-w-0 flex-1 truncate text-[14px]">{item.name}</span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                        {money(item.amountMinor)}
                      </span>
                      <Pencil
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  ),
                )}
                {items.length > 0 && remainder !== 0 && (
                  <div className="flex min-h-10 items-center gap-3 border-b border-border/60 px-3 text-[12px] text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">Pajak, layanan &amp; lainnya</span>
                    <span className="tabular-nums">{money(remainder)}</span>
                  </div>
                )}
                {editing === "new" ? (
                  <ItemForm
                    draft={draft}
                    setDraft={setDraft}
                    busy={busy}
                    onSave={() => void saveItem()}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={!detail}
                    onClick={() => startEdit(null)}
                    className="tap flex min-h-11 w-full items-center gap-2 px-3 text-[14px] font-semibold text-brand-red disabled:opacity-50"
                  >
                    <Plus className="size-4" aria-hidden="true" /> Tambah item
                  </button>
                )}
              </>
            )}
          </div>

          {infoOpen && detail ? (
            <>
              <p className={label}>Ubah info</p>
              <div className={`${iosGroup} space-y-2 p-3`}>
                <input
                  className={input}
                  value={info.description}
                  onChange={(event) => setInfo({ ...info, description: event.target.value })}
                  aria-label="Nama pengeluaran"
                  maxLength={160}
                />
                <input
                  className={input}
                  type="date"
                  value={info.date}
                  onChange={(event) => setInfo({ ...info, date: event.target.value })}
                  aria-label="Tanggal"
                />
                <select
                  className={input}
                  value={info.categoryId}
                  onChange={(event) => setInfo({ ...info, categoryId: event.target.value })}
                  aria-label="Kategori"
                >
                  <option value="">Belum berkategori</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setInfoOpen(false)} className={smallGhost}>
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveInfo()}
                    className={smallPrimary}
                  >
                    {busy ? "Menyimpan…" : "Simpan"}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          <div className={`${iosGroup} mt-4 overflow-hidden`}>
            {!infoOpen && (
              <button
                type="button"
                disabled={!detail}
                onClick={() => {
                  if (!detail) return;
                  setEditing(null);
                  setInfo({
                    description: detail.description,
                    date: detail.transactionDate,
                    categoryId: detail.categoryId ?? "",
                  });
                  setInfoOpen(true);
                }}
                className={`${rowBtn} text-[14px] disabled:opacity-50`}
              >
                <Pencil className="size-4 text-muted-foreground" aria-hidden="true" /> Ubah nama,
                tanggal, kategori
              </button>
            )}
            {scanId && (
              <button
                type="button"
                onClick={() => onShowPhoto(row)}
                className={`${rowBtn} text-[14px]`}
              >
                <ImageIcon className="size-4 text-muted-foreground" aria-hidden="true" /> Lihat foto
                struk
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(row)}
              className={`${rowBtn} text-[14px] text-destructive`}
            >
              <Trash2 className="size-4" aria-hidden="true" /> Hapus pengeluaran
            </button>
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={Boolean(confirmItem)}
        onOpenChange={(open) => !open && setConfirmItem(null)}
        title="Hapus item?"
        description={`“${confirmItem?.name ?? ""}” dihapus dan total pengeluaran berkurang sebesar harganya.`}
        confirmLabel="Hapus"
        destructive
        busy={busy}
        onConfirm={() => (confirmItem ? deleteItem(confirmItem) : undefined)}
      />
    </>
  );
}

function ItemForm({
  draft,
  setDraft,
  busy,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: { name: string; amount: string };
  setDraft: (draft: { name: string; amount: string }) => void;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="space-y-2 border-b border-border/60 bg-secondary/40 p-3 last:border-b-0">
      <input
        className={input}
        value={draft.name}
        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        placeholder="Nama item"
        aria-label="Nama item"
        maxLength={160}
        autoFocus
      />
      <input
        className={input}
        value={draft.amount}
        onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
        placeholder="Harga"
        aria-label="Harga item"
        inputMode="decimal"
      />
      <div className="flex items-center gap-2">
        {onDelete && (
          <button type="button" onClick={onDelete} className={`${smallGhost} text-destructive`}>
            Hapus
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onCancel} className={smallGhost}>
          Batal
        </button>
        <button type="button" disabled={busy} onClick={onSave} className={smallPrimary}>
          {busy ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}
