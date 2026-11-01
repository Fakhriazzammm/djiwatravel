#!/usr/bin/env node
// Turns a generated mascot JPG (flat white background) into a transparent, cropped PNG.
// macOS only (uses `sips` to decode, resize and mirror).
//
// Usage: node cutout.mjs <input.jpg|png> <output.png> [--flip] [--max 240]
//   --flip  mirror horizontally (the site shows the mascot facing LEFT; the locked prompt makes
//           it face right, so production assets use --flip)
//   --max   longest edge in px of the output (default 240)

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output) {
  process.stderr.write("Usage: node cutout.mjs <input> <output.png> [--flip] [--max 240]\n");
  process.exit(1);
}
const flip = rest.includes("--flip");
const maxIndex = rest.indexOf("--max");
const max = maxIndex >= 0 ? Number(rest[maxIndex + 1]) : 240;

const work = mkdtempSync(join(tmpdir(), "mascot-"));
const big = join(work, "big.png");
execFileSync("sips", ["-Z", "700", "-s", "format", "png", input, "--out", big], { stdio: "ignore" });

const buf = readFileSync(big);
let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString("ascii", pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === "IHDR") {
    w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9];
    if (data[12]) throw new Error("Interlaced PNG is not supported");
  }
  if (type === "IDAT") idat.push(data);
  pos += 12 + len;
}
const channels = { 2: 3, 6: 4 }[colorType];
if (bitDepth !== 8 || !channels) throw new Error(`Unsupported PNG (depth ${bitDepth}, type ${colorType})`);

const raw = inflateSync(Buffer.concat(idat));
const stride = w * channels;
const px = Buffer.alloc(h * stride);
for (let y = 0; y < h; y += 1) {
  const filter = raw[y * (stride + 1)];
  for (let x = 0; x < stride; x += 1) {
    const v = raw[y * (stride + 1) + 1 + x];
    const a = x >= channels ? px[y * stride + x - channels] : 0;
    const u = y ? px[(y - 1) * stride + x] : 0;
    const c = x >= channels && y ? px[(y - 1) * stride + x - channels] : 0;
    let r;
    if (filter === 0) r = v;
    else if (filter === 1) r = v + a;
    else if (filter === 2) r = v + u;
    else if (filter === 3) r = v + ((a + u) >> 1);
    else {
      const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c);
      r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? u : c);
    }
    px[y * stride + x] = r & 255;
  }
}

// Flood-fill the near-white background from the image edges only, so white eye highlights and
// the cream tummy inside the character survive.
const alpha = new Uint8Array(w * h).fill(255);
const seen = new Uint8Array(w * h);
const queue = [];
const minChannel = (i) => Math.min(px[i * channels], px[i * channels + 1], px[i * channels + 2]);
const push = (i) => { if (!seen[i] && minChannel(i) > 228) { seen[i] = 1; queue.push(i); } };
for (let x = 0; x < w; x += 1) { push(x); push((h - 1) * w + x); }
for (let y = 0; y < h; y += 1) { push(y * w); push(y * w + w - 1); }
while (queue.length) {
  const i = queue.pop();
  alpha[i] = 0;
  const x = i % w, y = (i / w) | 0;
  if (x > 0) push(i - 1);
  if (x < w - 1) push(i + 1);
  if (y > 0) push(i - w);
  if (y < h - 1) push(i + w);
}
for (let i = 0; i < w * h; i += 1) {
  if (alpha[i] !== 255) continue;
  const x = i % w, y = (i / w) | 0;
  const near = [x > 0 && i - 1, x < w - 1 && i + 1, y > 0 && i - w, y < h - 1 && i + w];
  if (near.some((j) => j !== false && alpha[j] === 0) && minChannel(i) > 195) alpha[i] = 120;
}

let x0 = w, y0 = h, x1 = 0, y1 = 0;
for (let i = 0; i < w * h; i += 1) {
  if (alpha[i] > 40) {
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
}
const pad = 4;
x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
const out = Buffer.alloc(ch * (cw * 4 + 1));
for (let y = 0; y < ch; y += 1) {
  out[y * (cw * 4 + 1)] = 0;
  for (let x = 0; x < cw; x += 1) {
    const i = (y + y0) * w + (x + x0);
    const o = y * (cw * 4 + 1) + 1 + x * 4;
    out[o] = px[i * channels]; out[o + 1] = px[i * channels + 1]; out[o + 2] = px[i * channels + 2]; out[o + 3] = alpha[i];
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (data) => {
  let r = 0xffffffff;
  for (const byte of data) r = crcTable[(r ^ byte) & 255] ^ (r >>> 8);
  return (r ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const check = Buffer.alloc(4); check.writeUInt32BE(crc(body));
  return Buffer.concat([length, body, check]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(cw, 0); ihdr.writeUInt32BE(ch, 4); ihdr[8] = 8; ihdr[9] = 6;
const cropped = join(work, "cropped.png");
writeFileSync(cropped, Buffer.concat([buf.subarray(0, 8), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(out, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));

execFileSync("sips", ["-Z", String(max), cropped, "--out", output], { stdio: "ignore" });
if (flip) execFileSync("sips", ["-f", "horizontal", output, "--out", output], { stdio: "ignore" });
const size = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", output]).toString();
process.stdout.write(`${output}\n${size.split("\n").slice(1).join("\n").trim()}\n`);
