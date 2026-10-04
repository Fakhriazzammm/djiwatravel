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
      <h1 className="large-title pt-6">Explore</h1>
      <label className="mt-4 flex h-12 items-center gap-2 rounded-xl bg-secondary px-3">
        <Search className="size-5 text-muted-foreground" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jepang, Korea, Eropa…"
          className="flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted-foreground" />
      </label>
      {res.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">Belum ada untuk “{q}”. Coba nama negara lain.</p>
      ) : (
        <div className={`${group} mt-5`}>
          {res.map((d) => (
            <Link key={d.code} to="/destination/$code" params={{ code: d.code.toLowerCase() }}
              className="flex items-center gap-3 px-4 py-3 active:bg-secondary">
              <span className="text-3xl">{d.flag}</span>
              <div className="flex-1">
                <p className="font-medium">{d.nameId}</p>
                <p className="text-sm text-muted-foreground">Mulai {rupiah(fromPrice(d.code))}</p>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
