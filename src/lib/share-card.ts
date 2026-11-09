/** Client-side renderers for the 9:16 social cards shared by trips, eSIM, guides, and flights. */
import { shareGenerationTime, shareGeneratorName } from "./share-card-attribution";

export const SHARE_MASCOT_URL = "/assets/home-hero/mascot-v6.png";

const W = 1080;
const H = 1920;
const RED = "#e92d35";
const NAVY = "#101f3c";
const PAPER = "#fff8ee";
const FONT = '"Inter","SF Pro Text",system-ui,-apple-system,"Segoe UI",sans-serif';
const SERIF = '"Djiwa Story Serif",Georgia,"Times New Roman",serif';
const TOKYO_ART = "/assets/share/tokyo-illustration-v1.webp";
const SKY_ART = "/assets/share/travel-sky-illustration-v1.webp";
const CONTENT_BOTTOM = 1650;
const LEFT = 64;
const MAIN_X = 300;
const MAIN_W = W - LEFT - MAIN_X;

export type ShareCardActivity = {
  time: string;
  title: string;
  place: string;
  image: string | null;
  notes?: string | null;
  details?: string | null;
  openingHours?: string | null;
  openingHoursSource?: string | null;
  openingHoursWarning?: string | null;
  dayLabel?: string;
  dayNumber?: number;
  order?: number;
  category?: string | null;
  durationMinutes?: number | null;
};

export type ShareCardInput = {
  title: string;
  destination: string;
  dates: string;
  owner: string | null;
  link: string;
  days: number;
  activities: number;
  /** All scheduled items, already grouped chronologically. No highlights are dropped. */
  highlights: ShareCardActivity[];
  logoUrl: string;
  mascotUrl?: string;
  travelers?: number;
};

export type ShareCardActivitySource = {
  activity_date?: string | Date | null;
  start_time?: string | null;
  end_time?: string | null;
  title?: string | null;
  location?: string | null;
  notes?: string | null;
  image?: string | null;
  activity_category?: string | null;
};

/** Prepares every public itinerary item in date/time order and numbers it within its day. */
export function prepareShareCardActivities(
  items: readonly ShareCardActivitySource[],
  formatDay: (date: string) => string,
): ShareCardActivity[] {
  const rows = items
    .map((item, index) => ({ item, index, date: dateKey(item.activity_date) }))
    .sort((a, b) => {
      const byDate = (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99");
      if (byDate) return byDate;
      const aTime = clock(a.item.start_time) || "99:99";
      const bTime = clock(b.item.start_time) || "99:99";
      return aTime.localeCompare(bTime) || a.index - b.index;
    });

  const dayNumbers = new Map<string, number>();
  const orders = new Map<string, number>();
  return rows.map(({ item, date }) => {
    const dayKey = date || "__undated__";
    let dayNumber = dayNumbers.get(dayKey);
    if (!dayNumber) {
      dayNumber = dayNumbers.size + 1;
      dayNumbers.set(dayKey, dayNumber);
    }
    const order = (orders.get(dayKey) ?? 0) + 1;
    orders.set(dayKey, order);
    const start = clock(item.start_time);
    const end = clock(item.end_time);
    const time =
      start && end ? `${start}–${end}` : start || (end ? `Selesai ${end}` : "Waktu belum diatur");
    return {
      time,
      title: String(item.title ?? "").trim() || "Aktivitas",
      place: String(item.location ?? "").trim() || "Lokasi belum dicantumkan",
      notes: String(item.notes ?? "").trim() || null,
      image: item.image ?? null,
      dayLabel: date ? formatDay(date) : "Tanggal belum diatur",
      dayNumber,
      order,
      category: item.activity_category ?? null,
      durationMinutes: activityDuration(start, end),
    };
  });
}

/** Extract verified opening-hour notes from the Agenda text without losing the traveler's notes. */
export function splitActivityNotes(notes: string | null | undefined) {
  const details: string[] = [];
  let openingHours: string | null = null;
  let openingHoursSource: string | null = null;
  let openingHoursWarning: string | null = null;

  for (const line of String(notes ?? "").split(/\r?\n/)) {
    for (const fragment of line.split(/\s+[·•]\s+/)) {
      const value = fragment.trim();
      if (!value) continue;
      const hours = value.match(
        /^(?:(Mungkin tutup di jam ini:\s*)?)(?:Jam buka:\s*|Buka\s+)(.*?)(?:\s*\((OpenStreetMap)\))?$/i,
      );
      if (hours) {
        openingHours ??= normalizeHours(hours[2] ?? "");
        openingHoursSource ??= hours[3] ?? null;
        if (hours[1]) openingHoursWarning = "Periksa kecocokan jam kunjungan";
        continue;
      }
      if (/jam buka berubah/i.test(value)) {
        openingHours ??= "Cek sebelum berangkat";
        openingHoursWarning = "Jam dapat berubah menurut musim atau hari libur";
        continue;
      }
      if (/cek jam buka/i.test(value)) {
        openingHours ??= "Cek sebelum berangkat";
        const remainder = value
          .replace(/(?:Jam buka berubah menurut musim atau hari libur:\s*)?cek jam buka\.?/i, "")
          .trim();
        if (remainder) details.push(remainder);
        continue;
      }
      details.push(value);
    }
  }

  return {
    details: details.join(" · ").trim() || null,
    openingHours,
    openingHoursSource,
    openingHoursWarning,
  };
}

function dateKey(value: string | Date | null | undefined) {
  if (!value) return "";
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  return String(value).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
}

function clock(value: string | null | undefined) {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1]!.padStart(2, "0")}:${match[2]}` : "";
}

function normalizeHours(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Cek sebelum berangkat";
  if (/^tutup$/i.test(trimmed)) return "Tutup pada hari tersebut";
  return trimmed.replace(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/g, "$1–$2");
}

function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => resolve(null), 8000);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function coverDraw(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  ctx.drawImage(
    image,
    (image.width - sourceWidth) / 2,
    (image.height - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function containDraw(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function wrapText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, font: string) {
  ctx.font = font;
  const result: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      result.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) result.push(line);
      if (ctx.measureText(word).width <= maxWidth) {
        line = word;
        continue;
      }
      let fragment = "";
      for (const character of word) {
        if (fragment && ctx.measureText(`${fragment}${character}`).width > maxWidth) {
          result.push(fragment);
          fragment = character;
        } else fragment += character;
      }
      line = fragment;
    }
    if (line) result.push(line);
  }
  return result.length ? result : [""];
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  font: string,
  color: string,
  lineHeight: number,
) {
  ctx.font = font;
  ctx.fillStyle = color;
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function activityDuration(start: string, end: string): number | null {
  if (!start || !end) return null;
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const duration = (minutes(end) - minutes(start) + 1440) % 1440;
  return duration || null;
}

function durationLabel(minutes: number | null | undefined) {
  if (!minutes || minutes < 0) return "";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours} jam` : "", remainder ? `${remainder} mnt` : ""]
    .filter(Boolean)
    .join(" ");
}

const CATEGORIES: Record<string, string> = {
  attraction: "Wisata",
  museum: "Wisata",
  cafe: "Kuliner",
  restaurant: "Kuliner",
  food: "Kuliner",
  shopping: "Belanja",
  shop: "Belanja",
  nature: "Alam",
  park: "Alam",
  hotel: "Hotel",
  accommodation: "Menginap",
  airport: "Bandara",
  station: "Stasiun",
  transport: "Transportasi",
  activity: "Aktivitas",
};

type CompactRow = {
  activity: ShareCardActivity;
  title: string[];
  metadata: string[];
  note: string[];
  time: string[];
  height: number;
};
type CompactDay = { label: string; rows: CompactRow[]; height: number };
type PosterLayout = {
  days: CompactDay[];
  top: number;
  titleSize: number;
  metaSize: number;
  titleLine: number;
  metaLine: number;
};

function compactRow(
  ctx: CanvasRenderingContext2D,
  activity: ShareCardActivity,
  size: number,
): CompactRow {
  const parsed = splitActivityNotes(activity.notes);
  const time = activity.time || "Waktu belum diatur";
  const clocks = time.match(/^(\d{2}:\d{2})[–—-](\d{2}:\d{2})$/);
  const duration =
    activity.durationMinutes ?? (clocks ? activityDuration(clocks[1]!, clocks[2]!) : null);
  const hours = activity.openingHours?.trim() || parsed.openingHours;
  const warning = activity.openingHoursWarning || parsed.openingHoursWarning;
  const metaSize = size - 7;
  const titleLine = Math.round(size * 1.14);
  const metaLine = Math.round(metaSize * 1.3);
  const metadata = [
    activity.place &&
    activity.place !== "Lokasi belum dicantumkan" &&
    activity.place !== activity.title
      ? activity.place
      : "",
    activity.category ? CATEGORIES[activity.category] || activity.category : "",
    durationLabel(duration),
    hours ? (/cek/i.test(hours) ? "Cek jam buka" : `Buka ${hours}`) : "",
    warning,
  ]
    .filter(Boolean)
    .join(" · ");
  const detail = (activity.details?.trim() || parsed.details || "")
    .replace(/\s*\(Sumber:\s*[^)]+\)/gi, "")
    .trim();
  // Only optional prose is condensed. Activity names, locations, hours and the list stay complete.
  const preview = detail.length > 130 ? `${detail.slice(0, 127).replace(/\s+\S*$/, "")}…` : detail;
  const title = wrapText(ctx, activity.title || "Aktivitas", MAIN_W, `400 ${size}px ${SERIF}`);
  const meta = metadata ? wrapText(ctx, metadata, MAIN_W, `400 ${metaSize}px ${FONT}`) : [];
  const note = preview ? wrapText(ctx, preview, MAIN_W, `italic ${metaSize}px ${FONT}`) : [];
  const timeLines = wrapText(ctx, time, MAIN_X - LEFT - 24, `600 ${size - 2}px ${FONT}`);
  const textHeight = title.length * titleLine + (meta.length + note.length) * metaLine;
  return {
    activity,
    title,
    metadata: meta,
    note,
    time: timeLines,
    height: Math.max(textHeight, timeLines.length * titleLine) + 14,
  };
}

function posterLayout(
  ctx: CanvasRenderingContext2D,
  input: ShareCardInput,
  minimumTop: number,
): PosterLayout {
  for (let size = 36; size >= 29; size--) {
    const groups = new Map<string, CompactDay>();
    for (const activity of input.highlights) {
      const label = activity.dayLabel?.trim() || "Jadwal perjalanan";
      const key = `${activity.dayNumber || 1}:${label}`;
      const day = groups.get(key) || { label, rows: [], height: 68 };
      const row = compactRow(ctx, activity, size);
      day.rows.push(row);
      day.height += row.height;
      groups.set(key, day);
    }
    const days = [...groups.values()];
    const height = days.reduce((sum, day) => sum + day.height + 12, 0);
    if (height <= CONTENT_BOTTOM - minimumTop)
      return {
        days,
        top: Math.max(minimumTop, Math.min(850, CONTENT_BOTTOM - Math.max(height, 180))),
        titleSize: size,
        metaSize: size - 7,
        titleLine: Math.round(size * 1.14),
        metaLine: Math.round((size - 7) * 1.3),
      };
  }
  throw new Error(
    "Agenda terlalu panjang untuk satu gambar Story. Ringkas catatan atau pilih lebih sedikit agenda, lalu coba lagi.",
  );
}

let serifReady: Promise<void> | undefined;
async function prepareSerif() {
  if (typeof FontFace === "undefined" || !document.fonts) return;
  serifReady ??= (async () => {
    try {
      const face = await new FontFace(
        "Djiwa Story Serif",
        'url("/assets/share/dm-serif-display-v1.ttf")',
      ).load();
      document.fonts.add(face);
    } catch {
      /* A system serif keeps export available when the font cannot load. */
    }
  })();
  await serifReady;
}

function titleLayout(ctx: CanvasRenderingContext2D, title: string) {
  let size = 140;
  let lines = wrapText(
    ctx,
    title.toLocaleUpperCase("id-ID"),
    W - LEFT * 2,
    `400 ${size}px ${SERIF}`,
  );
  while (lines.length > 2 && size > 65) {
    size -= 5;
    lines = wrapText(ctx, title.toLocaleUpperCase("id-ID"), W - LEFT * 2, `400 ${size}px ${SERIF}`);
  }
  return { size, lines, bottom: 184 + lines.length * Math.round(size * 1.04) };
}

function drawBackdrop(ctx: CanvasRenderingContext2D, art: HTMLImageElement | null, height: number) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  if (art) coverDraw(ctx, art, 0, 0, W, height);
  else {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#dceaf3");
    sky.addColorStop(0.62, "#f6ece1");
    sky.addColorStop(1, PAPER);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, height);
  }
  // A light paper wash gives destination photos the same quiet poster hierarchy.
  const wash = ctx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, "rgba(255,248,238,.52)");
  wash.addColorStop(0.43, "rgba(255,248,238,.64)");
  wash.addColorStop(0.68, "rgba(255,248,238,0)");
  wash.addColorStop(0.86, "rgba(255,248,238,.08)");
  wash.addColorStop(1, PAPER);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, height);
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  input: ShareCardInput,
  logo: HTMLImageElement | null,
) {
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (logo) containDraw(ctx, logo, 425, 58, 230, 118);
  else {
    ctx.fillStyle = NAVY;
    ctx.font = `600 28px ${FONT}`;
    ctx.fillText("Djiwa Travel", W / 2, 100);
  }
  const title = titleLayout(ctx, input.title);
  drawLines(
    ctx,
    title.lines,
    W / 2,
    184,
    `400 ${title.size}px ${SERIF}`,
    NAVY,
    Math.round(title.size * 1.04),
  );
  const kickerY = title.bottom + 4;
  ctx.fillStyle = RED;
  ctx.fillRect(235, kickerY, 610, 44);
  ctx.font = `600 23px ${FONT}`;
  ctx.fillStyle = "#fffaf3";
  ctx.fillText("ITINERARY PERJALANAN", W / 2, kickerY + 8);
  const dates = wrapText(ctx, input.dates, W - LEFT * 2, `400 30px ${SERIF}`);
  const dateEnd = drawLines(ctx, dates, W / 2, kickerY + 54, `400 30px ${SERIF}`, NAVY, 34);
  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = NAVY;
  const member = input.owner?.trim()
    ? `${input.owner.trim()} · Member Djiwa Travel`
    : "Member Djiwa Travel";
  ctx.fillText(member, W / 2, dateEnd + 9);
  const stats = [
    input.travelers ? `${input.travelers} traveler` : "",
    `${input.days} hari beragenda`,
    `${input.highlights.length} aktivitas`,
  ]
    .filter(Boolean)
    .join(" · ");
  ctx.font = `400 23px ${FONT}`;
  ctx.fillText(stats, W / 2, dateEnd + 43);
  return dateEnd + 90;
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  mascot: HTMLImageElement | null,
  generator: string,
  generatedAt: string,
) {
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = NAVY;
  ctx.font = `italic 400 31px ${SERIF}`;
  ctx.fillText("Bawa Djiwamu Lebih Jauh", 440, 1692);
  ctx.fillStyle = RED;
  roundRect(ctx, 230, 1738, 490, 62, 31);
  ctx.fill();
  ctx.fillStyle = "#fffaf3";
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText("djiwatravel.com", 475, 1747);
  if (mascot) containDraw(ctx, mascot, 812, 1664, 184, 154);
  ctx.fillStyle = "#5b5c65";
  ctx.font = `400 18px ${FONT}`;
  ctx.fillText("Desain ini digenerate otomatis di aplikasi Djiwa Travel", W / 2, 1824);
  ctx.fillText(`oleh ${generator} — ${generatedAt}`, W / 2, 1852);
}

function drawAgenda(ctx: CanvasRenderingContext2D, layout: PosterLayout) {
  let y = layout.top;
  for (const day of layout.days) {
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = RED;
    ctx.font = `400 37px ${SERIF}`;
    ctx.fillText(day.label, LEFT, y);
    ctx.font = `400 22px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillStyle = "#686570";
    ctx.fillText(`${day.rows.length} aktivitas`, W - LEFT, y + 10);
    ctx.fillStyle = "#e6d5c6";
    ctx.fillRect(LEFT, y + 47, W - LEFT * 2, 1);
    y += 64;
    for (const row of day.rows) {
      ctx.textAlign = "left";
      drawLines(
        ctx,
        row.time,
        LEFT,
        y + 3,
        `600 ${layout.titleSize - 2}px ${FONT}`,
        NAVY,
        layout.titleLine,
      );
      ctx.fillStyle = RED;
      ctx.fillRect(MAIN_X - 22, y + 3, 2, Math.min(44, row.height - 12));
      let rowY = drawLines(
        ctx,
        row.title,
        MAIN_X,
        y,
        `400 ${layout.titleSize}px ${SERIF}`,
        NAVY,
        layout.titleLine,
      );
      rowY = drawLines(
        ctx,
        row.metadata,
        MAIN_X,
        rowY,
        `400 ${layout.metaSize}px ${FONT}`,
        "#4b4c59",
        layout.metaLine,
      );
      drawLines(
        ctx,
        row.note,
        MAIN_X,
        rowY,
        `italic ${layout.metaSize}px ${FONT}`,
        "#5e5360",
        layout.metaLine,
      );
      y += row.height;
    }
    y += 16;
  }
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Gambar belum dapat dibuat. Coba lagi.")),
        "image/png",
      );
    } catch {
      reject(new Error("Foto tidak dapat diekspor. Coba lagi tanpa foto tersebut."));
    }
  });
}

/** Every day and activity is composed into one compact illustrated Story. Never caches data or identity. */
export async function renderShareCard(input: ShareCardInput): Promise<Blob[]> {
  const artUrl = /\btokyo\b|東京/i.test(input.title)
    ? TOKYO_ART
    : input.highlights.find((row) => row.image)?.image;
  const [[logo, mascot, art, fallback], generator] = await Promise.all([
    Promise.all([
      loadImage(input.logoUrl),
      loadImage(input.mascotUrl ?? SHARE_MASCOT_URL),
      loadImage(artUrl),
      loadImage(SKY_ART),
    ]),
    shareGeneratorName(),
    prepareSerif(),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  // Measure header first, then give the illustration the space remaining after all agenda rows.
  const minimumTop = drawHeader(ctx, input, null) + 30;
  const layout = posterLayout(ctx, input, minimumTop);
  drawBackdrop(ctx, art ?? fallback, layout.top + 10);
  drawHeader(ctx, input, logo);
  if (layout.days.length) drawAgenda(ctx, layout);
  else {
    ctx.textAlign = "center";
    ctx.fillStyle = NAVY;
    ctx.font = `400 30px ${SERIF}`;
    ctx.fillText("Belum ada jadwal yang ditambahkan.", W / 2, 1150);
  }
  drawFooter(ctx, mascot, generator, shareGenerationTime());
  return [await canvasBlob(canvas)];
}

export type BrandCardInput = {
  kicker: string;
  title: string;
  subtitle?: string;
  lines?: string[];
  link: string;
  logoUrl: string;
  mascotUrl?: string;
};

/** The same illustrated-paper identity and fresh attribution across eSIM, guides, affiliate and flights. */
export async function renderBrandCard(input: BrandCardInput): Promise<Blob> {
  const [[logo, mascot, art], generator] = await Promise.all([
    Promise.all([
      loadImage(input.logoUrl),
      loadImage(input.mascotUrl ?? SHARE_MASCOT_URL),
      loadImage(SKY_ART),
    ]),
    shareGeneratorName(),
    prepareSerif(),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  drawBackdrop(ctx, art, 1150);
  if (logo) containDraw(ctx, logo, 425, 78, 230, 130);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = RED;
  ctx.font = `600 25px ${FONT}`;
  ctx.fillText(input.kicker.toLocaleUpperCase("id-ID"), W / 2, 330);
  const title = titleLayout(ctx, input.title);
  let y =
    drawLines(
      ctx,
      title.lines,
      W / 2,
      395,
      `400 ${title.size}px ${SERIF}`,
      NAVY,
      Math.round(title.size * 1.08),
    ) + 40;
  if (input.subtitle)
    y =
      drawLines(
        ctx,
        wrapText(ctx, input.subtitle, W - LEFT * 2, `400 32px ${FONT}`),
        W / 2,
        y,
        `400 32px ${FONT}`,
        "#4b4c59",
        42,
      ) + 40;
  if (y > CONTENT_BOTTOM)
    throw new Error("Teks terlalu panjang untuk satu gambar Story. Ringkas judul lalu coba lagi.");
  ctx.textAlign = "left";
  for (const line of input.lines ?? []) {
    const wrapped = wrapText(ctx, line, W - LEFT * 2, `400 34px ${SERIF}`);
    if (y + wrapped.length * 43 > CONTENT_BOTTOM)
      throw new Error(
        "Teks terlalu panjang untuk satu gambar Story. Ringkas pilihan lalu coba lagi.",
      );
    y = drawLines(ctx, wrapped, LEFT, y, `400 34px ${SERIF}`, NAVY, 43) + 28;
    ctx.fillStyle = "#ddcdbb";
    ctx.fillRect(LEFT, y - 12, W - LEFT * 2, 1);
  }
  drawFooter(ctx, mascot, generator, shareGenerationTime());
  return canvasBlob(canvas);
}
