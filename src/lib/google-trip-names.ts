const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function monthYear(value: string | Date | null | undefined) {
  if (!value) return null;
  const iso = value instanceof Date ? value.toISOString() : String(value);
  const match = iso.match(/^(\d{4})-(\d{2})/);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) return null;
  return `${MONTHS[month - 1]} ${match[1]}`;
}

/** Name shown for a trip in the traveler's Drive: "Bali · Des 2026", so same-named trips stay apart. */
export function tripGoogleName(name: string, departureDate?: string | Date | null) {
  const clean = name.replace(/\s+/g, " ").trim() || "Trip";
  const when = monthYear(departureDate);
  return when ? `${clean} · ${when}` : clean;
}

export const tripSheetTitle = (label: string) => `Budget - ${label}`.slice(0, 120);
