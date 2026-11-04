import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FixedLayer } from "@/components/motion-primitives";
import { ReceiptScannerCamera } from "@/components/receipt-scanner-camera";
import {
  CheckScreen,
  QueueScreen,
  ReviewScreen,
  SavedScreen,
  type CategoryOption,
} from "@/components/receipt-scanner-screens";
import { ConfirmDialog } from "@/components/trip-ios";
import { deleteExpense, postExpense } from "@/lib/my-trips.fn";
import { compressReceiptPhoto } from "@/lib/receipt-image";
import {
  loadQueuedReceipts,
  removeQueuedReceipt,
  saveQueuedReceipt,
} from "@/lib/receipt-queue-store";
import {
  batchTotalMinor,
  convertedMinor,
  includedForSave,
  itemsNote,
  makeEdit,
  parseAmount,
  reviewable,
  type ScanEdit,
  type ScanItem,
} from "@/lib/receipt-scan-client";
import { getReceiptFxRate, saveScannedExpenses } from "@/lib/receipt-scan.fn";
import { toMinor, type ReceiptScanResponse, type ReceiptScanStatus } from "@/lib/receipt-scan";

type Screen = "camera" | "queue" | "review" | "check" | "saved";

type Props = {
  tripId: string;
  tripCurrency: string;
  categories: CategoryOption[];
  status: ReceiptScanStatus;
  /** Trip budget and what is already spent, in trip currency minor units (for "sisa anggaran"). */
  budget: { budgetMinor: number; spentMinor: number } | null;
  onClose: () => void;
  /** Called after expenses were created or removed so the page reloads its list. */
  onChanged: () => Promise<unknown> | void;
};

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r${Date.now()}${Math.random().toString(16).slice(2)}`;

const CONCURRENT_READS = 2;

/**
 * The whole "scan struk" flow in one overlay: camera (or gallery) → queue that reads photos in the
 * background → review → fix doubtful receipts → save all (with undo). Photos wait in IndexedDB
 * when there is no signal and are read when the phone is online again.
 */
export function ReceiptScanner({
  tripId,
  tripCurrency,
  categories,
  status,
  budget,
  onClose,
  onChanged,
}: Props) {
  const [screen, setScreen] = useState<Screen>("camera");
  const [items, setItems] = useState<ScanItem[]>([]);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [keepPhoto, setKeepPhoto] = useState(status.savePhoto);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{
    ids: string[];
    rows: SavedRow[];
    totalMinor: number;
    kept: boolean;
  } | null>(null);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [remaining, setRemaining] = useState(status.remaining);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const today = useMemo(todayKey, []);
  const blobs = useRef(new Map<string, Blob>());
  const active = useRef(0);
  const waiting = useRef<string[]>([]);
  const itemsRef = useRef<ScanItem[]>([]);
  itemsRef.current = items;
  const urls = useRef(new Set<string>());

  const patch = useCallback(
    (id: string, change: Partial<ScanItem> | ((item: ScanItem) => Partial<ScanItem>)) => {
      setItems((list) =>
        list.map((item) =>
          item.id === id
            ? { ...item, ...(typeof change === "function" ? change(item) : change) }
            : item,
        ),
      );
    },
    [],
  );

  const fetchRate = useCallback(
    async (id: string, currency: string, date: string) => {
      if (currency === tripCurrency || !/^[A-Z]{3}$/.test(currency)) return;
      try {
        const rate = await getReceiptFxRate({ data: { from: currency, to: tripCurrency, date } });
        patch(id, (item) =>
          item.edit && !item.edit.rateManual && item.edit.currency === currency
            ? {
                edit: {
                  ...item.edit,
                  rate: rate?.rate ?? null,
                  rateDate: rate?.rateDate ?? null,
                  rateSource: rate?.source ?? null,
                },
              }
            : {},
        );
      } catch {
        // The traveler can type the rate by hand.
      }
    },
    [patch, tripCurrency],
  );

  const settle = useCallback(
    (id: string, response: ReceiptScanResponse) => {
      void removeQueuedReceipt(id);
      if (!response.ok) {
        patch(id, {
          status: response.code === "limit" ? "limit" : "failed",
          message: response.message,
        });
        if (response.remaining !== undefined) setRemaining(response.remaining);
        return;
      }
      setRemaining(response.remaining);
      const edit =
        response.status === "ready" || response.status === "check"
          ? makeEdit(response.read, response.categoryId, tripCurrency, today)
          : undefined;
      patch(id, {
        status: response.status,
        scanId: response.scanId,
        ...(edit ? { edit } : {}),
        region: response.read?.region ?? null,
        photoStored: response.photoStored,
        ...(response.read?.reason ? { message: response.read.reason } : {}),
      });
      if (edit) void fetchRate(id, edit.currency, edit.date);
    },
    [fetchRate, patch, tripCurrency, today],
  );

  const read = useCallback(
    async (id: string) => {
      const blob = blobs.current.get(id);
      if (!blob) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        patch(id, { status: "offline" });
        return;
      }
      patch(id, { status: "sending" });
      try {
        const form = new FormData();
        form.set("tripId", tripId);
        form.set("photo", blob, "struk.jpg");
        const response = await fetch("/api/receipt-scan", {
          method: "POST",
          body: form,
          credentials: "same-origin",
        });
        const json = (await response.json().catch(() => null)) as ReceiptScanResponse | null;
        if (!json) throw new TypeError("bad response");
        settle(id, json);
      } catch (error) {
        // A network error keeps the photo for a retry; anything else is a failure to show.
        if (error instanceof TypeError) patch(id, { status: "offline" });
        else patch(id, { status: "failed", message: "Struk belum bisa dibaca. Coba lagi." });
      }
    },
    [patch, settle, tripId],
  );

  const pump = useCallback(() => {
    while (active.current < CONCURRENT_READS && waiting.current.length) {
      const id = waiting.current.shift()!;
      active.current++;
      void read(id).finally(() => {
        active.current--;
        pump();
      });
    }
  }, [read]);

  const enqueue = useCallback(
    (id: string) => {
      waiting.current.push(id);
      pump();
    },
    [pump],
  );

  const addPhotos = useCallback(
    async (files: Blob[]) => {
      const room = status.maxPhotos - itemsRef.current.length;
      if (room <= 0) {
        toast.error(`Maksimal ${status.maxPhotos} foto sekali scan.`);
        return;
      }
      if (files.length > room)
        toast.message(`Hanya ${room} foto pertama yang dipakai (maksimal ${status.maxPhotos}).`);
      for (const file of files.slice(0, room)) {
        const id = newId();
        let blob: Blob = file;
        try {
          blob = await compressReceiptPhoto(file);
        } catch {
          // Use the original when the browser cannot decode it; the server rejects bad files.
        }
        const url = URL.createObjectURL(blob);
        urls.current.add(url);
        blobs.current.set(id, blob);
        setItems((list) => [...list, { id, url, status: "sending", skipped: false }]);
        void saveQueuedReceipt({ id, tripId, blob, createdAt: Date.now() });
        enqueue(id);
      }
    },
    [enqueue, status.maxPhotos, tripId],
  );

  // Photos left from an earlier session (no signal, tab closed) come back and are read.
  useEffect(() => {
    let cancelled = false;
    void loadQueuedReceipts(tripId).then((stored) => {
      if (cancelled || !stored.length) return;
      const restored = stored.slice(0, status.maxPhotos).map((entry) => {
        const url = URL.createObjectURL(entry.blob);
        urls.current.add(url);
        blobs.current.set(entry.id, entry.blob);
        return { id: entry.id, url, status: "sending" as const, skipped: false };
      });
      setItems((list) => [...list, ...restored]);
      restored.forEach((entry) => enqueue(entry.id));
      setScreen("queue");
    });
    return () => {
      cancelled = true;
    };
    // Once per opening of the scanner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      itemsRef.current
        .filter((item) => item.status === "offline")
        .forEach((item) => enqueue(item.id));
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [enqueue]);

  useEffect(() => {
    const created = urls.current;
    return () => created.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const updateEdit = useCallback(
    (id: string, change: Partial<ScanEdit>) => {
      let refetch: { currency: string; date: string } | null = null;
      setItems((list) =>
        list.map((item) => {
          if (item.id !== id || !item.edit) return item;
          const edit = { ...item.edit, ...change };
          if ((change.currency !== undefined || change.date !== undefined) && !edit.rateManual)
            refetch = { currency: edit.currency, date: edit.date };
          return { ...item, edit };
        }),
      );
      if (refetch) {
        const { currency, date } = refetch;
        void fetchRate(id, currency, date);
      }
    },
    [fetchRate],
  );

  const discard = useCallback((id: string) => {
    blobs.current.delete(id);
    waiting.current = waiting.current.filter((w) => w !== id);
    void removeQueuedReceipt(id);
    setItems((list) => list.filter((item) => item.id !== id));
  }, []);

  const manual = (id: string) => {
    patch(id, {
      status: "check",
      edit: makeEdit(null, null, tripCurrency, today),
      region: null,
    });
    setCheckId(id);
    setScreen("check");
  };

  const retake = (id: string) => {
    discard(id);
    setScreen("camera");
  };

  const categoryName = (categoryId: string) =>
    categories.find((c) => c.id === categoryId)?.name ?? "";

  async function save() {
    const list = includedForSave(itemsRef.current);
    if (!list.length) return;
    setSaving(true);
    try {
      const withScan = list.filter((item) => item.scanId);
      const withoutScan = list.filter((item) => !item.scanId);
      const ids: string[] = [];
      if (withScan.length) {
        const result = await saveScannedExpenses({
          data: {
            tripId,
            items: withScan.map((item) => {
              const edit = item.edit!;
              return {
                scanId: item.scanId!,
                description: edit.merchant.trim(),
                transactionDate: edit.date,
                originalAmountMinor: toMinor(parseAmount(edit.total)!),
                originalCurrency: edit.currency,
                ...(edit.rate && edit.currency !== tripCurrency ? { exchangeRate: edit.rate } : {}),
                ...(edit.currency !== tripCurrency
                  ? {
                      exchangeRateSource: edit.rateManual
                        ? "Manual"
                        : `${edit.rateSource ?? "ECB via Frankfurter"} ${edit.rateDate ?? ""}`.trim(),
                    }
                  : {}),
                convertedAmountMinor: convertedMinor(edit, tripCurrency)!,
                convertedCurrency: tripCurrency,
                ...(edit.categoryId ? { categoryId: edit.categoryId } : {}),
                notes: itemsNote(edit),
                edited: edit.edited || item.status === "check",
                keepPhoto: keepPhoto && Boolean(item.photoStored),
              };
            }),
          },
        });
        ids.push(...result.expenseIds);
      }
      for (const item of withoutScan) {
        const edit = item.edit!;
        const created = (await postExpense({
          data: {
            tripId,
            description: edit.merchant.trim(),
            transactionDate: edit.date,
            originalAmountMinor: toMinor(parseAmount(edit.total)!),
            originalCurrency: edit.currency,
            convertedAmountMinor: convertedMinor(edit, tripCurrency)!,
            convertedCurrency: tripCurrency,
            exchangeRateStatus: edit.currency === tripCurrency ? "manual" : "estimated",
            ...(edit.rate && edit.currency !== tripCurrency ? { exchangeRate: edit.rate } : {}),
            ...(edit.categoryId ? { categoryId: edit.categoryId } : {}),
            notes: itemsNote(edit),
          },
        })) as { id: string };
        ids.push(String(created.id));
      }
      setSaved({
        ids,
        totalMinor: batchTotalMinor(itemsRef.current, tripCurrency),
        kept: keepPhoto && list.some((item) => item.photoStored),
        rows: list.map((item, index) => ({
          id: ids[index] ?? item.id,
          merchant: item.edit!.merchant,
          categoryName: categoryName(item.edit!.categoryId),
          minor: convertedMinor(item.edit!, tripCurrency) ?? 0,
          checked: item.status === "check" || Boolean(item.edit?.edited),
        })),
      });
      setScreen("saved");
      await onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Pengeluaran belum tersimpan. Coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    if (!saved) return;
    try {
      await Promise.all(saved.ids.map((id) => deleteExpense({ data: { id } })));
      toast.success("Pengeluaran dibatalkan");
      await onChanged();
      onClose();
    } catch {
      toast.error("Belum semua bisa dibatalkan. Hapus dari daftar pengeluaran.");
    }
  }

  const unsaved = itemsRef.current.length > 0 && screen !== "saved";
  const requestClose = () => (unsaved ? setDiscardAsk(true) : onClose());
  const checkItem = items.find((item) => item.id === checkId && item.edit);
  const queueTotal = batchTotalMinor(items, tripCurrency);
  const offlinePending = !online || items.some((item) => item.status === "offline");

  return (
    <FixedLayer>
      <MotionConfig reducedMotion="user">
        {screen === "camera" && (
          <ReceiptScannerCamera
            items={items}
            readCount={reviewable(items).length}
            remaining={remaining}
            room={status.maxPhotos - items.length}
            onCapture={(blob) => void addPhotos([blob])}
            onPick={(files) => void addPhotos(files)}
            onDone={() => setScreen("queue")}
            onClose={requestClose}
          />
        )}
        {screen === "queue" && (
          <QueueScreen
            items={items}
            tripCurrency={tripCurrency}
            totalMinor={queueTotal}
            offline={offlinePending}
            onMore={() => setScreen("camera")}
            onReview={() => setScreen("review")}
            onHide={requestClose}
          />
        )}
        {screen === "review" && (
          <ReviewScreen
            items={items}
            tripCurrency={tripCurrency}
            categories={categories}
            today={today}
            keepPhoto={keepPhoto}
            photoChoice={status.savePhoto}
            saving={saving}
            budget={budget ? { remainingMinor: budget.budgetMinor - budget.spentMinor } : null}
            onKeepPhoto={setKeepPhoto}
            onSkip={(id) => patch(id, (item) => ({ skipped: !item.skipped }))}
            onOpen={(id) => {
              setCheckId(id);
              setScreen("check");
            }}
            onCategory={(id, categoryId) => updateEdit(id, { categoryId, edited: true })}
            onChange={updateEdit}
            onRetake={retake}
            onManual={manual}
            onDrop={discard}
            onBack={() => setScreen("queue")}
            onSave={() => void save()}
          />
        )}
        {screen === "check" && checkItem && (
          <CheckScreen
            item={checkItem}
            tripCurrency={tripCurrency}
            categories={categories}
            today={today}
            onChange={(change) => updateEdit(checkItem.id, change)}
            onDone={() => setScreen("review")}
            onRetake={() => retake(checkItem.id)}
            onBack={() => setScreen("review")}
          />
        )}
        {screen === "saved" && saved && (
          <SavedScreen
            rows={saved.rows}
            tripCurrency={tripCurrency}
            totalMinor={saved.totalMinor}
            budget={
              budget
                ? { budgetMinor: budget.budgetMinor, spentBeforeMinor: budget.spentMinor }
                : null
            }
            keptPhotos={saved.kept}
            onUndo={() => void undo()}
            onMore={() => {
              setItems([]);
              blobs.current.clear();
              setSaved(null);
              setScreen("camera");
            }}
            onDone={onClose}
          />
        )}
      </MotionConfig>
      <ConfirmDialog
        open={discardAsk}
        onOpenChange={setDiscardAsk}
        title="Buang struk ini?"
        description={`${items.length} foto struk belum disimpan sebagai pengeluaran dan akan dibuang.`}
        confirmLabel="Buang"
        destructive
        onConfirm={() => {
          items.forEach((item) => void removeQueuedReceipt(item.id));
          setDiscardAsk(false);
          onClose();
        }}
      />
    </FixedLayer>
  );
}

type SavedRow = {
  id: string;
  merchant: string;
  categoryName: string;
  minor: number;
  checked: boolean;
};
