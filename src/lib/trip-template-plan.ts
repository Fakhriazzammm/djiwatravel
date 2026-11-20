/**
 * Pure helpers that turn a Travo full plan (built from our own data) into a template draft:
 * agenda changes become day-based items, the budget plan becomes budget lines with a note saying
 * where each number came from. No network, no database.
 */
import type { BudgetLine } from "./trip-plan";
import type { AgendaChange } from "./trip-assistant";
import {
  cleanTemplateBudget,
  type TemplateBudget,
  type TemplateBudgetCategory,
  type TemplateItem,
} from "./trip-templates";

/** Where a number came from, so the page and Admin can tell our data from the internet. */
export type SourceKind = "fitur" | "admin" | "perkiraan" | "internet";

export type WebLine = { name: string; amountIdr: number; note: string };

const LABEL: Record<string, string> = {
  Penerbangan: "Tiket pesawat",
  "Makan & minum": "Makan",
  Transportasi: "Transportasi lokal",
  Aktivitas: "Tiket & aktivitas",
  Darurat: "Dana darurat",
};

export function templateBudgetFromPlan(input: {
  lines: readonly BudgetLine[];
  city: string;
  /** Where the city's daily costs came from (the cost table: Admin or AI, else a country default). */
  costSource: "admin" | "ai" | "default";
  flightNote: string;
  esimName: string | null;
  extra?: readonly WebLine[];
}): TemplateBudget | null {
  const costNote =
    input.costSource === "admin"
      ? `Biaya harian ${input.city} dari tim Djiwa`
      : input.costSource === "ai"
        ? `Perkiraan biaya harian ${input.city}`
        : "Perkiraan umum untuk negara ini";
  const lines: TemplateBudgetCategory[] = input.lines.map((line) => {
    const name = LABEL[line.name] ?? line.name;
    const note =
      line.name === "Penerbangan"
        ? input.flightNote
        : line.name === "eSIM & internet"
          ? `${input.esimName ?? "Paket eSIM"} dari katalog kita`
          : line.name === "Darurat"
            ? "5% cadangan dari total"
            : costNote;
    return { name, amountIdr: line.amountIdr, note };
  });
  for (const extra of input.extra ?? [])
    lines.push({ name: extra.name, amountIdr: extra.amountIdr, note: extra.note });
  return cleanTemplateBudget(lines);
}

const CATEGORY: Record<string, string> = {
  food: "kuliner",
  shopping: "belanja",
  sightseeing: "wisata",
};

const thousand = (idr: number) => Math.round(idr / 1000) * 1000;

/** Agenda changes (already checked against the map candidates) as day-based template items. */
export function itemsFromAgenda(
  agenda: readonly AgendaChange[],
  dates: readonly string[],
  city: string,
): TemplateItem[] {
  const items: TemplateItem[] = [];
  for (const change of agenda) {
    const day = dates.indexOf(change.date) + 1;
    if (day < 1) continue;
    const cost = Number(change.estimatedCostMinor);
    items.push({
      day,
      start: change.startTime,
      end: change.endTime,
      title: change.title,
      location: [change.location, city].filter(Boolean).join(", ").slice(0, 200) || null,
      category: CATEGORY[String(change.category)] ?? "wisata",
      lat: change.lat ?? null,
      lng: change.lng ?? null,
      costIdr: Number.isFinite(cost) && cost > 0 ? thousand(cost) || null : null,
    });
  }
  return items;
}

/** A readable list of what each part was built from. */
export function describeSources(input: {
  flights: "tercatat" | "bulan" | "internet" | "tidak ada";
  esim: boolean;
  costSource: "admin" | "ai" | "default";
  places: number;
  web: readonly string[];
}): string[] {
  const rows: string[] = [];
  rows.push(
    input.flights === "tercatat"
      ? "Tiket pesawat: harga tercatat di fitur tiket Djiwa"
      : input.flights === "bulan"
        ? "Tiket pesawat: tarif termurah bulan itu di fitur tiket Djiwa"
        : input.flights === "internet"
          ? "Tiket pesawat: belum tercatat di fitur kita, perkiraan dari internet"
          : "Tiket pesawat: belum ada harga, tidak dihitung",
  );
  rows.push(
    input.esim
      ? "eSIM: paket dan harga dari katalog Djiwa"
      : "eSIM: tidak ada paket, tidak dihitung",
  );
  rows.push(
    input.costSource === "admin"
      ? "Biaya harian: tabel biaya kota dari tim Djiwa"
      : input.costSource === "ai"
        ? "Biaya harian: perkiraan Travo untuk kota ini"
        : "Biaya harian: perkiraan umum negara",
  );
  rows.push(`Tempat: ${input.places} tempat dari peta Djiwa (titik koordinat nyata)`);
  for (const web of input.web) rows.push(`${web}: dari internet, cek ulang sebelum berangkat`);
  return rows;
}
