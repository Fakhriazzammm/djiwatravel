import { Boxes, ChevronDown, ChevronUp, Filter, RefreshCw, Search } from "lucide-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { MetricTile, PreviewBanner, PreviewTable, StatusPill } from "@/components/admin-preview";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import {
  getCatalogPreviewProfit,
  getCatalogPreviewSellingPrice,
} from "@/lib/reseller-catalog-view";

export const Route = createFileRoute("/admin/catalog")({
  loader: async () => {
    try {
      const catalog = await getResellerCatalog();
      return { ...catalog, error: null };
    } catch (error) {
      return {
        packages: [],
        syncedAt: null,
        stale: true,
        source: "cache" as const,
        error: error instanceof Error ? error.message : "Catalog provider tidak merespons",
      };
    }
  },
  component: AdminCatalog,
});

function money(value: number) {
  return `$${(value / 10_000).toFixed(2)}`;
}
function AdminCatalog() {
  const router = useRouter();
  const catalog = Route.useLoaderData();
  const packages = catalog.packages;
  const samplePackage = packages[0];
  const [search, setSearch] = useState("");
  const [destination, setDestination] = useState("all");
  const [dataSize, setDataSize] = useState("all");
  const [validity, setValidity] = useState("all");
  const [minCost, setMinCost] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sellingOverrides, setSellingOverrides] = useState<Record<string, number>>({});
  const sellingFor = (pkg: (typeof packages)[number]) =>
    getCatalogPreviewSellingPrice(pkg, sellingOverrides);
  const profitFor = (pkg: (typeof packages)[number]) =>
    getCatalogPreviewProfit(pkg, sellingOverrides);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<"profit" | "percent" | "price">("profit");
  const [bulkValue, setBulkValue] = useState("");
  const [sortKey, setSortKey] = useState<
    "name" | "durationDays" | "providerPriceUnits" | "sellingPriceIdr"
  >("name");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const destinations = useMemo(
    () => [...new Set(packages.flatMap((pkg) => pkg.locationCodes))].sort(),
    [packages],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return packages
      .filter((pkg) => {
        const haystack = [
          pkg.name,
          pkg.packageCode,
          pkg.slug,
          pkg.locationCodes.join(" "),
          String(pkg.durationDays),
          String(pkg.volumeBytes),
        ]
          .join(" ")
          .toLowerCase();
        const sizeGb = pkg.volumeBytes / 1_000_000_000;
        const costUsd = pkg.providerPriceUnits / 10_000;
        const priceIdr = getCatalogPreviewSellingPrice(pkg, sellingOverrides);
        return (
          (!query || haystack.includes(query)) &&
          (destination === "all" || pkg.locationCodes.includes(destination)) &&
          (dataSize === "all" || sizeGb === Number(dataSize)) &&
          (validity === "all" || pkg.durationDays === Number(validity)) &&
          (!minCost || costUsd >= Number(minCost)) &&
          (!maxCost || costUsd <= Number(maxCost)) &&
          (!maxPrice || priceIdr <= Number(maxPrice))
        );
      })
      .sort((a, b) => {
        const av =
          sortKey === "name"
            ? a.name
            : sortKey === "durationDays"
              ? a.durationDays
              : sortKey === "providerPriceUnits"
                ? a.providerPriceUnits
                : getCatalogPreviewSellingPrice(a, sellingOverrides);
        const bv =
          sortKey === "name"
            ? b.name
            : sortKey === "durationDays"
              ? b.durationDays
              : sortKey === "providerPriceUnits"
                ? b.providerPriceUnits
                : getCatalogPreviewSellingPrice(b, sellingOverrides);
        const result =
          typeof av === "string" ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
        return ascending ? result : -result;
      });
  }, [
    packages,
    search,
    destination,
    dataSize,
    validity,
    minCost,
    maxCost,
    maxPrice,
    sortKey,
    ascending,
    sellingOverrides,
  ]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  function applyBulkPricing() {
    const value = Number(bulkValue);
    if (!Number.isFinite(value) || value < 0 || selected.size === 0) return;
    const next = { ...sellingOverrides };
    packages
      .filter((pkg) => selected.has(pkg.packageCode))
      .forEach((pkg) => {
        const cost = pkg.sellingPrice.providerCostIdr;
        next[pkg.packageCode] =
          bulkMode === "profit"
            ? Math.round(cost + value)
            : bulkMode === "percent"
              ? Math.round(cost * (1 + value / 100))
              : Math.round(value);
      });
    setSellingOverrides(next);
    setBulkValue("");
  }
  function toggleSelected(code: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }
  function toggleVisible() {
    const next = new Set(selected);
    const allSelected = visible.length > 0 && visible.every((pkg) => next.has(pkg.packageCode));
    visible.forEach((pkg) => {
      if (allSelected) next.delete(pkg.packageCode);
      else next.add(pkg.packageCode);
    });
    setSelected(next);
  }
  function sortBy(key: typeof sortKey) {
    setPage(1);
    if (key === sortKey) setAscending((value) => !value);
    else {
      setSortKey(key);
      setAscending(true);
    }
  }
  const SortHeader = ({ label, value }: { label: string; value: typeof sortKey }) => (
    <button
      onClick={() => sortBy(value)}
      className="inline-flex items-center gap-1 font-semibold hover:text-[#0a67c7]"
    >
      {label}
      {sortKey === value ? (
        ascending ? (
          <ChevronUp className="size-3.5" />
        ) : (
          <ChevronDown className="size-3.5" />
        )
      ) : (
        <ChevronDown className="size-3.5 opacity-30" />
      )}
    </button>
  );
  const syncLabel = catalog.syncedAt
    ? new Date(catalog.syncedAt).toLocaleString("id-ID")
    : "belum tersinkron";
  return (
    <AdminShell
      title="Catalog"
      subtitle="Katalog admin dan customer menggunakan loader eSIM Access yang sama agar package, cost, dan availability tidak bercabang."
    >
      <div className="mb-6 rounded-2xl border border-[#b9d7ff] bg-[#f0f6ff] px-4 py-3 text-sm text-[#245783]">
        <strong>Sumber live:</strong> eSIM Access API melalui reseller catalog cache.{" "}
        <span className="ml-1">
          Source: {catalog.source} · Sync: {syncLabel}
          {catalog.stale ? " · stale" : ""}
        </span>
      </div>
      {catalog.error && (
        <div className="mb-6 rounded-2xl border border-[#f1d9a8] bg-[#fffaf0] px-4 py-3 text-sm text-[#8a5a00]">
          Catalog provider belum dapat dibaca: {catalog.error}. Frontend dan admin tidak membuat
          data sendiri.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricTile
          label="Packages from eSIM Access"
          value={packages.length.toLocaleString("id-ID")}
          detail="Same source as /catalog"
          tone={packages.length ? "good" : "warn"}
        />
        <MetricTile
          label="Provider cost"
          value={samplePackage ? money(samplePackage.providerPriceUnits) : "—"}
          detail={samplePackage ? `Sample ${samplePackage.packageCode}` : "Belum tersedia"}
        />
        <MetricTile
          label="Stale/cache"
          value={catalog.stale ? "Yes" : "No"}
          detail="Provider/cache freshness"
          tone={catalog.stale ? "warn" : "good"}
        />
      </div>
      <section className="mt-6 rounded-3xl border border-[#e5e5ea] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-[#f0f6ff] p-3">
            <Boxes className="size-5 text-[#0a84ff]" />
          </div>
          <div>
            <h2 className="font-semibold">Package availability</h2>
            <p className="mt-1 text-sm text-[#8a8a91]">
              {filtered.length.toLocaleString("id-ID")} hasil dari{" "}
              {packages.length.toLocaleString("id-ID")} package.
            </p>
          </div>
          <button
            onClick={() => router.invalidate()}
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5ea] px-4 text-sm font-semibold"
          >
            <RefreshCw className="size-4" /> Refresh
          </button>
        </div>
        <div className="mt-5 rounded-2xl border border-[#e5e5ea] bg-[#fafafa] p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.5fr)_repeat(2,minmax(170px,1fr))]">
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5ea] bg-white px-3">
              <Search className="size-4 text-[#8a8a91]" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search package / code / country"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm">
              <Filter className="size-4 text-[#8a8a91]" />
              <span className="whitespace-nowrap text-[#8a8a91]">Destination</span>
              <select
                value={destination}
                onChange={(event) => {
                  setDestination(event.target.value);
                  setPage(1);
                }}
                className="min-w-0 flex-1 bg-transparent outline-none"
              >
                <option value="all">All</option>
                {destinations.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm">
              <span className="whitespace-nowrap text-[#8a8a91]">Data</span>
              <select
                value={dataSize}
                onChange={(event) => {
                  setDataSize(event.target.value);
                  setPage(1);
                }}
                className="min-w-0 flex-1 bg-transparent outline-none"
              >
                <option value="all">All sizes</option>
                <option value="1">1 GB</option>
                <option value="3">3 GB</option>
                <option value="5">5 GB</option>
                <option value="10">10 GB</option>
                <option value="30">30 GB</option>
              </select>
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(140px,1fr))_auto]">
            <label className="flex min-h-10 items-center gap-2 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm">
              <span className="text-[#8a8a91]">Validity</span>
              <select
                value={validity}
                onChange={(event) => {
                  setValidity(event.target.value);
                  setPage(1);
                }}
                className="min-w-0 flex-1 bg-transparent outline-none"
              >
                <option value="all">All days</option>
                <option value="7">7 days</option>
                <option value="15">15 days</option>
                <option value="30">30 days</option>
                <option value="35">35 days</option>
              </select>
            </label>
            <input
              value={minCost}
              onChange={(event) => {
                setMinCost(event.target.value);
                setPage(1);
              }}
              type="number"
              min="0"
              step="0.01"
              placeholder="Min cost (USD)"
              className="min-h-10 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm outline-none"
            />
            <input
              value={maxCost}
              onChange={(event) => {
                setMaxCost(event.target.value);
                setPage(1);
              }}
              type="number"
              min="0"
              step="0.01"
              placeholder="Max cost (USD)"
              className="min-h-10 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm outline-none"
            />
            <input
              value={maxPrice}
              onChange={(event) => {
                setMaxPrice(event.target.value);
                setPage(1);
              }}
              type="number"
              min="0"
              step="1000"
              placeholder="Max selling price (IDR)"
              className="min-h-10 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm outline-none"
            />
            <button
              onClick={() => {
                setSearch("");
                setDestination("all");
                setDataSize("all");
                setValidity("all");
                setMinCost("");
                setMaxCost("");
                setMaxPrice("");
                setPage(1);
              }}
              className="min-h-10 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm font-semibold text-[#0a67c7]"
            >
              Clear filters
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-[#8a8a91]">
            <span>Filters: destination · data size · validity · provider cost · selling price</span>
            <span>
              Page {page} / {totalPages}
            </span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#b9d7ff] bg-[#f0f6ff] p-3 text-sm">
          <strong>{selected.size} selected</strong>
          <span className="text-[#6b6b72]">Bulk pricing:</span>
          <select
            value={bulkMode}
            onChange={(event) => setBulkMode(event.target.value as typeof bulkMode)}
            className="min-h-10 rounded-xl border border-[#d4e6ff] bg-white px-3"
          >
            <option value="profit">Profit IDR</option>
            <option value="percent">Profit %</option>
            <option value="price">Selling price IDR</option>
          </select>
          <input
            value={bulkValue}
            onChange={(event) => setBulkValue(event.target.value)}
            type="number"
            min="0"
            step="0.01"
            placeholder={
              bulkMode === "profit"
                ? "e.g. 50000"
                : bulkMode === "percent"
                  ? "e.g. 25"
                  : "e.g. 150000"
            }
            className="min-h-10 w-44 rounded-xl border border-[#d4e6ff] bg-white px-3"
          />
          <button
            disabled={!selected.size || !bulkValue}
            onClick={applyBulkPricing}
            className="min-h-10 rounded-xl bg-[#0a84ff] px-4 font-semibold text-white disabled:opacity-40"
          >
            Apply to selected
          </button>
          <span className="text-xs text-[#5f7892]">
            Browser preview; persistence needs pricing DB/auth.
          </span>
        </div>
        <div className="mt-4">
          {visible.length ? (
            <div className="overflow-x-auto rounded-3xl border border-[#e5e5ea]">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[#e5e5ea] bg-[#fafafa] text-xs uppercase tracking-wide text-[#8a8a91]">
                  <tr>
                    <th className="px-5 py-4">
                      <input
                        type="checkbox"
                        aria-label="Select visible packages"
                        checked={
                          visible.length > 0 &&
                          visible.every((pkg) => selected.has(pkg.packageCode))
                        }
                        onChange={toggleVisible}
                      />
                    </th>
                    <th className="whitespace-nowrap px-5 py-4">
                      <SortHeader label="Package / destination" value="name" />
                    </th>
                    <th className="whitespace-nowrap px-5 py-4">
                      <SortHeader label="Validity" value="durationDays" />
                    </th>
                    <th className="whitespace-nowrap px-5 py-4">
                      <SortHeader label="Provider cost" value="providerPriceUnits" />
                    </th>
                    <th className="whitespace-nowrap px-5 py-4">
                      <SortHeader label="Selling price" value="sellingPriceIdr" />
                    </th>
                    <th className="whitespace-nowrap px-5 py-4">Profit</th>
                    <th className="whitespace-nowrap px-5 py-4">Availability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f2]">
                  {visible.map((pkg) => (
                    <tr key={pkg.packageCode} className="hover:bg-[#fafafa]">
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          aria-label={`Select ${pkg.name}`}
                          checked={selected.has(pkg.packageCode)}
                          onChange={() => toggleSelected(pkg.packageCode)}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-[#3e3e43]">{pkg.name}</p>
                        <p className="mt-1 text-xs text-[#8a8a91]">
                          {pkg.packageCode} · {pkg.locationCodes.join(", ") || "Regional"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">{pkg.durationDays} days</td>
                      <td className="whitespace-nowrap px-5 py-4">
                        {money(pkg.providerPriceUnits)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <input
                          aria-label={`Selling price for ${pkg.name}`}
                          value={sellingFor(pkg)}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value))
                              setSellingOverrides((current) => ({
                                ...current,
                                [pkg.packageCode]: value,
                              }));
                          }}
                          type="number"
                          min="0"
                          step="1000"
                          className="w-32 rounded-lg border border-[#e5e5ea] bg-white px-2 py-1"
                        />
                      </td>
                      <td
                        className={`whitespace-nowrap px-5 py-4 font-semibold ${profitFor(pkg) >= 0 ? "text-[#16803c]" : "text-[#c62828]"}`}
                      >
                        Rp {profitFor(pkg).toLocaleString("id-ID")}
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill tone="good">Provider active</StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#d5d5da] p-8 text-center text-sm text-[#6b6b72]">
              Tidak ada package yang cocok dengan search/filter.
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-[#8a8a91]">
            Menampilkan {visible.length.toLocaleString("id-ID")} dari{" "}
            {filtered.length.toLocaleString("id-ID")} hasil.
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="min-h-10 rounded-xl border border-[#e5e5ea] px-3 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
              className="min-h-10 rounded-xl border border-[#e5e5ea] px-3 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
