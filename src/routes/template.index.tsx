import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { BackBar, Page } from "@/components/shell";
import { TemplateCard } from "@/components/trip-template-ui";
import { listTemplateGallery } from "@/lib/trip-templates.fn";

type GallerySearch = { negara?: string; q?: string };

/** Template gallery: the entry point from the Home/Explore "Template" tile, like /tiket for flights. */
export const Route = createFileRoute("/template/")({
  validateSearch: (search: Record<string, unknown>): GallerySearch => {
    const out: GallerySearch = {};
    if (typeof search["negara"] === "string" && /^[A-Za-z]{2,8}$/.test(search["negara"]))
      out.negara = search["negara"].toUpperCase();
    if (typeof search["q"] === "string" && search["q"].trim())
      out.q = search["q"].trim().slice(0, 60);
    return out;
  },
  head: () => ({
    meta: [
      { title: "Template itinerary — Djiwa Travel" },
      {
        name: "description",
        content:
          "Pakai itinerary siap jalan buatan traveler lain dan Travo, lalu sesuaikan tanggalnya.",
      },
    ],
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    listTemplateGallery({ data: { country: deps.negara, q: deps.q } }).catch(() => ({
      enabled: false as const,
      templates: [],
      countries: [],
    })),
  component: TemplateGallery,
});

function TemplateGallery() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState(search.q ?? "");
  return (
    <Page>
      <BackBar
        title="Template itinerary"
        action={
          <Link
            to="/my-templates"
            className="tap inline-flex h-8 items-center gap-1 rounded-full bg-secondary px-3 text-[12px] font-semibold"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Template saya
          </Link>
        }
      />
      {!data.enabled ? (
        <p className="mt-10 text-center text-[13px] text-muted-foreground">
          Template belum tersedia saat ini.
        </p>
      ) : (
        <div className="space-y-3">
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              const { q: _drop, ...rest } = search;
              void navigate({ search: query.trim() ? { ...rest, q: query.trim() } : rest });
            }}
            className="flex h-10 items-center gap-2 rounded-xl bg-secondary px-3"
          >
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari kota atau negara"
              aria-label="Cari template"
              className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
            />
          </form>
          {data.countries.length > 0 && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
              {[{ code: "", name: "Semua", count: 0 }, ...data.countries].map((country) => {
                const active = (search.negara ?? "") === country.code;
                return (
                  <button
                    key={country.code || "all"}
                    type="button"
                    onClick={() => {
                      const { negara: _drop, ...rest } = search;
                      void navigate({
                        search: country.code ? { ...rest, negara: country.code } : rest,
                      });
                    }}
                    className={`tap shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                      active ? "bg-brand-red text-white" : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {country.name}
                  </button>
                );
              })}
            </div>
          )}
          {data.templates.length === 0 ? (
            <div className="rounded-2xl bg-surface px-4 py-8 text-center ring-1 ring-border/50">
              <p className="text-[14px] font-semibold">Belum ada template</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Jadilah yang pertama: jadikan itinerary-mu template.
              </p>
              <Link
                to="/my-templates"
                className="tap mt-3 inline-flex h-9 items-center rounded-full bg-brand-red px-4 text-[13px] font-semibold text-white"
              >
                Buat template
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {data.templates.map((template) => (
                <TemplateCard key={template.slug} template={template} />
              ))}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
