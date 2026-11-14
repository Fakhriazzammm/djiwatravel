import { formatGb } from "@/lib/travel-journey";

/** Splits "5.4 GB" into its number and unit so only the number counts up. */
export function splitQuantity(
  label: string,
): { value: number; decimals: number; unit: string } | null {
  const match = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(label.trim());
  if (!match) return null;
  const raw = match[1]!.replace(",", ".");
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return {
    value,
    decimals: raw.includes(".") ? raw.split(".")[1]!.length : 0,
    unit: match[2] ?? "",
  };
}

export const dateLabel = (value: number | null) =>
  value === null
    ? null
    : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(
        new Date(value),
      );

export const quotaLabel = (quotaBytes: number | null, unlimited: boolean) => {
  if (unlimited) return "Unlimited";
  return quotaBytes && quotaBytes > 0 ? formatGb(quotaBytes) : "Mengikuti paket";
};
