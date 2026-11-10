import { useEffect, useState } from "react";
import { Brain, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  addTravoMemory,
  clearTravoMemory,
  deleteTravoMemory,
  listTravoMemory,
} from "@/lib/travo-docs.fn";
import { MEMORY_MAX_ITEMS, MEMORY_TEXT_MAX, type MemoryRow } from "@/lib/travo-docs";

/** "Yang Travo ingat": what the traveler agreed to share, with delete one, delete all, and add by hand. */
export function TravoMemoryPanel() {
  const [items, setItems] = useState<MemoryRow[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listTravoMemory()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);
  async function add() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const result = await addTravoMemory({ data: { text, source: "manual" } });
      setItems(result.items);
      if (result.ok) setText("");
      else toast.message(result.message);
    } catch {
      toast.error("Belum tersimpan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-3 rounded-2xl bg-surface p-3 ring-1 ring-border/40"
      data-testid="travo-memory"
    >
      <div className="flex items-center gap-2">
        <Brain className="size-4 text-brand-red" aria-hidden="true" />
        <h3 className="flex-1 text-[13px] font-bold">Yang Travo ingat</h3>
        {items && items.length > 0 && (
          <button
            type="button"
            className="tap text-[11px] font-semibold text-muted-foreground"
            onClick={() => {
              void clearTravoMemory().then((r) => setItems(r.items));
            }}
          >
            Hapus semua
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Hanya yang kamu setujui. Travo memakainya supaya tidak bertanya berulang. Tidak ada data
        sensitif.
      </p>
      {items === null ? (
        <p className="mt-2 text-[12px] text-muted-foreground">Memuat…</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted-foreground">Belum ada catatan.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-2 rounded-lg bg-secondary px-2 py-1.5 text-[12px]"
            >
              <span className="min-w-0 flex-1">{item.text}</span>
              <button
                type="button"
                aria-label={`Hapus: ${item.text}`}
                className="tap grid size-6 shrink-0 place-items-center text-muted-foreground"
                onClick={() => {
                  void deleteTravoMemory({ data: { id: item.id } }).then((r) => setItems(r.items));
                }}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {items !== null && items.length < MEMORY_MAX_ITEMS && (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MEMORY_TEXT_MAX}
            placeholder="Tambah catatan, mis. suka kuliner"
            aria-label="Tambah catatan untuk Travo"
            className="min-h-9 min-w-0 flex-1 rounded-full border border-border bg-background px-3 text-[12px] outline-none focus:border-brand-red"
          />
          <button
            type="submit"
            disabled={!text.trim() || busy}
            className="tap min-h-9 rounded-full bg-brand-red px-3 text-[12px] font-bold text-white disabled:opacity-40"
          >
            Simpan
          </button>
        </form>
      )}
    </section>
  );
}

/** Under a Travo answer: "Mau kuingat: ...?" with Ingat / Tidak. Nothing is saved until the traveler taps. */
export function MemoryOffer({ text }: { text: string }) {
  const [state, setState] = useState<"ask" | "saved" | "no">("ask");
  if (state === "no") return null;
  if (state === "saved")
    return (
      <p
        className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground"
        role="status"
      >
        Oke, aku ingat.
      </p>
    );
  return (
    <div
      className="flex items-center gap-2 border-t border-border/60 px-3 py-2"
      data-testid="memory-offer"
    >
      <span className="min-w-0 flex-1 text-[12px]">
        Mau kuingat: <b>{text}</b>?
      </span>
      <button
        type="button"
        className="tap min-h-8 rounded-full bg-brand-red px-3 text-[12px] font-bold text-white"
        onClick={() => {
          void addTravoMemory({ data: { text, source: "chat" } }).then((r) => {
            if (r.ok) setState("saved");
            else {
              toast.message(r.message);
              setState("no");
            }
          });
        }}
      >
        Ingat
      </button>
      <button
        type="button"
        aria-label="Tidak usah"
        className="tap grid size-8 place-items-center rounded-full bg-secondary"
        onClick={() => setState("no")}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
