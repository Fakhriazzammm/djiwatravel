import { useEffect, useState } from "react";
import { getDestinationPackages } from "@/lib/destination-packages.fn";
import { getHomeQuickPackages } from "@/lib/home-quick-packages.fn";
import type { HomeEsimConfig, PackageHighlight } from "@/lib/home-esim-config";
import { packageDataLabel } from "@/lib/package-copy";
import type { ViewPackage } from "@/lib/package-view";

type Destination = { code: string; flag: string; nameId: string };
type Live = { packages: ViewPackage[]; picks: { tag: string; label: string }[] };

const rupiah = (value: number) => `Rp${value.toLocaleString("id-ID")}`;
const describe = (pkg: ViewPackage) =>
  `${packageDataLabel(pkg).replace(/ data$/, "")} · ${pkg.durationDays} hari · ${rupiah(pkg.priceIdr)}${
    pkg.sellable ? "" : " (habis)"
  }`;

/**
 * Admin control for the Home quick-buy picks. Leaving a slot on "Otomatis" lets the server choose
 * (best seller by paid orders, Best Deal by lowest Rp/hari); pinning a package overrides only that
 * slot for this destination. The record is saved with the rest of the Home eSIM settings.
 */
export function AdminHomePackageHighlights({
  destinations,
  draft,
  onChange,
}: {
  destinations: Destination[];
  draft: HomeEsimConfig;
  onChange: (highlights: HomeEsimConfig["packageHighlights"]) => void;
}) {
  const [code, setCode] = useState(destinations[0]?.code.toUpperCase() ?? "");
  const [live, setLive] = useState<Live | "loading" | "error">("loading");

  useEffect(() => {
    if (!code) return;
    let current = true;
    setLive("loading");
    Promise.all([
      getDestinationPackages({ data: code }),
      getHomeQuickPackages({ data: code }),
    ]).then(
      ([all, quick]) => {
        if (!current) return;
        if (!all || !quick) {
          setLive("error");
          return;
        }
        setLive({
          packages: [...all.packages].sort((a, b) => a.priceIdr - b.priceIdr),
          picks: quick.picks.map((pick) => ({
            tag: pick.tag,
            label: `${pick.tag === "best_seller" ? "Terlaris" : "Best Deal"}: ${describe(pick.pkg)}${
              pick.pinned ? " · dipin" : " · otomatis"
            }`,
          })),
        });
      },
      () => current && setLive("error"),
    );
    return () => {
      current = false;
    };
  }, [code]);

  const pin: PackageHighlight = draft.packageHighlights[code] ?? {};
  const update = (patch: PackageHighlight) => {
    const next = { ...pin, ...patch };
    const rest = { ...draft.packageHighlights };
    delete rest[code];
    onChange(
      next.bestSellerPackageCode || next.bestDealPackageCode ? { ...rest, [code]: next } : rest,
    );
  };
  const clash =
    pin.bestSellerPackageCode !== undefined &&
    pin.bestSellerPackageCode === pin.bestDealPackageCode;
  const field = "min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm";

  return (
    <fieldset
      className="space-y-2 rounded-xl border border-border p-3"
      data-testid="admin-home-package-highlights"
    >
      <legend className="px-1 text-sm font-semibold">Paket Terlaris &amp; Best Deal</legend>
      <p className="text-xs text-muted-foreground">
        Dua paket yang tampil setelah pelanggan mengetuk negara di Beranda. Biarkan “Otomatis” agar
        server memilih (Terlaris: paling banyak dibeli 90 hari terakhir; Best Deal: Rp/hari
        terendah). Pin yang sama juga dipakai di “Pilihan tercepat” pada halaman destinasi; slot “Hemat” (paket termurah) selalu otomatis.
      </p>
      <select
        aria-label="Destinasi highlight"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        className={field}
      >
        {destinations.map((item) => (
          <option key={item.code} value={item.code.toUpperCase()}>
            {item.flag} {item.nameId}
            {draft.packageHighlights[item.code.toUpperCase()] ? " · dipin" : ""}
          </option>
        ))}
      </select>

      {live === "loading" && <p className="text-xs text-muted-foreground">Memuat paket…</p>}
      {live === "error" && (
        <p role="alert" className="text-xs text-destructive">
          Paket destinasi ini belum dapat dimuat.
        </p>
      )}
      {typeof live === "object" && (
        <>
          <ul className="space-y-0.5 rounded-lg bg-secondary/50 p-2 text-xs">
            <li className="font-semibold">Tampil di Beranda (versi tersimpan)</li>
            {live.picks.length === 0 && <li>Belum ada paket yang bisa dijual.</li>}
            {live.picks.map((pick) => (
              <li key={pick.tag}>{pick.label}</li>
            ))}
          </ul>
          {(
            [
              ["bestSellerPackageCode", "Terlaris"],
              ["bestDealPackageCode", "Best Deal"],
            ] as const
          ).map(([key, title]) => (
            <label key={key} className="block text-xs text-muted-foreground">
              {title}
              <select
                aria-label={`Paket ${title}`}
                value={pin[key] ?? ""}
                onChange={(event) => update({ [key]: event.target.value || undefined })}
                className={`${field} mt-1`}
              >
                <option value="">Otomatis</option>
                {live.packages.map((pkg) => (
                  <option key={pkg.packageCode} value={pkg.packageCode} disabled={!pkg.sellable}>
                    {describe(pkg)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {clash && (
            <p role="alert" className="text-xs text-destructive">
              Terlaris dan Best Deal harus paket yang berbeda.
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}
