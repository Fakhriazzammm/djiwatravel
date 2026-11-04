import { useRef, useState, type ReactNode } from "react";
import { Camera, Check, ChevronLeft, Plus, TriangleAlert, WifiOff, X } from "lucide-react";
import { displayBudgetCategory } from "@/lib/my-trips-home";
import {
  convertedMinor,
  editedValidation,
  includedForSave,
  matchLine,
  parseAmount,
  reviewable,
  saveBlocker,
  type ScanEdit,
  type ScanItem,
} from "@/lib/receipt-scan-client";
import { currencySymbol, formatReceiptAmount, type ReceiptRegion } from "@/lib/receipt-scan";
import { formatTripMoney } from "@/lib/trip-money";

export type CategoryOption = { id: string; name: string };

const rp = (minor: number, currency: string) => formatTripMoney(minor, currency);
const AMBER = "bg-[#FFF1D6] text-[#8A5300]";
const shortDate = (key: string) => {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? key
    : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(
        date,
      );
};

const Tag = ({ tone, children }: { tone: "ok" | "warn" | "plain"; children: ReactNode }) => (
  <span
    className={`shrink-0 whitespace-nowrap rounded-lg px-2 py-0.5 text-[10px] font-semibold ${
      tone === "ok"
        ? "bg-[#DDF2EC] text-[#17695A]"
        : tone === "warn"
          ? AMBER
          : "bg-secondary text-muted-foreground"
    }`}
  >
    {children}
  </span>
);

const Spinner = () => (
  <span
    className="block size-5 animate-spin rounded-full border-[2.5px] border-[#F0D5D7] border-t-brand-red motion-reduce:animate-none"
    role="status"
    aria-label="Membaca"
  />
);

const Thumb = ({ item, size = "md" }: { item: ScanItem; size?: "sm" | "md" }) => (
  <img
    src={item.url}
    alt=""
    className={`shrink-0 rounded-lg object-cover ${size === "md" ? "h-[52px] w-11" : "h-12 w-10"}`}
  />
);

const Screen = ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => (
  <div
    className="fixed inset-0 z-[70] flex flex-col bg-background text-foreground"
    role="dialog"
    aria-modal="true"
  >
    <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">{children}</div>
    {footer && <div className="mx-auto w-full max-w-md">{footer}</div>}
  </div>
);

const Header = ({ left, title, right }: { left: ReactNode; title: string; right?: ReactNode }) => (
  <div className="flex h-11 shrink-0 items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.5rem)] box-content">
    <div className="min-w-14">{left}</div>
    <h2 className="text-[14px] font-semibold">{title}</h2>
    <div className="min-w-14 text-right">{right}</div>
  </div>
);

const textBtn = "tap min-h-11 text-[14px] font-semibold text-brand-red";

/* ------------------------------------------------------------------ 3 · Antrean membaca */

export function QueueScreen({
  items,
  tripCurrency,
  onMore,
  onReview,
  onHide,
  totalMinor,
  offline,
}: {
  items: ScanItem[];
  tripCurrency: string;
  onMore: () => void;
  onReview: () => void;
  onHide: () => void;
  totalMinor: number;
  offline: boolean;
}) {
  const settled = items.filter((i) => i.status !== "sending" && i.status !== "offline").length;
  const ready = reviewable(items);
  const troubled = items.filter((i) =>
    ["unreadable", "not_receipt", "failed", "limit"].includes(i.status),
  );
  const pct = items.length ? Math.round((settled / items.length) * 100) : 0;
  return (
    <Screen
      footer={
        <div className="px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2.5">
          <button
            type="button"
            disabled={!ready.length && !troubled.length}
            onClick={onReview}
            className="tap min-h-12 w-full rounded-[14px] bg-brand-red text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {ready.length
              ? `Tinjau ${ready.length} yang siap`
              : troubled.length
                ? "Tinjau struk bermasalah"
                : "Menunggu hasil…"}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Struk yang masih dibaca menyusul otomatis.
          </p>
        </div>
      }
    >
      <Header
        left={
          <button type="button" onClick={onHide} className={textBtn}>
            Tutup
          </button>
        }
        title="Struk perjalanan"
        right={
          <button type="button" onClick={onMore} className={textBtn}>
            Foto lagi
          </button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {offline && (
          <div
            className="mt-1 flex items-start gap-2.5 rounded-2xl bg-[#E8F0FE] p-3 text-[#1A56B0]"
            role="status"
          >
            <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="text-[12px] font-semibold">
              {items.filter((i) => i.status === "offline").length || "Beberapa"} struk menunggu
              sinyal. Foto tersimpan di perangkat dan dibaca otomatis begitu online.
            </p>
          </div>
        )}
        <div className="mt-2 rounded-2xl bg-surface p-3 ring-1 ring-border/50">
          <div className="flex items-baseline justify-between">
            <p className="text-[20px] font-bold">
              {settled} dari {items.length}
            </p>
            <p className="text-[11px] text-muted-foreground">selesai dibaca</p>
          </div>
          <div
            className="mt-2 h-1.5 rounded-full bg-[#F0E1E2]"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Kemajuan membaca"
          >
            <div
              className="h-1.5 rounded-full bg-brand-red transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Tidak perlu menunggu. Kamu bisa foto struk lain atau tutup halaman ini.
          </p>
        </div>
        <ul className="mt-2 space-y-2">
          {items.map((item, index) => {
            const edit = item.edit;
            const conv = edit ? convertedMinor(edit, tripCurrency) : null;
            const tag =
              item.status === "sending" ? null : item.status === "ready" ? (
                <Tag tone="ok">Siap</Tag>
              ) : item.status === "check" ? (
                <Tag tone="warn">Perlu dicek</Tag>
              ) : item.status === "offline" ? (
                <Tag tone="plain">Menunggu sinyal</Tag>
              ) : item.status === "unreadable" ? (
                <Tag tone="warn">Kurang jelas</Tag>
              ) : item.status === "not_receipt" ? (
                <Tag tone="plain">Bukan struk</Tag>
              ) : (
                <Tag tone="warn">{item.status === "limit" ? "Batas harian" : "Gagal"}</Tag>
              );
            return (
              <li
                key={item.id}
                className={`flex min-h-[68px] items-center gap-3 rounded-2xl bg-surface p-2.5 ring-1 ${item.status === "check" || item.status === "unreadable" ? "ring-[1.5px] ring-[#E8A317]" : "ring-border/50"} ${item.status === "sending" ? "opacity-80" : ""}`}
              >
                <Thumb item={item} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">
                    {edit?.merchant || `Struk ke-${index + 1}`}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {item.status === "sending"
                      ? "Membaca… sekitar 3 detik"
                      : edit && edit.total
                        ? `${shortDate(edit.date).replace(/ \d{4}$/, "")} · ${formatReceiptAmount(parseAmount(edit.total) ?? 0, edit.currency)}${conv && edit.currency !== tripCurrency ? ` ≈ ${rp(conv, tripCurrency)}` : ""}`
                        : (item.message ?? "")}
                  </p>
                </div>
                {item.status === "sending" ? <Spinner /> : tag}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 rounded-2xl bg-surface p-3 ring-1 ring-border/50">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Total sementara
          </p>
          <div className="mt-0.5 flex items-baseline justify-between">
            <p className="text-[22px] font-bold tabular-nums">{rp(totalMinor, tripCurrency)}</p>
            <p className="text-[11px] text-muted-foreground">{ready.length} struk siap</p>
          </div>
        </div>
      </div>
    </Screen>
  );
}

/* --------------------------------------------------------------------- 4 · Tinjau semua */

export function ReviewScreen({
  items,
  tripCurrency,
  categories,
  today,
  keepPhoto,
  photoChoice,
  saving,
  budget,
  onKeepPhoto,
  onSkip,
  onOpen,
  onCategory,
  onRetake,
  onManual,
  onDrop,
  onBack,
  onSave,
}: {
  items: ScanItem[];
  tripCurrency: string;
  categories: CategoryOption[];
  today: string;
  keepPhoto: boolean;
  /** Admin allows keeping photos at all. */
  photoChoice: boolean;
  saving: boolean;
  budget: { remainingMinor: number } | null;
  onKeepPhoto: (value: boolean) => void;
  onSkip: (id: string) => void;
  onOpen: (id: string) => void;
  onCategory: (id: string, categoryId: string) => void;
  onRetake: (id: string) => void;
  onManual: (id: string) => void;
  onDrop: (id: string) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const toRead = reviewable(items);
  const trouble = items.filter((i) =>
    ["unreadable", "not_receipt", "failed", "limit"].includes(i.status),
  );
  const included = includedForSave(items);
  const totalMinor = included.reduce(
    (sum, i) => sum + (i.edit ? (convertedMinor(i.edit, tripCurrency) ?? 0) : 0),
    0,
  );
  const blocked =
    included.map((i) => (i.edit ? saveBlocker(i.edit, tripCurrency, today) : "x")).find(Boolean) ??
    null;
  const needCheck = included.filter((i) => i.status === "check" && !i.edit?.edited).length;
  const start = useRef<{ id: string; x: number } | null>(null);
  return (
    <Screen
      footer={
        <div className="border-t border-border/70 bg-surface px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2.5">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-[11px] text-muted-foreground">
              {included.length} pengeluaran{needCheck ? ` · ${needCheck} perlu dicek` : ""}
            </p>
            <p className="text-[18px] font-bold tabular-nums">{rp(totalMinor, tripCurrency)}</p>
          </div>
          {photoChoice && (
            <label className="mb-2 flex min-h-11 items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">Simpan foto struk</span>
                <span className="block text-[11px] text-muted-foreground">
                  Dilampirkan ke pengeluaran, bisa dihapus kapan saja
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={keepPhoto}
                onChange={(e) => onKeepPhoto(e.target.checked)}
                className="size-5 accent-brand-red"
                aria-label="Simpan foto struk"
              />
            </label>
          )}
          <button
            type="button"
            disabled={saving || !included.length || Boolean(blocked)}
            onClick={onSave}
            className="tap min-h-12 w-full rounded-[14px] bg-brand-red text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Menyimpan…" : "Simpan semua"}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            {blocked
              ? `${blocked} sebelum menyimpan`
              : budget
                ? `Sisa anggaran jadi ${rp(budget.remainingMinor - totalMinor, tripCurrency)}`
                : "Kurs referensi ECB sesuai tanggal struk"}
          </p>
        </div>
      }
    >
      <Header
        left={
          <button type="button" onClick={onBack} className={textBtn}>
            Kembali
          </button>
        }
        title={`Tinjau ${toRead.length + trouble.length} struk`}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {toRead.map((item) => {
          const edit = item.edit!;
          const v = editedValidation(edit, today);
          const line = matchLine(edit, v);
          const conv = convertedMinor(edit, tripCurrency);
          const warn =
            item.status === "check" && !edit.edited && !v.issues.length
              ? false
              : v.status === "check";
          return (
            <div
              key={item.id}
              data-testid="review-card"
              className={`relative mt-2 overflow-hidden rounded-2xl bg-surface p-3 ring-1 ${warn ? "ring-[1.5px] ring-[#E8A317]" : "ring-border/50"} ${item.skipped ? "opacity-50" : ""}`}
              onTouchStart={(e) => (start.current = { id: item.id, x: e.touches[0]!.clientX })}
              onTouchEnd={(e) => {
                const s = start.current;
                start.current = null;
                if (s && s.id === item.id && e.changedTouches[0]!.clientX - s.x < -70)
                  onSkip(item.id);
              }}
            >
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="tap flex w-full items-center gap-2.5 text-left"
                aria-label={`Ubah ${edit.merchant || "struk"}`}
              >
                <Thumb item={item} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">
                    {edit.merchant || "Nama toko belum terisi"}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {shortDate(edit.date)} · {edit.items.length} item
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[15px] font-bold tabular-nums">
                    {conv ? rp(conv, tripCurrency) : "Isi kurs"}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {edit.currency !== tripCurrency
                      ? formatReceiptAmount(parseAmount(edit.total) ?? 0, edit.currency)
                      : " "}
                  </span>
                </span>
              </button>
              {item.skipped ? (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-secondary px-3 py-1.5 text-[12px]">
                  <span className="font-semibold">Dilewati, tidak ikut disimpan</span>
                  <button
                    type="button"
                    onClick={() => onSkip(item.id)}
                    className="tap min-h-11 font-semibold text-brand-red"
                  >
                    Batal lewati
                  </button>
                </div>
              ) : (
                <>
                  {line?.ok && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-[#17695A]">
                      <Check className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
                      {line.text}
                    </p>
                  )}
                  {warn && (
                    <div
                      className={`mt-2 flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 ${AMBER}`}
                    >
                      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                      <p className="min-w-0 flex-1 text-[11px] font-semibold text-[#5A3A00]">
                        {line && !line.ok ? line.text : (v.issues[0] ?? "Perlu dicek")}
                      </p>
                      <button
                        type="button"
                        onClick={() => onOpen(item.id)}
                        className="tap min-h-11 shrink-0 rounded-lg bg-white px-3 text-[12px] font-semibold text-[#8A5300]"
                      >
                        Cek
                      </button>
                    </div>
                  )}
                  <div className="mt-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={edit.categoryId === c.id}
                        onClick={() => onCategory(item.id, edit.categoryId === c.id ? "" : c.id)}
                        className={`tap min-h-8 shrink-0 rounded-full px-3 text-[12px] font-medium ${edit.categoryId === c.id ? "bg-brand-red text-white" : "bg-secondary"}`}
                      >
                        {displayBudgetCategory(c.name)}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={() => onSkip(item.id)}
                className="sr-only focus:not-sr-only focus:mt-2 focus:min-h-11 focus:text-[12px]"
              >
                {item.skipped ? "Ikutkan struk ini" : "Lewati struk ini"}
              </button>
            </div>
          );
        })}
        {trouble.map((item) => (
          <TroubleCard
            key={item.id}
            item={item}
            onRetake={onRetake}
            onManual={onManual}
            onDrop={onDrop}
          />
        ))}
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Ketuk kartu untuk mengubah. Geser ke kiri untuk melewati struk ini.
        </p>
      </div>
    </Screen>
  );
}

/* ----------------------------------------------------------------------- 7 · Kasus khusus */

function TroubleCard({
  item,
  onRetake,
  onManual,
  onDrop,
}: {
  item: ScanItem;
  onRetake: (id: string) => void;
  onManual: (id: string) => void;
  onDrop: (id: string) => void;
}) {
  const copy =
    item.status === "not_receipt"
      ? {
          title: "Tidak terlihat seperti struk",
          body: "Kami tidak menemukan toko atau total di foto ini.",
        }
      : item.status === "unreadable"
        ? {
            title: "Struk kurang jelas",
            body: "Bagian total terpotong atau buram. Foto ulang agar semua terlihat.",
          }
        : item.status === "limit"
          ? {
              title: "Scan harian habis",
              body: item.message ?? "Besok bisa lagi. Sekarang tetap bisa catat manual.",
            }
          : {
              title: "Struk belum terbaca",
              body: item.message ?? "Coba foto ulang atau isi manual.",
            };
  return (
    <div
      className="mt-2 rounded-2xl bg-surface p-3 ring-1 ring-border/50"
      data-testid="trouble-card"
    >
      <div className="flex items-start gap-2.5">
        <Thumb item={item} size="sm" />
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#FFF1D6] text-[#8A5300]">
          <TriangleAlert className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">{copy.title}</p>
          <p className="text-[11px] text-muted-foreground">{copy.body}</p>
        </div>
      </div>
      <div className="mt-2.5 flex gap-2">
        {item.status !== "limit" && (
          <button
            type="button"
            onClick={() => onRetake(item.id)}
            className="tap min-h-11 flex-1 rounded-xl bg-brand-red text-[13px] font-semibold text-white"
          >
            {item.status === "not_receipt" ? "Coba foto lain" : "Foto ulang"}
          </button>
        )}
        {item.status !== "not_receipt" && (
          <button
            type="button"
            onClick={() => onManual(item.id)}
            className="tap min-h-11 flex-1 rounded-xl bg-secondary text-[13px] font-semibold"
          >
            Isi manual
          </button>
        )}
        {item.status === "not_receipt" && (
          <button
            type="button"
            onClick={() => onDrop(item.id)}
            className="tap min-h-11 flex-1 rounded-xl bg-secondary text-[13px] font-semibold"
          >
            Lewati foto ini
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 5 · Cek yang meragukan */

function Highlight({ region, label }: { region: ReceiptRegion; label: string }) {
  return (
    <>
      <span
        className="pointer-events-none absolute rounded-md border-[2.5px] border-[#E8A317] bg-[#E8A317]/20"
        style={{
          left: `${region.x * 100}%`,
          top: `${region.y * 100}%`,
          width: `${region.width * 100}%`,
          height: `${region.height * 100}%`,
        }}
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute whitespace-nowrap rounded-lg bg-[#E8A317] px-2 py-0.5 text-[11px] font-bold text-[#3A2600]"
        style={{ left: `${region.x * 100}%`, top: `calc(${region.y * 100}% - 24px)` }}
      >
        {label}
      </span>
    </>
  );
}

export function CheckScreen({
  item,
  tripCurrency,
  categories,
  today,
  onChange,
  onDone,
  onRetake,
  onBack,
}: {
  item: ScanItem;
  tripCurrency: string;
  categories: CategoryOption[];
  today: string;
  onChange: (patch: Partial<ScanEdit>) => void;
  onDone: () => void;
  onRetake: () => void;
  onBack: () => void;
}) {
  const edit = item.edit!;
  const v = editedValidation(edit, today);
  const line = matchLine(edit, v);
  const [zoom, setZoom] = useState(false);
  const input =
    "min-h-11 w-full min-w-0 rounded-xl bg-surface px-3 text-[15px] outline-none ring-1 ring-border/50 focus:ring-2 focus:ring-brand-red/30";
  const setItem = (index: number, patch: Partial<{ name: string; amount: string }>) =>
    onChange({
      items: edit.items.map((row, i) => (i === index ? { ...row, ...patch } : row)),
      edited: true,
    });
  const different = edit.currency !== tripCurrency;
  return (
    <Screen
      footer={
        <div className="flex gap-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2.5">
          <button
            type="button"
            onClick={onDone}
            className="tap min-h-12 flex-1 rounded-[14px] bg-brand-red text-[15px] font-semibold text-white"
          >
            Selesai cek
          </button>
          <button
            type="button"
            aria-label="Foto ulang"
            onClick={onRetake}
            className="tap grid min-h-12 w-12 place-items-center rounded-[14px] bg-surface ring-1 ring-border/60"
          >
            <Camera className="size-5" aria-hidden="true" />
          </button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative flex min-h-[220px] items-center justify-center bg-[#2A2A2E] px-4 pb-4 pt-[max(env(safe-area-inset-top),3.5rem)]">
          <button
            type="button"
            aria-label="Kembali"
            onClick={onBack}
            className="tap absolute left-4 top-[max(env(safe-area-inset-top),0.75rem)] grid size-11 place-items-center rounded-full bg-black/45 text-white"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => !z)}
            className="tap absolute right-4 top-[max(env(safe-area-inset-top),0.75rem)] min-h-11 rounded-full bg-black/50 px-3 text-[12px] font-semibold text-white"
          >
            {zoom ? "Kecil" : "Zoom"}
          </button>
          <div className="relative w-fit max-w-full">
            <img
              src={item.url}
              alt="Foto struk"
              className={`block max-w-full object-contain ${zoom ? "h-[70vh]" : "h-[210px]"} w-auto`}
            />
            {item.region && <Highlight region={item.region} label="Baris ini kurang jelas" />}
          </div>
        </div>
        <div className="-mt-3 rounded-t-[22px] bg-background px-4 pt-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">
                {edit.merchant || "Struk"} · {shortDate(edit.date)}
              </p>
              <h2 className="text-[18px] font-bold">Cek item</h2>
            </div>
            {v.matches === false && (
              <span className={`mt-0.5 rounded-lg px-2 py-0.5 text-[11px] font-bold ${AMBER}`}>
                Selisih {formatReceiptAmount(Math.abs(v.difference), edit.currency)}
              </span>
            )}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="col-span-2 block">
              <span className="mb-1 block px-1 text-[11px] text-muted-foreground">Toko</span>
              <input
                value={edit.merchant}
                onChange={(e) => onChange({ merchant: e.target.value, edited: true })}
                className={input}
                aria-label="Toko"
              />
            </label>
            <label className="block">
              <span className="mb-1 block px-1 text-[11px] text-muted-foreground">Tanggal</span>
              <input
                type="date"
                value={edit.date}
                onChange={(e) => onChange({ date: e.target.value, edited: true })}
                className={input}
                aria-label="Tanggal"
              />
            </label>
            <label className="block">
              <span className="mb-1 block px-1 text-[11px] text-muted-foreground">Mata uang</span>
              <input
                value={edit.currency}
                maxLength={3}
                onChange={(e) =>
                  onChange({
                    currency: e.target.value.toUpperCase(),
                    rate: null,
                    rateDate: null,
                    rateSource: null,
                    edited: true,
                  })
                }
                className={input}
                aria-label="Mata uang"
              />
            </label>
          </div>

          <div className="mt-2 rounded-2xl bg-surface px-3 ring-1 ring-border/50">
            {edit.items.map((row, index) => (
              <div
                key={index}
                className={`flex min-h-11 items-center gap-2 ${index ? "border-t border-border/60" : ""}`}
              >
                <input
                  value={row.name}
                  onChange={(e) => setItem(index, { name: e.target.value })}
                  className="min-w-0 flex-1 bg-transparent py-2 text-[14px] outline-none"
                  aria-label={`Nama item ${index + 1}`}
                />
                <input
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(e) => setItem(index, { amount: e.target.value })}
                  className="min-h-8 w-[84px] rounded-lg bg-secondary px-2 text-right text-[14px] font-semibold outline-none"
                  aria-label={`Harga item ${index + 1}`}
                />
                <button
                  type="button"
                  aria-label={`Hapus item ${index + 1}`}
                  onClick={() =>
                    onChange({ items: edit.items.filter((_, i) => i !== index), edited: true })
                  }
                  className="tap grid size-8 place-items-center text-muted-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                onChange({
                  items: [
                    ...edit.items,
                    {
                      name: v.matches === false ? "Item terlewat" : "",
                      amount: v.matches === false ? String(Math.abs(v.difference)) : "",
                    },
                  ],
                  edited: true,
                })
              }
              className={`${textBtn} flex w-full items-center gap-1.5 border-t border-border/60 text-[13px]`}
            >
              <Plus className="size-4" aria-hidden="true" />
              {v.matches === false ? "Item terlewat? Tambah" : "Tambah item"}
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between rounded-2xl bg-surface p-3 ring-1 ring-border/50">
            <label className="min-w-0">
              <span className="block text-[11px] text-muted-foreground">Total struk</span>
              <input
                inputMode="decimal"
                value={edit.total}
                onChange={(e) => onChange({ total: e.target.value, edited: true })}
                className="w-[120px] bg-transparent text-[20px] font-bold outline-none"
                aria-label="Total struk"
              />
            </label>
            <div className="text-right">
              {line ? (
                <p
                  className={`flex items-center justify-end gap-1 text-[12px] font-semibold ${line.ok ? "text-[#17695A]" : "text-[#8A5300]"}`}
                >
                  {line.ok && <Check className="size-3.5" strokeWidth={2.6} aria-hidden="true" />}
                  {line.ok ? line.text.replace(", cocok dengan total", "") : "Belum cocok"}
                </p>
              ) : (
                <p className="text-[12px] text-muted-foreground">Tanpa rincian item</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                {line?.ok
                  ? "Cocok dengan total"
                  : line
                    ? "Tambah item yang terlewat"
                    : "Total dipakai apa adanya"}
              </p>
            </div>
          </div>

          {different && (
            <div className="mt-2 rounded-2xl bg-surface p-3 ring-1 ring-border/50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold">Kurs 1 {edit.currency} =</p>
                <input
                  inputMode="decimal"
                  value={edit.rate ?? ""}
                  placeholder="Isi kurs"
                  onChange={(e) =>
                    onChange({
                      rate: parseAmount(e.target.value),
                      rateManual: true,
                      rateSource: "Manual",
                      edited: true,
                    })
                  }
                  className="min-h-9 w-[110px] rounded-lg bg-secondary px-2 text-right text-[14px] font-semibold outline-none"
                  aria-label="Kurs"
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {edit.rate
                  ? `≈ ${rp(convertedMinor(edit, tripCurrency) ?? 0, tripCurrency)} · ${edit.rateManual ? "kurs manual" : `${edit.rateSource ?? "Kurs"} ${edit.rateDate ? shortDate(edit.rateDate) : ""}`}`
                  : "Kurs belum tersedia. Isi manual agar bisa disimpan."}
              </p>
            </div>
          )}

          <p className="mb-1.5 mt-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Kategori
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-4 [scrollbar-width:none]">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={edit.categoryId === c.id}
                onClick={() =>
                  onChange({ categoryId: edit.categoryId === c.id ? "" : c.id, edited: true })
                }
                className={`tap min-h-9 shrink-0 rounded-full px-3 text-[12px] font-medium ${edit.categoryId === c.id ? "bg-brand-red text-white" : "bg-surface ring-1 ring-border/50"}`}
              >
                {displayBudgetCategory(c.name)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Screen>
  );
}

/* ----------------------------------------------------------------------------- 6 · Tersimpan */

export function SavedScreen({
  rows,
  tripCurrency,
  totalMinor,
  budget,
  keptPhotos,
  onUndo,
  onMore,
  onDone,
}: {
  rows: { id: string; merchant: string; categoryName: string; minor: number; checked: boolean }[];
  tripCurrency: string;
  totalMinor: number;
  budget: { budgetMinor: number; spentBeforeMinor: number } | null;
  keptPhotos: boolean;
  onUndo: () => void;
  onMore: () => void;
  onDone: () => void;
}) {
  const after = budget ? budget.budgetMinor - budget.spentBeforeMinor - totalMinor : 0;
  const pctUsed =
    budget && budget.budgetMinor > 0
      ? Math.min(100, ((budget.spentBeforeMinor + totalMinor) / budget.budgetMinor) * 100)
      : 0;
  return (
    <Screen
      footer={
        <div className="relative px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2">
          <div
            className="mb-2 flex items-center gap-2.5 rounded-[14px] bg-foreground px-3.5 py-1 text-background shadow-lg"
            role="status"
          >
            <p className="flex-1 text-[13px]">{rows.length} pengeluaran ditambahkan</p>
            <button
              type="button"
              onClick={onUndo}
              className="tap min-h-11 text-[13px] font-bold text-[#FFB4B8]"
            >
              Batalkan
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onMore}
              className="tap flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-brand-red text-[15px] font-semibold text-white"
            >
              <Camera className="size-[18px]" aria-hidden="true" />
              Scan lagi
            </button>
            <button
              type="button"
              onClick={onDone}
              className="tap min-h-12 flex-1 rounded-[14px] bg-surface text-[15px] font-semibold ring-1 ring-border/60"
            >
              Selesai
            </button>
          </div>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-[max(env(safe-area-inset-top),1.5rem)]">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-[60px] place-items-center rounded-full bg-brand-red text-white shadow-[0_8px_20px_rgba(196,49,58,0.35)]">
            <Check className="size-7" strokeWidth={2.4} aria-hidden="true" />
          </span>
          <h2 className="mt-3 text-[20px] font-bold">{rows.length} pengeluaran tersimpan</h2>
          <p className="mt-1.5 text-[26px] font-bold tabular-nums">
            {rp(totalMinor, tripCurrency)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {keptPhotos ? "Foto struk terlampir di tiap catatan" : "Foto struk tidak disimpan"}
          </p>
        </div>
        {budget && budget.budgetMinor > 0 && (
          <div className="mt-4 rounded-2xl bg-surface p-3 ring-1 ring-border/50">
            <div className="flex justify-between">
              <p className="text-[11px] text-muted-foreground">Sisa anggaran</p>
              <p className="text-[11px] font-semibold text-[#17695A]">
                turun {rp(totalMinor, tripCurrency)}
              </p>
            </div>
            <p className="text-[22px] font-bold tabular-nums">{rp(after, tripCurrency)}</p>
            <div className="mt-2 h-1.5 rounded-full bg-secondary">
              <div className="h-1.5 rounded-full bg-brand-red" style={{ width: `${pctUsed}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Terpakai {rp(budget.spentBeforeMinor + totalMinor, tripCurrency)} dari{" "}
              {rp(budget.budgetMinor, tripCurrency)}
            </p>
          </div>
        )}
        <ul className="mt-3 divide-y divide-border/60 overflow-hidden rounded-2xl bg-surface ring-1 ring-border/50">
          {rows.map((row) => (
            <li key={row.id} className="flex min-h-[52px] items-center gap-2.5 bg-[#FFF8F8] px-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#FBEAEB] text-brand-red">
                <Check className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{row.merchant}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {row.categoryName || "Belum berkategori"} ·{" "}
                  {row.checked ? "dicek manual" : "dari scan"}
                </span>
              </span>
              <span className="text-[14px] font-semibold tabular-nums">
                {rp(row.minor, tripCurrency)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  );
}
