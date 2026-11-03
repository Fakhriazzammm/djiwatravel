import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { packageDataLabel } from "@/lib/package-copy";
import { bestValuePackage, defaultPackage, durationBuckets } from "@/lib/package-picker";
import type { ViewPackage } from "@/lib/package-view";
import { springSnappy } from "@/lib/motion";

const rupiah = (value: number) => `Rp${value.toLocaleString("id-ID")}`;

/**
 * Pick a package by trip length: segmented duration + radio rows + one checkout CTA.
 * The list itself comes from `getDestinationPackages`, the same reader as the destination page.
 */
export function EsimPackagePicker({
  packages,
  stockPending = false,
  onNavigate,
  footer,
}: {
  packages: ViewPackage[];
  stockPending?: boolean;
  /** Shown under the checkout button, pinned with it at the bottom of the sheet. */
  footer?: ReactNode;
  onNavigate?: () => void;
}) {
  const reduce = useReducedMotion();
  const buckets = useMemo(() => durationBuckets(packages), [packages]);
  const firstWithStock = buckets.find((bucket) => bucket.packages.some((pkg) => pkg.sellable));
  const [bucketId, setBucketId] = useState(firstWithStock?.id ?? buckets[0]?.id ?? "");
  const bucket = buckets.find((item) => item.id === bucketId) ?? buckets[0];
  const bucketPackages = bucket?.packages;
  const [selected, setSelected] = useState<string | null>(
    () => defaultPackage(bucket?.packages ?? [])?.packageCode ?? null,
  );
  useEffect(() => {
    setSelected(defaultPackage(bucketPackages ?? [])?.packageCode ?? null);
  }, [bucketPackages]);

  if (!bucket) return null;
  const best = bestValuePackage(bucket.packages)?.packageCode;
  const chosen = bucket.packages.find((pkg) => pkg.packageCode === selected && pkg.sellable);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          role="tablist"
          aria-label="Lama perjalanan"
          className="flex rounded-xl bg-secondary p-1"
        >
          {buckets.map((item) => {
            const active = item.id === bucket.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setBucketId(item.id)}
                className="tap relative min-h-11 flex-1 rounded-lg text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {active && (
                  <motion.span
                    layoutId="esim-picker-thumb"
                    transition={reduce ? { duration: 0 } : springSnappy}
                    className="absolute inset-0 rounded-lg bg-surface shadow-sm"
                  />
                )}
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div role="radiogroup" aria-label="Paket eSIM" className="mt-3 space-y-2">
          {bucket.packages.map((pkg) => {
            const checked = pkg.packageCode === selected;
            return (
              <button
                key={pkg.packageCode}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={!pkg.sellable}
                onClick={() => setSelected(pkg.packageCode)}
                className={`tap flex min-h-12 w-full items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
                  checked ? "border-brand-red bg-surface" : "border-transparent bg-secondary"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold">
                    {packageDataLabel(pkg)}
                    {pkg.packageCode === best && (
                      <span className="ml-2 rounded-md bg-brand-red-soft px-1.5 py-0.5 align-[2px] text-[10px] font-bold text-brand-red">
                        Hemat
                      </span>
                    )}
                  </span>
                  <span className="block text-[12px] text-muted-foreground">
                    {pkg.durationDays} hari
                    {!pkg.sellable ? (stockPending ? " · Memeriksa stok" : " · Habis") : ""}
                  </span>
                </span>
                <span className="text-[15px] font-bold tabular-nums">{rupiah(pkg.priceIdr)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 bg-background pt-3">
        {chosen ? (
          <Link
            to="/checkout/$id"
            params={{ id: chosen.packageCode }}
            onClick={onNavigate}
            className="tap mt-3 flex min-h-10 w-full items-center justify-center rounded-xl bg-brand-red text-[14px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Lanjut bayar · {rupiah(chosen.priceIdr)}
          </Link>
        ) : (
          <p className="mt-3 rounded-xl bg-secondary p-3 text-center text-sm text-muted-foreground">
            Belum ada paket yang bisa dibeli di rentang ini.
          </p>
        )}
        {footer}
      </div>
    </div>
  );
}
