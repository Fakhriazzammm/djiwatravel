/** Client-side renderers for the 9:16 social cards shared by trips, eSIM, guides, and flights. */
export const SHARE_MASCOT_URL = "/assets/home-hero/mascot-v6.png";

const W = 1080;
const H = 1920;
const RED = "#e5393b";
const NAVY = "#142b49";
const PAPER = "#f7f5f0";
const FONT = '"Inter","SF Pro Text",system-ui,-apple-system,"Segoe UI",sans-serif';
const PHOTO_H = 620;
const PAGE_BOTTOM = H - 170;
const LEFT = 64;
const MAIN_X = 232;
const MAIN_W = 690;
const THUMB_X = 952;
const THUMB_SIZE = 64;

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
};

export type ShareCardActivitySource = {
  activity_date?: string | Date | null;
  start_time?: string | null;
  end_time?: string | null;
  title?: string | null;
  location?: string | null;
  notes?: string | null;
  image?: string | null;
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
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
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

type ActivityLayout = {
  activity: ShareCardActivity;
  order: number;
  title: string[];
  location: string[];
  details: string[];
  hours: string[];
  openingHoursWarning: string | null;
  height: number;
  continuation: boolean;
};

function activityLayout(
  ctx: CanvasRenderingContext2D,
  activity: ShareCardActivity,
  order: number,
): ActivityLayout {
  const parsed = splitActivityNotes(activity.notes);
  const details = activity.details?.trim() || parsed.details || "Belum ada keterangan tambahan";
  const hours = activity.openingHours?.trim() || parsed.openingHours || "Belum dicantumkan";
  const source = activity.openingHoursSource ?? parsed.openingHoursSource;
  const warning = activity.openingHoursWarning ?? parsed.openingHoursWarning;
  const hoursText = [`Jam buka · ${hours}`, source, warning].filter(Boolean).join(" · ");
  const title = wrapText(ctx, activity.title || "Aktivitas", MAIN_W, `600 22px ${FONT}`);
  const location = wrapText(
    ctx,
    `Lokasi · ${activity.place || "Belum dicantumkan"}`,
    MAIN_W,
    `500 16px ${FONT}`,
  );
  const detailLines = wrapText(ctx, `Keterangan · ${details}`, MAIN_W, `400 15px ${FONT}`);
  const hoursLines = wrapText(ctx, hoursText, MAIN_W, `500 15px ${FONT}`);
  const height =
    14 +
    title.length * 28 +
    5 +
    location.length * 21 +
    5 +
    detailLines.length * 20 +
    4 +
    hoursLines.length * 20 +
    14;
  return {
    activity,
    order,
    title,
    location,
    details: detailLines,
    hours: hoursLines,
    openingHoursWarning: warning,
    height,
    continuation: false,
  };
}

function activityRows(
  ctx: CanvasRenderingContext2D,
  activity: ShareCardActivity,
  order: number,
  maxHeight: number,
) {
  const layout = activityLayout(ctx, activity, order);
  if (layout.height <= maxHeight) return [layout];

  const fixedHeight =
    14 +
    layout.title.length * 28 +
    5 +
    layout.location.length * 21 +
    5 +
    layout.hours.length * 20 +
    14;
  const linesPerPart = Math.max(1, Math.floor((maxHeight - fixedHeight - 5) / 20));
  const chunks: string[][] = [];
  for (let i = 0; i < layout.details.length; i += linesPerPart) {
    chunks.push(layout.details.slice(i, i + linesPerPart));
  }
  return chunks.map((details, index) => {
    const continuation = index > 0;
    const title = continuation
      ? wrapText(ctx, `Lanjutan · ${activity.title || "Aktivitas"}`, MAIN_W, `600 22px ${FONT}`)
      : layout.title;
    const height =
      14 +
      title.length * 28 +
      5 +
      layout.location.length * 21 +
      5 +
      details.length * 20 +
      4 +
      layout.hours.length * 20 +
      14;
    return { ...layout, title, details, height, continuation };
  });
}

type StoryPage = {
  dayLabel: string;
  dayNumber: number;
  continuation: boolean;
  rows: ActivityLayout[];
};

function storyDays(activities: ShareCardActivity[]) {
  const groups = new Map<
    string,
    { dayLabel: string; dayNumber: number; activities: ShareCardActivity[] }
  >();
  activities.forEach((activity, index) => {
    const dayLabel = activity.dayLabel?.trim() || "Jadwal perjalanan";
    const dayNumber = activity.dayNumber || 1;
    const key = `${dayNumber}:${dayLabel}`;
    const day = groups.get(key) ?? { dayLabel, dayNumber, activities: [] };
    day.activities.push({ ...activity, order: activity.order || day.activities.length + 1 });
    groups.set(key, day);
  });
  return [...groups.values()];
}

function storyPages(
  ctx: CanvasRenderingContext2D,
  input: ShareCardInput,
  heroHeight: number,
): StoryPage[] {
  const days = storyDays(input.highlights);
  if (!days.length)
    return [{ dayLabel: "Belum ada agenda", dayNumber: 1, continuation: false, rows: [] }];
  const contentTop = heroHeight + 28 + 72;
  const rowCapacity = PAGE_BOTTOM - contentTop;
  const pages: StoryPage[] = [];

  for (const day of days) {
    let page: StoryPage = {
      dayLabel: day.dayLabel,
      dayNumber: day.dayNumber,
      continuation: false,
      rows: [],
    };
    let used = 0;
    const pushPage = () => {
      if (page.rows.length) pages.push(page);
      page = { dayLabel: day.dayLabel, dayNumber: day.dayNumber, continuation: true, rows: [] };
      used = 0;
    };
    for (const [index, activity] of day.activities.entries()) {
      for (const row of activityRows(ctx, activity, index + 1, rowCapacity)) {
        if (page.rows.length && used + row.height > rowCapacity) pushPage();
        page.rows.push(row);
        used += row.height;
      }
    }
    if (page.rows.length) pages.push(page);
  }
  return pages.length
    ? pages
    : [{ dayLabel: "Belum ada agenda", dayNumber: 1, continuation: false, rows: [] }];
}

function drawBrandHeader(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
  mascot: HTMLImageElement | null,
) {
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  roundRect(ctx, 48, 40, 196, 112, 22);
  ctx.fill();
  if (logo) containDraw(ctx, logo, 65, 51, 162, 90);

  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.beginPath();
  ctx.arc(930, 102, 82, 0, Math.PI * 2);
  ctx.fill();
  if (mascot) containDraw(ctx, mascot, 854, 34, 152, 136);
}

function titleLayout(ctx: CanvasRenderingContext2D, title: string, maxWidth: number) {
  let size = 58;
  let lines = wrapText(ctx, title, maxWidth, `700 ${size}px ${FONT}`);
  while (lines.length > 2 && size > 40) {
    size -= 3;
    lines = wrapText(ctx, title, maxWidth, `700 ${size}px ${FONT}`);
  }
  return { size, lines, lineHeight: Math.round(size * 1.08) };
}

function drawTripHero(
  ctx: CanvasRenderingContext2D,
  input: ShareCardInput,
  logo: HTMLImageElement | null,
  mascot: HTMLImageElement | null,
  cover: HTMLImageElement | null,
) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  if (cover) coverDraw(ctx, cover, 0, 0, W, PHOTO_H);
  else {
    ctx.fillStyle = "#243b55";
    ctx.fillRect(0, 0, W, PHOTO_H);
  }
  const fade = ctx.createLinearGradient(0, 225, 0, PHOTO_H);
  fade.addColorStop(0, "rgba(10,18,29,0.06)");
  fade.addColorStop(0.5, "rgba(10,18,29,0.48)");
  fade.addColorStop(1, "rgba(10,18,29,0.94)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, PHOTO_H);
  drawBrandHeader(ctx, logo, mascot);

  const labelY = 322;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = RED;
  ctx.font = `700 18px ${FONT}`;
  ctx.fillText("ITINERARY PERJALANAN", LEFT, labelY);

  const title = titleLayout(ctx, input.title, W - 128);
  const titleY = labelY + 38;
  const titleBottom = drawLines(
    ctx,
    title.lines,
    LEFT,
    titleY,
    `700 ${title.size}px ${FONT}`,
    "#ffffff",
    title.lineHeight,
  );
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `500 21px ${FONT}`;
  ctx.fillText(
    fitText(ctx, `${input.destination} · ${input.dates}`, W - 128, `500 21px ${FONT}`),
    LEFT,
    titleBottom + 10,
  );
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = `500 17px ${FONT}`;
  ctx.fillText(`${input.days} hari · ${input.activities} aktivitas`, LEFT, titleBottom + 42);
  return Math.max(PHOTO_H, titleBottom + 78);
}

function drawActivityRow(
  ctx: CanvasRenderingContext2D,
  row: ActivityLayout,
  y: number,
  images: Map<string, HTMLImageElement | null>,
) {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = RED;
  ctx.font = `700 19px ${FONT}`;
  ctx.fillText(String(row.order).padStart(2, "0"), LEFT, y + 12);

  const timeLines = wrapText(
    ctx,
    row.activity.time || "Waktu belum diatur",
    150,
    `600 15px ${FONT}`,
  );
  drawLines(ctx, timeLines, LEFT, y + 42, `600 15px ${FONT}`, NAVY, 20);

  let textY = drawLines(ctx, row.title, MAIN_X, y + 10, `600 22px ${FONT}`, NAVY, 28) + 3;
  textY = drawLines(ctx, row.location, MAIN_X, textY, `500 16px ${FONT}`, "#5d6470", 21) + 3;
  textY = drawLines(ctx, row.details, MAIN_X, textY, `400 15px ${FONT}`, "#464d57", 20) + 2;
  drawLines(
    ctx,
    row.hours,
    MAIN_X,
    textY,
    `500 15px ${FONT}`,
    row.openingHoursWarning ? "#9e3c39" : "#717780",
    20,
  );

  const image = row.activity.image ? images.get(row.activity.image) : null;
  if (image) {
    ctx.save();
    roundRect(ctx, THUMB_X, y + 10, THUMB_SIZE, THUMB_SIZE, 14);
    ctx.clip();
    coverDraw(ctx, image, THUMB_X, y + 10, THUMB_SIZE, THUMB_SIZE);
    ctx.restore();
  }
  ctx.fillStyle = "#dedbd4";
  ctx.fillRect(LEFT, y + row.height - 1, W - LEFT * 2, 1);
}

function drawTripStoryPage(
  ctx: CanvasRenderingContext2D,
  input: ShareCardInput,
  page: StoryPage,
  pageIndex: number,
  pageCount: number,
  heroHeight: number,
  logo: HTMLImageElement | null,
  mascot: HTMLImageElement | null,
  cover: HTMLImageElement | null,
  images: Map<string, HTMLImageElement | null>,
) {
  drawTripHero(ctx, input, logo, mascot, cover);
  const headerY = heroHeight + 28;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = RED;
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText(
    `HARI ${String(page.dayNumber).padStart(2, "0")}${page.continuation ? " · LANJUTAN" : ""} · STORY ${pageIndex + 1}/${pageCount}`,
    LEFT,
    headerY,
  );
  ctx.fillStyle = NAVY;
  ctx.font = `650 24px ${FONT}`;
  ctx.fillText(page.dayLabel, LEFT, headerY + 24);
  ctx.textAlign = "right";
  ctx.fillStyle = "#737984";
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText(`${new Set(page.rows.map((row) => row.order)).size} agenda`, W - LEFT, headerY + 31);

  let y = headerY + 70;
  if (!page.rows.length) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#737984";
    ctx.font = `500 18px ${FONT}`;
    ctx.fillText("Belum ada jadwal yang ditambahkan.", LEFT, y + 14);
  } else {
    for (const row of page.rows) {
      drawActivityRow(ctx, row, y, images);
      y += row.height;
    }
  }

  ctx.fillStyle = "#dedbd4";
  ctx.fillRect(LEFT, H - 148, W - LEFT * 2, 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#777d85";
  ctx.font = `400 13px ${FONT}`;
  ctx.fillText("Jam operasional dapat berubah; periksa kembali sebelum berangkat.", LEFT, H - 134);
  if (input.owner) {
    ctx.fillStyle = NAVY;
    ctx.font = `600 16px ${FONT}`;
    ctx.fillText(`${input.owner} · Member Djiwa Travel`, LEFT, H - 103);
  }
  ctx.fillStyle = RED;
  ctx.font = `600 16px ${FONT}`;
  ctx.fillText(fitText(ctx, input.link, W - LEFT * 2, `600 16px ${FONT}`), LEFT, H - 68);
}

function fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, font: string) {
  ctx.font = font;
  if (ctx.measureText(value).width <= maxWidth) return value;
  let result = value;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth)
    result = result.slice(0, -1);
  return `${result.trimEnd()}…`;
}

/** One image per itinerary day (and continuation slides when a day's details need the space). */
export async function renderShareCard(input: ShareCardInput): Promise<Blob[]> {
  const urls = [
    ...new Set(
      [
        input.logoUrl,
        input.mascotUrl ?? SHARE_MASCOT_URL,
        ...input.highlights.map((item) => item.image),
      ].filter(Boolean) as string[],
    ),
  ];
  const entries = await Promise.all(urls.map(async (url) => [url, await loadImage(url)] as const));
  const images = new Map(entries);
  const logo = images.get(input.logoUrl) ?? null;
  const mascot = images.get(input.mascotUrl ?? SHARE_MASCOT_URL) ?? null;
  const coverFallback = input.highlights.map((item) => item.image).find(Boolean);

  const measureCanvas = document.createElement("canvas");
  const measure = measureCanvas.getContext("2d");
  if (!measure) throw new Error("canvas unavailable");
  const title = titleLayout(measure, input.title, W - 128);
  const titleBottom = 322 + 38 + title.lines.length * title.lineHeight;
  const heroHeight = Math.max(PHOTO_H, titleBottom + 78);
  const pages = storyPages(measure, input, heroHeight);

  return Promise.all(
    pages.map(async (page, pageIndex) => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      const coverUrl = page.rows.map((row) => row.activity.image).find(Boolean) ?? coverFallback;
      const cover = coverUrl ? (images.get(coverUrl) ?? null) : null;
      drawTripStoryPage(
        ctx,
        input,
        page,
        pageIndex,
        pages.length,
        heroHeight,
        logo,
        mascot,
        cover,
        images,
      );
      return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("render failed"))),
          "image/png",
        ),
      );
    }),
  );
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

/** Branded 9:16 Story card shared by eSIM, guide, affiliate, and flight sheets. */
export async function renderBrandCard(input: BrandCardInput): Promise<Blob> {
  const [logo, mascot] = await Promise.all([
    loadImage(input.logoUrl),
    loadImage(input.mascotUrl ?? SHARE_MASCOT_URL),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ece8df";
  ctx.fillRect(0, 0, W, 12);
  drawBrandHeader(ctx, logo, mascot);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = RED;
  ctx.font = `700 17px ${FONT}`;
  ctx.fillText(input.kicker.toLocaleUpperCase("id-ID"), LEFT, 326);
  const title = titleLayout(ctx, input.title, W - 128);
  let y =
    drawLines(ctx, title.lines, LEFT, 372, `700 ${title.size}px ${FONT}`, NAVY, title.lineHeight) +
    16;
  if (input.subtitle) {
    const subtitle = wrapText(ctx, input.subtitle, W - 128, `500 24px ${FONT}`);
    y = drawLines(ctx, subtitle, LEFT, y, `500 24px ${FONT}`, "#596270", 32) + 26;
  }
  ctx.fillStyle = RED;
  roundRect(ctx, LEFT, y, 68, 5, 2);
  ctx.fill();
  y += 34;

  for (const [index, line] of (input.lines ?? []).slice(0, 6).entries()) {
    const wrapped = wrapText(ctx, line, W - 190, `500 21px ${FONT}`);
    ctx.fillStyle = RED;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(String(index + 1).padStart(2, "0"), LEFT, y + 2);
    const end = drawLines(ctx, wrapped, LEFT + 54, y, `500 21px ${FONT}`, NAVY, 29);
    y = end + 14;
    ctx.fillStyle = "#e0ddd6";
    ctx.fillRect(LEFT + 54, y, W - LEFT * 2 - 54, 1);
    y += 18;
  }

  ctx.fillStyle = "#dedbd4";
  ctx.fillRect(LEFT, H - 128, W - LEFT * 2, 1);
  ctx.fillStyle = RED;
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText(fitText(ctx, input.link, W - LEFT * 2, `600 18px ${FONT}`), LEFT, H - 95);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("render failed"))),
      "image/png",
    ),
  );
}
