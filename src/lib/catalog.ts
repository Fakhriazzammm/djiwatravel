// Mock catalog = what a package sync would write into our DB.
// Supplier data stays here; UI only sees selling price via pricing engine.
import { sellingPrice } from "./pricing";

export type Destination = {
  code: string; flag: string; name: string; nameId: string; aliases: string[];
  region: string; network?: string; popular?: boolean;
};

export type Package = {
  id: string; dest: string; dataGb: number | "unlimited"; days: number;
  supplierUsd: number; topUp: boolean; activationOnConnect: boolean;
};

export const destinations: Destination[] = [
  { code: "JP", flag: "🇯🇵", name: "Japan", nameId: "Jepang", aliases: ["japan","jepang","tokyo","osaka"], region: "Asia", network: "SoftBank / KDDI", popular: true },
  { code: "SG", flag: "🇸🇬", name: "Singapore", nameId: "Singapura", aliases: ["singapore","singapura"], region: "Asia", network: "Singtel / StarHub", popular: true },
  { code: "TH", flag: "🇹🇭", name: "Thailand", nameId: "Thailand", aliases: ["thailand","bangkok"], region: "Asia", network: "AIS / TrueMove", popular: true },
  { code: "KR", flag: "🇰🇷", name: "South Korea", nameId: "Korea Selatan", aliases: ["korea","korea selatan","south korea","seoul"], region: "Asia", network: "SKT / KT", popular: true },
  { code: "CN", flag: "🇨🇳", name: "China", nameId: "Tiongkok", aliases: ["china","tiongkok","cina"], region: "Asia", popular: true },
  { code: "SA", flag: "🇸🇦", name: "Saudi Arabia", nameId: "Arab Saudi", aliases: ["saudi","arab saudi","mekkah","umroh"], region: "Timur Tengah", network: "STC / Mobily", popular: true },
  { code: "MY", flag: "🇲🇾", name: "Malaysia", nameId: "Malaysia", aliases: ["malaysia","kuala lumpur"], region: "Asia" },
  { code: "HK", flag: "🇭🇰", name: "Hong Kong", nameId: "Hong Kong", aliases: ["hong kong","hongkong"], region: "Asia" },
  { code: "TW", flag: "🇹🇼", name: "Taiwan", nameId: "Taiwan", aliases: ["taiwan","taipei"], region: "Asia" },
  { code: "AU", flag: "🇦🇺", name: "Australia", nameId: "Australia", aliases: ["australia","sydney"], region: "Oseania" },
  { code: "US", flag: "🇺🇸", name: "United States", nameId: "Amerika Serikat", aliases: ["amerika","usa","united states","as"], region: "Amerika" },
  { code: "EU", flag: "🇪🇺", name: "Europe Regional", nameId: "Eropa", aliases: ["eropa","europe","eu","schengen"], region: "Regional" },
  { code: "ASIA", flag: "🌏", name: "Asia Regional", nameId: "Asia", aliases: ["asia","regional asia"], region: "Regional" },
];

const tiers: [number | "unlimited", number, number][] = [
  [3, 7, 3.2], [5, 15, 4.9], [10, 30, 7.6], [20, 30, 11.8], ["unlimited", 15, 15.2],
];
const regionFactor: Record<string, number> = { JP: 1, SG: 0.85, TH: 0.8, KR: 1, CN: 1.1, SA: 1.4, MY: 0.8, HK: 0.95, TW: 0.95, AU: 1.3, US: 1.25, EU: 1.2, ASIA: 1.35 };

export const packages: Package[] = destinations.flatMap((d) =>
  tiers.map(([gb, days, usd]) => ({
    id: `${d.code}-${gb}-${days}`.toLowerCase(), dest: d.code, dataGb: gb, days,
    supplierUsd: +(usd * (regionFactor[d.code] ?? 1)).toFixed(2),
    topUp: gb !== "unlimited", activationOnConnect: true,
  })),
);

export const getDest = (code: string) => destinations.find((d) => d.code.toLowerCase() === code.toLowerCase());
export const getPkg = (id: string) => packages.find((p) => p.id === id);
export const pkgsFor = (code: string) => packages.filter((p) => p.dest === code.toUpperCase());
export const priceOf = (p: Package) => sellingPrice(p.supplierUsd, p.dest);
export const fromPrice = (code: string) => Math.min(...pkgsFor(code).map(priceOf));
export const gbLabel = (g: Package["dataGb"]) => (g === "unlimited" ? "Unlimited" : `${g} GB`);

export function search(q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return destinations;
  return destinations.filter((d) => [d.name, d.nameId, ...d.aliases].some((a) => a.toLowerCase().includes(s)));
}

export const topUps = [
  { id: "t3", gb: 3, supplierUsd: 2.6 }, { id: "t5", gb: 5, supplierUsd: 3.6 }, { id: "t10", gb: 10, supplierUsd: 6.4 },
];
