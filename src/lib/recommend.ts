import { pkgsFor, type Package } from "./catalog";

// Configurable recommendation rules (GB per day by usage profile)
export const usageProfiles = {
  ringan: { label: "Ringan", desc: "Chat, Maps, browsing", gbPerDay: 0.5, fit: "Maps, WhatsApp, dan browsing ringan" },
  normal: { label: "Normal", desc: "Social media, Maps, messaging", gbPerDay: 1, fit: "Maps, WhatsApp, Instagram, browsing, dan kebutuhan perjalanan sehari-hari" },
  intensif: { label: "Intensif", desc: "Video, hotspot, kerja", gbPerDay: 2.5, fit: "streaming video, hotspot, dan kerja remote" },
} as const;
export type Usage = keyof typeof usageProfiles;

export const durations = [
  { id: "7", label: "1–7 hari", days: 7 },
  { id: "14", label: "8–14 hari", days: 14 },
  { id: "30", label: "15–30 hari", days: 30 },
  { id: "45", label: "30+ hari", days: 45 },
];

export function recommend(dest: string, days: number, usage: Usage): { best: Package; others: Package[] } {
  const all = pkgsFor(dest);
  const need = days * usageProfiles[usage].gbPerDay;
  const fits = all
    .filter((p) => p.days >= Math.min(days, 30))
    .filter((p) => p.dataGb === "unlimited" || p.dataGb >= need)
    .sort((a, b) => (a.dataGb === "unlimited" ? 1e9 : a.dataGb) - (b.dataGb === "unlimited" ? 1e9 : b.dataGb));
  const best = (fits[0] ?? all[all.length - 1])!;
  return { best, others: all.filter((p) => p.id !== best.id) };
}
