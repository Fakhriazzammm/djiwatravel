import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Page, group } from "@/components/shell";
import { search, fromPrice } from "@/lib/catalog";
import { rupiah } from "@/lib/pricing";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Cari destinasi — Djiwa Travel" },
      { name: "description", content: "Cari eSIM untuk negara atau wilayah tujuanmu." },
      { property: "og:title", content: "Cari destinasi — Djiwa Travel" },
      { property: "og:description", content: "Cari eSIM untuk negara atau wilayah tujuanmu." },
    ],
  }),
  component: Explore,
});

function Explore() {
  const [q, setQ] = useState("");
  const res = search(q);
  return (
    <Page>
      <h1 className="large-title pt-4">Explore</h1>
      <label className="mt-3 flex h-11 items-center gap-2 rounded-xl bg-surface px-3 shadow-sm">
        <Search className="size-5 text-muted-foreground" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jepang, Korea, Eropa…"
          className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground" />
      </label>
      {res.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">Belum ada untuk “{q}”. Coba nama negara lain.</p>
      ) : (
        <div className={`${group} mt-4`}>
          {res.map((d) => (
            <Link key={d.code} to="/destination/$code" params={{ code: d.code.toLowerCase() }}
              className="flex items-center gap-3 px-4 py-2.5 active:bg-secondary">
              <span className="shrink-0 text-2xl">{d.flag}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{d.nameId}</p>
                <p className="text-[12px] text-muted-foreground">Mulai {rupiah(fromPrice(d.code))}</p>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
