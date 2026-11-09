/** Client-only renderer: draws the shared itinerary as a 1080×1920 story image (PNG). */
export type ShareCardActivity = {
  time: string;
  title: string;
  place: string;
  image: string | null;
};
export type ShareCardInput = {
  title: string;
  destination: string;
  dates: string;
  owner: string | null;
  link: string;
  days: number;
  activities: number;
  highlights: ShareCardActivity[];
  logoUrl: string;
};

const W = 1080;
const H = 1920;
const RED = "#e5393b";

function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function coverDraw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  const font = '"Inter","SF Pro Text",system-ui,-apple-system,"Segoe UI",sans-serif';

  const shown = input.highlights.slice(0, 6);
  const [logo, ...images] = await Promise.all([
    loadImage(input.logoUrl),
    ...shown.map((item) => loadImage(item.image)),
  ]);
  const cover = images.find(Boolean) ?? null;

  ctx.fillStyle = "#101114";
  ctx.fillRect(0, 0, W, H);

  // Cover
  const coverH = 700;
  if (cover) {
    coverDraw(ctx, cover, 0, 0, W, coverH);
  } else {
    ctx.fillStyle = "#1c1e24";
    ctx.fillRect(0, 0, W, coverH);
  }
  const fade = ctx.createLinearGradient(0, coverH * 0.35, 0, coverH);
  fade.addColorStop(0, "rgba(16,17,20,0)");
  fade.addColorStop(1, "rgba(16,17,20,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, coverH);

  // Original logo (full colour) with a soft white halo so it reads on any photo.
  if (logo) {
    const lh = 120;
    const lw = (logo.width / logo.height) * lh;
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.95)";
    ctx.shadowBlur = 28;
    ctx.drawImage(logo, 56, 56, lw, lh);
    ctx.drawImage(logo, 56, 56, lw, lh);
    ctx.restore();
  }

  // Title block
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = RED;
  ctx.font = `700 30px ${font}`;
  ctx.fillText("ITINERARY PERJALANAN", 64, 470);
  ctx.fillStyle = "#fff";
  ctx.font = `800 92px ${font}`;
  ctx.fillText(fit(ctx, input.title, W - 128), 64, 570);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = `500 36px ${font}`;
  ctx.fillText(fit(ctx, `${input.destination} · ${input.dates}`, W - 128), 64, 628);
  ctx.font = `500 32px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText(`${input.days} hari · ${input.activities} aktivitas`, 64, 676);

  // Activities
  let y = 740;
  const rowH = 150;
  shown.forEach((item, index) => {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundRect(ctx, 56, y, W - 112, rowH - 16, 28);
    ctx.fill();
    const img = images[index];
    ctx.save();
    roundRect(ctx, 72, y + 16, 102, 102, 20);
    ctx.clip();
    if (img) {
      coverDraw(ctx, img, 72, y + 16, 102, 102);
    } else {
      ctx.fillStyle = "rgba(229,57,59,0.22)";
      ctx.fillRect(72, y + 16, 102, 102);
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.arc(123, y + 67, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.font = `700 38px ${font}`;
    ctx.fillText(fit(ctx, item.title, W - 112 - 150 - 40), 198, y + 62);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `500 30px ${font}`;
    const meta = [item.time, item.place].filter(Boolean).join(" · ");
    ctx.fillText(fit(ctx, meta, W - 112 - 150 - 40), 198, y + 108);
    y += rowH;
  });
  const extra = input.activities - shown.length;
  if (extra > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `600 32px ${font}`;
    ctx.fillText(`+ ${extra} aktivitas lainnya`, 64, y + 40);
  }

  // Footer: member + link
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `500 30px ${font}`;
  if (input.owner)
    ctx.fillText(fit(ctx, `${input.owner} · Member Djiwa Travel`, W - 128), 64, H - 150);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `500 20px ${font}`;
  ctx.fillText(fit(ctx, input.link, W - 128), 64, H - 96);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("render failed"))),
      "image/png",
    ),
  );
}

export type BrandCardInput = {
  kicker: string;
  title: string;
  subtitle?: string;
  lines?: string[];
  link: string;
  logoUrl: string;
};

/** Simple 1080×1920 brand story card for things without a photo itinerary (eSIM, tickets, …). */
export async function renderBrandCard(input: BrandCardInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  const font = '"Inter","SF Pro Text",system-ui,-apple-system,"Segoe UI",sans-serif';
  const logo = await loadImage(input.logoUrl);

  ctx.fillStyle = "#101114";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 520, 40, W / 2, 520, 760);
  glow.addColorStop(0, "rgba(229,57,59,0.35)");
  glow.addColorStop(1, "rgba(229,57,59,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  if (logo) {
    const lh = 150;
    const lw = (logo.width / logo.height) * lh;
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.9)";
    ctx.shadowBlur = 28;
    ctx.drawImage(logo, (W - lw) / 2, 300, lw, lh);
    ctx.drawImage(logo, (W - lw) / 2, 300, lw, lh);
    ctx.restore();
  }

  ctx.textAlign = "center";
  ctx.fillStyle = RED;
  ctx.font = `700 32px ${font}`;
  ctx.fillText(input.kicker.toUpperCase(), W / 2, 640);
  ctx.fillStyle = "#fff";
  ctx.font = `800 88px ${font}`;
  const words = input.title.split(" ");
  const rows: string[] = [];
  let row = "";
  for (const word of words) {
    const next = row ? `${row} ${word}` : word;
    if (ctx.measureText(next).width > W - 160 && row) {
      rows.push(row);
      row = word;
    } else row = next;
  }
  if (row) rows.push(row);
  rows.slice(0, 3).forEach((line, index) => ctx.fillText(line, W / 2, 750 + index * 104));
  let y = 750 + Math.min(rows.length, 3) * 104 + 20;
  if (input.subtitle) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = `500 40px ${font}`;
    ctx.fillText(fit(ctx, input.subtitle, W - 160), W / 2, y);
    y += 80;
  }
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `500 34px ${font}`;
  for (const line of (input.lines ?? []).slice(0, 4)) {
    ctx.fillText(fit(ctx, line, W - 160), W / 2, y);
    y += 56;
  }
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `500 22px ${font}`;
  ctx.fillText(fit(ctx, input.link, W - 128), W / 2, H - 110);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("render failed"))),
      "image/png",
    ),
  );
}
