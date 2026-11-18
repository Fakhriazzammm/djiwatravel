/**
 * Kirim Barang documents, made in the browser: the parcel label (PNG and PDF), the customer's bill and
 * shipping proof, and the team's drop receipt, weigh sheet, batch labels and courier manifest.
 *
 * jsPDF and the QR renderer are imported on demand so they never reach the first paint or the server
 * bundle. Documents are drawn directly (text, not screenshots), so they stay small and printable.
 * The pure row builders at the top are unit-tested; the drawing code is exercised in the browser.
 */
import {
  SHIPPING_STATUS_LABEL,
  formatIdr,
  formatKg,
  labelFileName,
  type LabelData,
  type ShippingStatus,
} from "./shipping";
import { formatReceiptDate } from "./receipt-print";

/** The part of a shipment the documents need (customer view and Admin view both fit). */
export type PrintOrder = {
  code: string;
  status: ShippingStatus;
  recipientName: string;
  phone: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine: string;
  category: string;
  contents: string;
  declaredValueIdr: number;
  estimatedKg: number;
  weighedKg: number | null;
  billedKg: number | null;
  rateIdrPerKg: number;
  freightIdr: number | null;
  packingIdr: number;
  totalIdr: number | null;
  paymentExpiresAt: string | null;
  paidAt: string | null;
  courier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  createdAt: string;
};

export type DropPointInfo = { name: string; address: string; hours: string };

/* ---------------------------------------------------------------- pure rows */

const stamp = (iso: string | null) => (iso ? formatReceiptDate(Date.parse(iso)) : "-");

export const addressText = (
  o: Pick<PrintOrder, "addressLine" | "city" | "prefecture" | "postalCode">,
) => `${o.addressLine}, ${o.city}, ${o.prefecture} ${o.postalCode}`;

/** Rows of the customer's bill: what was weighed, rounded, charged and when it is due. */
export function billRows(o: PrintOrder): [string, string][] {
  return [
    ["Kode pengiriman", o.code],
    ["Penerima", o.recipientName],
    ["Alamat", addressText(o)],
    ["Isi paket", `${o.category}: ${o.contents}`],
    ["Berat timbang", o.weighedKg === null ? "-" : formatKg(o.weighedKg)],
    ["Berat ditagih (dibulatkan)", o.billedKg === null ? "-" : formatKg(o.billedKg)],
    ["Tarif per kg", formatIdr(o.rateIdrPerKg)],
    ["Ongkos kirim", formatIdr(o.freightIdr ?? 0)],
    ["Biaya packing", formatIdr(o.packingIdr)],
    ["Total", formatIdr(o.totalIdr ?? 0)],
    ["Batas pembayaran", stamp(o.paymentExpiresAt)],
    ["Dibayar", o.paidAt ? stamp(o.paidAt) : "Belum"],
  ];
}

/** Rows of the shipping proof: courier, tracking number, dates and recipient. */
export function proofRows(o: PrintOrder): [string, string][] {
  return [
    ["Kode pengiriman", o.code],
    ["Status", SHIPPING_STATUS_LABEL[o.status]],
    ["Kurir", o.courier ?? "-"],
    ["Nomor resi", o.trackingNumber ?? "-"],
    ["Dikirim", stamp(o.shippedAt)],
    ["Penerima", `${o.recipientName}, ${o.phone}`],
    ["Alamat", addressText(o)],
    ["Isi paket", `${o.category}: ${o.contents}`],
    ["Berat ditagih", o.billedKg === null ? "-" : formatKg(o.billedKg)],
  ];
}

export type ManifestRow = {
  no: number;
  code: string;
  recipient: string;
  city: string;
  contents: string;
  kg: string;
  tracking: string;
};

/** One line per parcel handed to the courier partner. */
export function manifestRows(orders: PrintOrder[]): ManifestRow[] {
  return orders.map((o, i) => ({
    no: i + 1,
    code: o.code,
    recipient: o.recipientName,
    city: `${o.city}, ${o.prefecture}`,
    contents: `${o.category}: ${o.contents}`,
    kg: o.billedKg !== null ? formatKg(o.billedKg) : `~${formatKg(o.estimatedKg)}`,
    tracking: o.trackingNumber ?? "",
  }));
}

/* ------------------------------------------------------------------ helpers */

/** jsPDF's built-in fonts cover Latin-1 only; anything else prints as "?" instead of garbage. */
const safe = (text: string) => text.replace(/[^\x20-\x7E -ÿ]/g, "?");

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function qrImage(value: string): Promise<HTMLImageElement> {
  const [{ renderToStaticMarkup }, { createElement }, { QRCodeSVG }] = await Promise.all([
    import("react-dom/server"),
    import("react"),
    import("qrcode.react"),
  ]);
  const svg = renderToStaticMarkup(
    createElement(QRCodeSVG, { value, size: 512, level: "M", marginSize: 2 }),
  );
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  return image;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const LABEL_W = 1240;
const LABEL_H = 1748; // A6 at 300 dpi

/** Draws one parcel label (A6): QR, big code, recipient, contents and where to drop it. */
async function drawLabel(label: LabelData): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_W;
  canvas.height = LABEL_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);
  ctx.setLineDash([18, 14]);
  ctx.strokeStyle = "#8a8f9c";
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, LABEL_W - 72, LABEL_H - 72);
  ctx.setLineDash([]);

  ctx.fillStyle = "#17181c";
  ctx.textAlign = "center";
  ctx.font = "700 44px Helvetica, Arial, sans-serif";
  ctx.fillText("DJIWA TRAVEL  ·  KIRIM BARANG", LABEL_W / 2, 130);

  const qr = await qrImage(label.qrValue);
  ctx.drawImage(qr, (LABEL_W - 640) / 2, 170, 640, 640);
  ctx.font = "700 112px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillText(label.code, LABEL_W / 2, 940);

  ctx.textAlign = "left";
  const x = 110;
  const width = LABEL_W - 220;
  let y = 1030;
  const block = (title: string, lines: string[]) => {
    ctx.fillStyle = "#6b7080";
    ctx.font = "600 32px Helvetica, Arial, sans-serif";
    ctx.fillText(title, x, y);
    y += 50;
    ctx.fillStyle = "#17181c";
    for (const raw of lines) {
      for (const line of wrap(ctx, safe(raw), width)) {
        ctx.fillText(line, x, y);
        y += 46;
      }
    }
    y += 26;
  };
  ctx.font = "500 40px Helvetica, Arial, sans-serif";
  ctx.strokeStyle = "#d4d7df";
  ctx.beginPath();
  ctx.moveTo(x, 985);
  ctx.lineTo(x + width, 985);
  ctx.stroke();
  block("KE", [`${label.recipientName}  ${label.phone}`, ...label.addressLines]);
  ctx.font = "500 40px Helvetica, Arial, sans-serif";
  block("ISI", [`${label.contents}  (est. ${formatKg(label.estimatedKg)})`]);
  ctx.font = "500 40px Helvetica, Arial, sans-serif";
  block("ANTAR KE", [`${label.dropPointName}, ${label.dropPointAddress}`]);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Gambar gagal dibuat"))),
      type,
      quality,
    ),
  );

/* ---------------------------------------------------------------- label out */

export async function downloadLabelPng(label: LabelData): Promise<void> {
  download(await toBlob(await drawLabel(label), "image/png"), labelFileName(label.code, "png"));
}

/** Opens the phone's share sheet with the label image when it can, else saves the PNG. */
export async function shareLabelPng(label: LabelData): Promise<void> {
  const blob = await toBlob(await drawLabel(label), "image/png");
  const file = new File([blob], labelFileName(label.code, "png"), { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Label ${label.code}` });
      return;
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
    }
  }
  download(blob, file.name);
}

/** One A6 page per label: a single parcel, or a whole batch for the drop point printer. */
export async function downloadLabelsPdf(labels: LabelData[], fileName?: string): Promise<void> {
  if (labels.length === 0) return;
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a6", orientation: "portrait" });
  for (const [i, label] of labels.entries()) {
    if (i > 0) pdf.addPage("a6", "portrait");
    const canvas = await drawLabel(label);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 105, 148);
  }
  pdf.save(
    fileName ??
      (labels.length === 1
        ? labelFileName(labels[0]!.code, "pdf")
        : `label-kirim-barang-${labels.length}-paket.pdf`),
  );
}

/* ------------------------------------------------------------- text documents */

type Pdf = InstanceType<Awaited<typeof import("jspdf")>["jsPDF"]>;

async function newDoc(
  title: string,
  code: string,
  opts: { format?: "a4" | "a5"; orientation?: "portrait" | "landscape" } = {},
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    unit: "pt",
    format: opts.format ?? "a4",
    orientation: opts.orientation ?? "portrait",
  });
  const width = pdf.internal.pageSize.getWidth();
  const margin = 44;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Djiwa Travel · Kirim Barang", margin, 56);
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(110);
  pdf.text(safe(title), margin, 76);
  if (code) pdf.text(safe(code), width - margin, 76, { align: "right" });
  pdf.setDrawColor(200);
  pdf.line(margin, 90, width - margin, 90);
  pdf.setTextColor(20);
  return { pdf, width, margin, y: 116 };
}

function rows(
  doc: { pdf: Pdf; width: number; margin: number; y: number },
  list: [string, string][],
  labelWidth = 150,
) {
  const { pdf, width, margin } = doc;
  pdf.setFontSize(10.5);
  for (const [label, value] of list) {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(110);
    pdf.text(safe(label), margin, doc.y);
    pdf.setTextColor(20);
    const lines = pdf.splitTextToSize(safe(value), width - margin * 2 - labelWidth) as string[];
    pdf.text(lines, margin + labelWidth, doc.y);
    doc.y += Math.max(1, lines.length) * 14 + 6;
  }
}

function footer(doc: { pdf: Pdf; margin: number; width: number; y: number }, lines: string[]) {
  const { pdf, margin, width } = doc;
  doc.y += 6;
  pdf.setDrawColor(200);
  pdf.line(margin, doc.y, width - margin, doc.y);
  doc.y += 18;
  pdf.setFontSize(9);
  pdf.setTextColor(110);
  for (const line of lines) {
    const wrapped = pdf.splitTextToSize(safe(line), width - margin * 2) as string[];
    pdf.text(wrapped, margin, doc.y);
    doc.y += wrapped.length * 12 + 2;
  }
}

/** Customer: the bill after weighing. */
export async function downloadBillPdf(o: PrintOrder): Promise<void> {
  const doc = await newDoc("Rincian tagihan pengiriman", o.code);
  rows(doc, billRows(o));
  footer(doc, [
    "Ongkos kirim = berat ditagih x tarif per kg. Berat timbang dibulatkan ke atas sesuai aturan layanan.",
    "Pembayaran lewat Mayar dari halaman pengiriman di aplikasi Djiwa Travel.",
  ]);
  doc.pdf.save(`tagihan-${o.code}.pdf`);
}

/** Customer: proof the parcel was handed to the courier. */
export async function downloadProofPdf(o: PrintOrder): Promise<void> {
  const doc = await newDoc("Bukti pengiriman", o.code);
  rows(doc, proofRows(o));
  footer(doc, [
    "Dokumen ini dibuat dari catatan Djiwa Travel. Lacak paket dengan nomor resi di situs kurir.",
  ]);
  doc.pdf.save(`bukti-pengiriman-${o.code}.pdf`);
}

/** Admin: slip handed to a customer who brings the parcel in person. */
export async function downloadDropReceiptPdf(o: PrintOrder, point: DropPointInfo): Promise<void> {
  const doc = await newDoc("Tanda terima paket", o.code, { format: "a5" });
  rows(
    doc,
    [
      ["Kode pengiriman", o.code],
      ["Diterima di", `${point.name}, ${point.address}`],
      ["Waktu terima", formatReceiptDate(Date.now())],
      ["Penerima di Jepang", `${o.recipientName}, ${addressText(o)}`],
      ["Isi paket", `${o.category}: ${o.contents}`],
      ["Estimasi berat", formatKg(o.estimatedKg)],
    ],
    110,
  );
  doc.y += 28;
  doc.pdf.setFontSize(10);
  doc.pdf.text("Petugas drop point", doc.margin, doc.y);
  doc.pdf.text("Pengantar", doc.width / 2 + 10, doc.y);
  doc.y += 56;
  doc.pdf.line(doc.margin, doc.y, doc.margin + 150, doc.y);
  doc.pdf.line(doc.width / 2 + 10, doc.y, doc.width / 2 + 160, doc.y);
  footer(doc, ["Berat akhir dan tagihan menyusul setelah paket ditimbang."]);
  doc.pdf.save(`tanda-terima-${o.code}.pdf`);
}

async function loadPhoto(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Admin: the weigh sheet with the proof photos and signature lines. */
export async function downloadWeighSheetPdf(o: PrintOrder, photoUrls: string[]): Promise<void> {
  const doc = await newDoc("Lembar timbang", o.code);
  rows(doc, [
    ["Kode pengiriman", o.code],
    ["Penerima", `${o.recipientName}, ${o.city}, ${o.prefecture}`],
    ["Isi paket", `${o.category}: ${o.contents}`],
    ["Estimasi berat", formatKg(o.estimatedKg)],
    ["Berat timbang", o.weighedKg === null ? "........... kg" : formatKg(o.weighedKg)],
    ["Berat ditagih", o.billedKg === null ? "........... kg" : formatKg(o.billedKg)],
    ["Biaya packing", o.totalIdr === null ? "Rp ..........." : formatIdr(o.packingIdr)],
    [
      "Cocok dengan foto?",
      "[  ] Ya     [  ] Tidak, catatan: ......................................",
    ],
  ]);
  let x = doc.margin;
  const size = 120;
  for (const url of photoUrls.slice(0, 4)) {
    const data = await loadPhoto(url);
    if (!data) continue;
    doc.pdf.addImage(data, "JPEG", x, doc.y, size, size);
    x += size + 10;
  }
  if (photoUrls.length > 0) doc.y += size + 18;
  doc.pdf.setFontSize(10);
  doc.pdf.text("Petugas penimbang", doc.margin, doc.y + 30);
  doc.pdf.line(doc.margin, doc.y + 84, doc.margin + 170, doc.y + 84);
  doc.pdf.save(`lembar-timbang-${o.code}.pdf`);
}

/** Admin: the list handed to the courier partner, to be signed by both sides. */
export async function downloadManifestPdf(
  orders: PrintOrder[],
  point: DropPointInfo,
  courier: string,
): Promise<void> {
  const doc = await newDoc("Manifest serah terima ke kurir", courier, {
    orientation: "landscape",
  });
  const { pdf, width, margin } = doc;
  pdf.setFontSize(10);
  pdf.text(safe(`Dari: ${point.name}, ${point.address}`), margin, doc.y);
  pdf.text(`Tanggal: ${formatReceiptDate(Date.now())}`, width - margin, doc.y, { align: "right" });
  doc.y += 22;
  const cols: [string, number][] = [
    ["No", 28],
    ["Kode", 90],
    ["Penerima", 130],
    ["Kota", 110],
    ["Isi", 190],
    ["Berat", 50],
    ["Resi", 120],
  ];
  const header = () => {
    let cx = margin;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    for (const [name, w] of cols) {
      pdf.text(name, cx, doc.y);
      cx += w;
    }
    pdf.setDrawColor(200);
    pdf.line(margin, doc.y + 5, width - margin, doc.y + 5);
    doc.y += 20;
    pdf.setFont("helvetica", "normal");
  };
  header();
  const height = pdf.internal.pageSize.getHeight();
  for (const r of manifestRows(orders)) {
    if (doc.y > height - 120) {
      pdf.addPage();
      doc.y = 60;
      header();
    }
    const cells = [String(r.no), r.code, r.recipient, r.city, r.contents, r.kg, r.tracking];
    let cx = margin;
    let rowHeight = 14;
    cells.forEach((cell, i) => {
      const w = cols[i]![1];
      const lines = pdf.splitTextToSize(safe(cell), w - 8) as string[];
      pdf.text(lines, cx, doc.y);
      rowHeight = Math.max(rowHeight, lines.length * 12);
      cx += w;
    });
    doc.y += rowHeight + 6;
  }
  if (doc.y > height - 110) {
    pdf.addPage();
    doc.y = 70;
  }
  doc.y += 28;
  pdf.setFontSize(10);
  pdf.text(`Total paket: ${orders.length}`, margin, doc.y);
  doc.y += 30;
  pdf.text("Petugas Djiwa Travel", margin, doc.y);
  pdf.text(safe(`Kurir (${courier})`), width / 2, doc.y);
  pdf.line(margin, doc.y + 52, margin + 170, doc.y + 52);
  pdf.line(width / 2, doc.y + 52, width / 2 + 170, doc.y + 52);
  pdf.save(`manifest-${courier.replace(/[^A-Za-z0-9]+/g, "-")}-${orders.length}-paket.pdf`);
}
