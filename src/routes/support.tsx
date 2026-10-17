import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Page } from "@/components/shell";

type SupportCase = {
  id: string;
  public_case_code?: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  priority?: string;
  created_at: string;
  updated_at: string;
};
type SupportData = { cases: SupportCase[] };
const categories = ["Pesanan", "eSIM", "Pembayaran", "Akun", "Lainnya"];

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}
function messageFrom(payload: unknown, fallback: string) {
  return payload &&
    typeof payload === "object" &&
    typeof (payload as { error?: unknown }).error === "string"
    ? (payload as { error: string }).error
    : fallback;
}
async function getCases(): Promise<SupportData> {
  const response = await fetch("/api/customer-support", {
    headers: { Accept: "application/json" },
  });
  const payload = await readJson(response);
  if (
    !response.ok ||
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as { cases?: unknown }).cases)
  )
    throw new Error(messageFrom(payload, "Kasus bantuan belum dapat dimuat."));
  return {
    cases: (payload as { cases: unknown[] }).cases.filter((item): item is SupportCase =>
      Boolean(item && typeof item === "object" && typeof (item as SupportCase).id === "string"),
    ),
  };
}

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Bantuan — Djiwa Travel" },
      { name: "description", content: "Hubungi tim bantuan Djiwa Travel." },
    ],
  }),
  component: Support,
});

function Support() {
  const [data, setData] = useState<SupportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SupportCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ category: categories[0], subject: "", description: "" });
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getCases());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kasus bantuan belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function createCase(event: FormEvent) {
    event.preventDefault();
    if (!form.subject.trim() || !form.description.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/customer-support", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "create", ...form, idempotency_key: crypto.randomUUID() }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(messageFrom(payload, "Kasus belum dibuat. Coba lagi."));
      setForm({ category: categories[0], subject: "", description: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kasus belum dibuat. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }
  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (!selected || !reply.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/customer-support", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: "reply",
          case_id: selected.id,
          body: reply.trim(),
          client_message_id: crypto.randomUUID(),
        }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(messageFrom(payload, "Balasan belum terkirim. Coba lagi."));
      setReply("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Balasan belum terkirim. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page>
      <header className="flex h-14 items-center justify-between">
        <Link
          to="/profile"
          search={{ admin: undefined }}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-red"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Profil
        </Link>
        <h1 className="text-base font-bold">Bantuan</h1>
        <span className="w-14" />
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex min-h-10 items-center gap-2 font-semibold underline"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Coba lagi
          </button>
        </div>
      )}
      {selected ? (
        <section aria-labelledby="case-title" className="mt-4">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mb-4 text-sm font-semibold text-brand-red"
          >
            ← Semua kasus
          </button>
          <div className="rounded-2xl bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {selected.public_case_code || "Kasus bantuan"} · {selected.status}
            </p>
            <h2 id="case-title" className="mt-2 text-lg font-bold">
              {selected.subject}
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
              {selected.description}
            </p>
          </div>
          <form onSubmit={sendReply} className="mt-4 space-y-3">
            <label className="block text-sm font-semibold" htmlFor="reply">
              Balas kasus
            </label>
            <textarea
              id="reply"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={4}
              maxLength={10000}
              className="w-full rounded-2xl bg-secondary p-4 outline-none focus:ring-2 focus:ring-ring"
              placeholder="Tulis pesanmu"
            />
            <button
              disabled={saving || !reply.trim()}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Send className="size-4" aria-hidden="true" />
              {saving ? "Mengirim…" : "Kirim balasan"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="mt-3">
            <h2 className="text-lg font-bold">Kasusmu</h2>
            {loading ? (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">
                Memuat kasus…
              </p>
            ) : data?.cases.length ? (
              <div className="mt-3 space-y-2">
                {data.cases.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item)}
                    className="w-full rounded-2xl border bg-surface p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold">{item.subject}</span>
                      <span className="text-xs text-muted-foreground">{item.status}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed p-6 text-center">
                <MessageCircle
                  className="mx-auto size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="mt-2 font-semibold">Belum ada kasus bantuan</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Buat kasus baru jika kamu butuh bantuan.
                </p>
              </div>
            )}
          </section>
          <form onSubmit={createCase} className="mt-7 space-y-3">
            <h2 className="text-lg font-bold">Buat kasus baru</h2>
            <label className="block text-sm font-semibold">
              Kategori
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 h-12 w-full rounded-xl bg-secondary px-3"
              >
                <option value="Pesanan">Pesanan</option>
                <option value="eSIM">eSIM</option>
                <option value="Pembayaran">Pembayaran</option>
                <option value="Akun">Akun</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Subjek
              <input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                maxLength={200}
                required
                className="mt-1 h-12 w-full rounded-xl bg-secondary px-3"
              />
            </label>
            <label className="block text-sm font-semibold">
              Ceritakan kendalamu
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={10000}
                required
                rows={4}
                className="mt-1 w-full rounded-2xl bg-secondary p-3"
              />
            </label>
            <button
              disabled={saving || !form.subject.trim() || !form.description.trim()}
              className="h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Mengirim…" : "Kirim kasus"}
            </button>
          </form>
        </>
      )}
    </Page>
  );
}
