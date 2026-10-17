/**
 * Shared shape of the Finder form.
 *
 * The form fields live in `routes/finder.tsx`, but other screens describe the form ("Jawab N
 * pertanyaan"). Keeping the count next to the field list means that copy cannot silently drift
 * when a field is added or removed.
 */

export const DURATION_OPTIONS = [7, 15, 30, 60, 90, 180] as const;

/** Destinasi, masa aktif, kebutuhan data, budget. */
export const FINDER_FIELDS = [
  { name: "destination", label: "Destinasi" },
  { name: "duration", label: "Masa aktif" },
  { name: "dataNeed", label: "Kebutuhan data" },
  { name: "budget", label: "Budget" },
] as const;

export const FINDER_FIELD_COUNT = FINDER_FIELDS.length;

/** e.g. "Jawab 4 pertanyaan, kami urutkan yang paling cocok". */
export function finderCtaCopy() {
  return `Jawab ${FINDER_FIELD_COUNT} pertanyaan, kami urutkan yang paling cocok`;
}
