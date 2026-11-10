import { useEffect, useState } from "react";
import { AdminSurface, SectionHeading } from "@/components/admin-shell";
import {
  deleteAdminTravoDoc,
  getAdminTravoDocs,
  restoreAdminTravoDocs,
  saveAdminTravoDoc,
} from "@/lib/travo-docs.fn";
import type { TravoDoc } from "@/lib/travo-docs";

type Loaded = {
  docs: TravoDoc[];
  isDefault: boolean;
  memory: { items: number; travelers: number };
};
const field = "mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px]";
const csv = (list: string[]) => list.join(", ");
const parseCsv = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

function DocEditor({
  doc,
  onChanged,
  isNew = false,
}: {
  doc: TravoDoc;
  onChanged: (next: Loaded) => void;
  isNew?: boolean;
}) {
  const [slug, setSlug] = useState(doc.slug);
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [enabled, setEnabled] = useState(doc.enabled);
  const [intents, setIntents] = useState(csv(doc.triggers.intents));
  const [scopes, setScopes] = useState(csv(doc.triggers.scopes));
  const [keywords, setKeywords] = useState(csv(doc.triggers.keywords));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const agent = doc.kind === "agent";
  const run = async (fn: () => Promise<Loaded>, ok: string) => {
    setBusy(true);
    try {
      const next = await fn();
      onChanged(next);
      setMessage(ok);
      if (isNew) {
        setSlug("");
        setTitle("");
        setBody("");
        setReason("");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Belum tersimpan.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 pt-2">
      {!agent && (
        <label className="block text-[12px] font-medium">
          Slug (huruf kecil dan strip)
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={!isNew}
            className={field}
          />
        </label>
      )}
      <label className="block text-[12px] font-medium">
        Nama
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          className={field}
        />
      </label>
      <label className="block text-[12px] font-medium">
        Isi ({body.length}/4000; yang masuk prompt: {agent ? "1200" : "900"} karakter pertama)
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={agent ? 9 : 7}
          maxLength={4000}
          className={field}
        />
      </label>
      {!agent && (
        <div className="grid grid-cols-1 gap-2">
          <label className="block text-[12px] font-medium">
            Dipakai untuk intent (pisah koma)
            <input
              value={intents}
              onChange={(e) => setIntents(e.target.value)}
              placeholder="full_plan, budget, checklist"
              className={field}
            />
          </label>
          <label className="block text-[12px] font-medium">
            Dipakai untuk topik (pisah koma)
            <input
              value={scopes}
              onChange={(e) => setScopes(e.target.value)}
              placeholder="esim, tiket, titip, panduan, trip"
              className={field}
            />
          </label>
          <label className="block text-[12px] font-medium">
            Atau kalau pesan memuat kata (pisah koma)
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="visa, paspor"
              className={field}
            />
          </label>
        </div>
      )}
      <label className="flex items-center gap-2 text-[13px] font-medium">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{" "}
        Aktif
      </label>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Alasan perubahan (min. 4 huruf)"
        aria-label="Alasan perubahan"
        className={field}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || reason.trim().length < 4}
          onClick={() =>
            void run(
              () =>
                saveAdminTravoDoc({
                  data: {
                    kind: doc.kind,
                    ...(agent ? {} : { slug }),
                    title,
                    body,
                    enabled,
                    ...(agent
                      ? {}
                      : {
                          triggers: {
                            intents: parseCsv(intents),
                            scopes: parseCsv(scopes),
                            keywords: parseCsv(keywords),
                          },
                        }),
                    reason,
                  },
                }) as Promise<Loaded>,
              "Tersimpan dan dicatat di audit.",
            )
          }
          className="min-h-9 flex-1 rounded-lg bg-brand-red px-3 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          Simpan
        </button>
        {!agent && !isNew && (
          <button
            type="button"
            disabled={busy || reason.trim().length < 4}
            onClick={() =>
              void run(
                () =>
                  deleteAdminTravoDoc({
                    data: { kind: "skill", slug: doc.slug, reason },
                  }) as Promise<Loaded>,
                "Dihapus.",
              )
            }
            className="min-h-9 rounded-lg bg-secondary px-3 text-[13px] font-semibold disabled:opacity-40"
          >
            Hapus
          </button>
        )}
      </div>
      {message && (
        <p role="status" className="text-[12px] text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}

/** Admin › Travo: the "agent" document (persona and rules of thumb) and the skill documents per topic. */
export function AdminTravoDocs() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => {
    getAdminTravoDocs()
      .then((d) => setData(d as Loaded))
      .catch(() => setError(true));
  }, []);
  const agent = data?.docs.find((d) => d.kind === "agent");
  const skills = (data?.docs ?? []).filter((d) => d.kind === "skill");
  return (
    <AdminSurface className="space-y-2 p-3">
      <SectionHeading title="Panduan Travo (agent dan skill)" />
      <p className="text-[12px] text-muted-foreground">
        Agent = persona dan aturan praktis tim. Skill = pengetahuan per topik, hanya ditambahkan ke
        prompt bila topik, intent, atau kata di pesan cocok (maksimal 2 per pesan). Keduanya hanya
        panduan: tidak pernah bisa mengalahkan aturan inti. Memori traveler tersimpan{" "}
        {data?.memory.items ?? 0} catatan dari {data?.memory.travelers ?? 0} akun (isinya tidak
        ditampilkan di sini).
      </p>
      {error && (
        <p role="alert" className="text-[12px] text-brand-red">
          Dokumen belum bisa dimuat.
        </p>
      )}
      {data?.isDefault && (
        <p className="rounded-lg bg-secondary px-2 py-1.5 text-[12px]">
          Memakai dokumen bawaan. Menyimpan perubahan pertama akan menyalin semuanya ke database.
        </p>
      )}
      {agent && (
        <details className="border-t border-border py-2" open>
          <summary className="min-h-9 cursor-pointer text-[13px] font-semibold">
            Agent: {agent.title} {agent.enabled ? "" : "(mati)"}
          </summary>
          <DocEditor key={`agent-${agent.version ?? 0}`} doc={agent} onChanged={setData} />
        </details>
      )}
      <ul className="divide-y divide-border border-t border-border">
        {skills.map((skill) => (
          <li key={`${skill.slug}-${skill.version ?? 0}`}>
            <details className="py-2">
              <summary className="min-h-9 cursor-pointer text-[13px] font-semibold">
                Skill: {skill.title}{" "}
                <span className="font-normal text-muted-foreground">
                  · {skill.slug}
                  {skill.enabled ? "" : " · mati"}
                </span>
              </summary>
              <DocEditor doc={skill} onChanged={setData} />
            </details>
          </li>
        ))}
      </ul>
      <details className="border-t border-border py-2">
        <summary className="min-h-9 cursor-pointer text-[13px] font-semibold text-brand-red">
          Tambah skill
        </summary>
        <DocEditor
          isNew
          doc={{
            kind: "skill",
            slug: "",
            title: "",
            body: "",
            enabled: true,
            triggers: { intents: [], scopes: [], keywords: [] },
          }}
          onChanged={setData}
        />
      </details>
      <div className="flex gap-2 border-t border-border pt-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Alasan memulihkan bawaan"
          aria-label="Alasan memulihkan"
          className={`${field} flex-1`}
        />
        <button
          type="button"
          disabled={reason.trim().length < 4}
          onClick={() =>
            void restoreAdminTravoDocs({ data: { reason } }).then((d) => setData(d as Loaded))
          }
          className="min-h-9 rounded-lg bg-secondary px-3 text-[13px] font-semibold disabled:opacity-40"
        >
          Pulihkan bawaan
        </button>
      </div>
    </AdminSurface>
  );
}
