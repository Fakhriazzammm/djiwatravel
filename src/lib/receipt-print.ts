/**
 * PDF receipt generation, kept as pure helpers plus one browser entry point.
 *
 * jsPDF is imported dynamically so it never lands in the server bundle or the first paint; the
 * receipt is a text document (selectable, small, printable at A4) rather than a screenshot, which
 * keeps it legible on any device and cheap to store.
 */

export type ReceiptField = { label: string; value: string };

export type ReceiptDocument = {
  /** Brand name printed at the top. */
  brand: string;
  title: string;
  /** Order code shown under the title, already formatted for humans. */
  code: string;
  statusLabel: string;
  /** Pre-formatted rows (dates, totals and labels are formatted by the caller). */
  fields: ReceiptField[];
  /** Full LPA string for the QR code; omitted when the eSIM is not issued yet. */
  lpa?: string;
  footer: string[];
  fileName: string;
};

/** Cents-safe rupiah formatting for documents ("Rp15.000"). */
export function formatReceiptAmount(amountIdr: number): string {
  const rounded = Math.max(0, Math.round(amountIdr));
  return `Rp${rounded.toLocaleString("id-ID")}`;
}

/** "10 Oktober 2026, 21:04 WIB" — stable between server and client, no locale surprises. */
export function formatReceiptDate(timestampMs: number): string {
  const months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  // WIB is a fixed +07:00 offset, so this stays correct without a timezone database.
  const wib = new Date(timestampMs + 7 * 60 * 60 * 1000);
  const day = wib.getUTCDate();
  const month = months[wib.getUTCMonth()] ?? "";
  const year = wib.getUTCFullYear();
  const hour = String(wib.getUTCHours()).padStart(2, "0");
  const minute = String(wib.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hour}:${minute} WIB`;
}

export function safeReceiptFileName(code: string): string {
  const cleaned = code.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
  return `struk-djiwa-travel-${cleaned || "pesanan"}.pdf`;
}

/** Opens the browser print dialog (the user can choose "Save as PDF" there). */
export function printReceiptWindow(doc: Document = document): boolean {
  try {
    doc.defaultView?.print();
    return true;
  } catch {
    return false;
  }
}

/** Builds and downloads the receipt as a real PDF file. */
export async function downloadReceiptPdf(receipt: ReceiptDocument): Promise<boolean> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  let y = 64;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(receipt.brand, marginX, y);
  y += 22;
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(110);
  pdf.text(receipt.title, marginX, y);
  y += 16;
  pdf.text(`Kode pesanan: ${receipt.code}`, marginX, y);
  y += 16;
  pdf.text(`Status: ${receipt.statusLabel}`, marginX, y);
  y += 26;

  pdf.setDrawColor(200);
  pdf.line(marginX, y, 547, y);
  y += 22;

  pdf.setTextColor(20);
  for (const field of receipt.fields) {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(110);
    pdf.text(field.label, marginX, y);
    pdf.setTextColor(20);
    pdf.text(field.value, 547, y, { align: "right" });
    y += 20;
  }

  if (receipt.lpa) {
    y += 10;
    pdf.setDrawColor(200);
    pdf.line(marginX, y, 547, y);
    y += 24;
    pdf.setFont("helvetica", "bold");
    pdf.text("Panduan pasang eSIM", marginX, y);
    y += 18;
    pdf.setFont("helvetica", "normal");
    for (const step of receiptSteps()) {
      const lines = pdf.splitTextToSize(step, 470) as string[];
      pdf.text(lines, marginX + 6, y);
      y += lines.length * 15 + 4;
    }
  }

  y += 8;
  pdf.setDrawColor(200);
  pdf.line(marginX, y, 547, y);
  y += 22;
  pdf.setTextColor(110);
  pdf.setFontSize(10);
  for (const line of receipt.footer) {
    const lines = pdf.splitTextToSize(line, 499) as string[];
    pdf.text(lines, marginX, y);
    y += lines.length * 13 + 2;
  }

  pdf.save(receipt.fileName);
  return true;
}

/** Installation steps repeated inside the PDF so the file is useful on its own. */
export function receiptSteps(): string[] {
  return [
    "1. Sambungkan ke Wi-Fi, lalu buka Pengaturan.",
    "2. Pilih Seluler / Mobile Data, lalu Tambah eSIM.",
    "3. Pilih Gunakan Kode QR dan pindai kode QR pada halaman ini.",
    "4. Aktifkan eSIM dan beri label \u201cDjiwa\u201d.",
    "5. Pasang sebelum berangkat. Di negara tujuan, nyalakan Data Roaming untuk eSIM ini.",
  ];
}
