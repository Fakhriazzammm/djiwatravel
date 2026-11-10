/** The "Rencana perjalanan" Google Doc: the plan as a clean, printable page. Pure HTML builder. */
import type { PlanSheetState } from "./google-sheets-plan";

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const rp = (idr: number) => `Rp ${Math.round(idr).toLocaleString("id-ID").replace(/,/g, ".")}`;
const money = (minor: number, currency: string) =>
  currency === "IDR"
    ? rp(minor / 100)
    : `${currency} ${Math.round(minor / 100).toLocaleString("id-ID")}`;

const dayHeading = (date: string) =>
  new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

export const DOC_LOGO_URL = "https://djiwatravel.com/assets/brand/djiwa-logo.png";
const RED = "#D12F33";
const th = `style="background:${RED};color:#ffffff;text-align:left;padding:6px 8px;font-size:10pt"`;
const td = `style="padding:6px 8px;border-bottom:1px solid #e5e5ea;font-size:10pt;vertical-align:top"`;
const tdr = `style="padding:6px 8px;border-bottom:1px solid #e5e5ea;font-size:10pt;text-align:right"`;

/** Who made the document and when (the header and footer show it). */
export type DocMeta = { madeAt: string; by: string };

/** "Selasa, 10 November 2026 pukul 17.42 WIB": the day, date and clock time of a moment, in Jakarta. */
export function formatDocMoment(date: Date | string | number): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(d);
  return `${parts} WIB`;
}

/** The page content only (no html/body), so the print page can show the very same document. */
export function buildPlanDocBody(state: PlanSheetState, metaInput: DocMeta | string): string {
  const meta: DocMeta = typeof metaInput === "string" ? { madeAt: metaInput, by: "" } : metaInput;
  const madeAt = meta.madeAt;
  const code = state.tripId ? `DT-${state.tripId.slice(0, 8).toUpperCase()}` : "";
  const out: string[] = [];
  out.push(
    `<table style="width:100%;border-collapse:collapse;border-bottom:3px solid ${RED};margin-bottom:14px"><tr><td style="vertical-align:middle;padding-bottom:8px"><img src="${DOC_LOGO_URL}" alt="Djiwa Travel" height="40" style="height:40px;width:auto"></td><td align="right" style="vertical-align:middle;padding-bottom:8px;font-size:9pt;color:#6b7078;line-height:1.5"><b style="color:#1a1a1f;font-size:10pt">Dokumen perjalanan</b>${code ? `<br>No. ${esc(code)}` : ""}<br>Dibuat ${esc(madeAt)}</td></tr></table>`,
    `<h1 style="color:${RED};margin-bottom:2px">${esc(state.tripName)}</h1>`,
    `<p style="color:#6b7078;margin-top:0">${esc(state.destination)} · ${esc(state.dates)} · ${state.travelers} traveler</p>`,
  );
  const plan = state.plan;
  if (plan) {
    out.push(
      `<h2>Ringkasan uang <span style="font-size:10pt;color:#6b7078">(perkiraan, gaya ${esc(plan.tier)})</span></h2>`,
    );
    out.push(
      `<table style="border-collapse:collapse;width:100%"><tr><th ${th}>Kategori</th><th ${th} align="right">Perkiraan</th><th ${th}>Dasar</th></tr>`,
    );
    let total = 0;
    for (const line of plan.budget) {
      total += line.amountIdr * state.fxFromIdr;
      const shown =
        state.currency === "IDR"
          ? rp(line.amountIdr)
          : `${state.currency} ${Math.round(line.amountIdr * state.fxFromIdr).toLocaleString("id-ID")}`;
      out.push(
        `<tr><td ${td}>${esc(line.name)}</td><td ${tdr}>${shown}</td><td ${td}>${line.basis === "tercatat" ? "harga tercatat" : "perkiraan"}</td></tr>`,
      );
    }
    out.push(
      `<tr><td ${td}><b>Total</b></td><td ${tdr}><b>${state.currency === "IDR" ? rp(total) : `${state.currency} ${Math.round(total).toLocaleString("id-ID")}`}</b></td><td ${td}></td></tr></table>`,
    );
    if (state.totalMinor > 0)
      out.push(
        `<p style="color:#6b7078">Anggaran kamu: ${esc(money(state.totalMinor, state.currency))}</p>`,
      );
  }
  if (state.budgetRows?.length) {
    out.push(`<h2>Anggaran dan pengeluaran</h2>`);
    out.push(
      `<table style="border-collapse:collapse;width:100%"><tr><th ${th}>Kategori</th><th ${th} align="right">Anggaran</th><th ${th} align="right">Terpakai</th><th ${th} align="right">Sisa</th></tr>`,
    );
    let allocated = 0;
    for (const row of state.budgetRows) {
      allocated += row.allocatedMinor;
      out.push(
        `<tr><td ${td}>${esc(row.name)}</td><td ${tdr}>${esc(money(row.allocatedMinor, state.currency))}</td><td ${tdr}>${esc(money(row.spentMinor, state.currency))}</td><td ${tdr}>${esc(money(row.allocatedMinor - row.spentMinor, state.currency))}</td></tr>`,
      );
    }
    const spent = state.spentMinor ?? state.budgetRows.reduce((s, r) => s + r.spentMinor, 0);
    const total = state.totalMinor > 0 ? state.totalMinor : allocated;
    out.push(
      `<tr><td ${td}><b>Total</b></td><td ${tdr}><b>${esc(money(total, state.currency))}</b></td><td ${tdr}><b>${esc(money(spent, state.currency))}</b></td><td ${tdr}><b>${esc(money(total - spent, state.currency))}</b></td></tr></table>`,
    );
  } else if (state.totalMinor > 0 && !state.plan) {
    out.push(
      `<h2>Anggaran</h2><p>Total anggaran: ${esc(money(state.totalMinor, state.currency))}</p>`,
    );
  }
  out.push(`<h2>Itinerary</h2>`);
  if (!state.items.length) out.push(`<p>Belum ada aktivitas.</p>`);
  let current = "";
  for (const item of state.items) {
    if (item.date !== current) {
      if (current) out.push("</table>");
      current = item.date;
      out.push(
        `<h3 style="margin-bottom:4px">${esc(dayHeading(item.date))}</h3><table style="border-collapse:collapse;width:100%">`,
      );
    }
    const time = item.start ? `${item.start}${item.end ? `–${item.end}` : ""}` : "";
    const cost = item.costMinor ? money(item.costMinor, item.currency || state.currency) : "";
    out.push(
      `<tr><td ${td} width="90">${esc(time)}</td><td ${td}><b>${esc(item.title)}</b>${item.location ? `<br><span style="color:#6b7078">${esc(item.location)}</span>` : ""}${item.notes ? `<br><i>${esc(item.notes)}</i>` : ""}</td><td ${tdr} width="110">${esc(cost)}</td></tr>`,
    );
  }
  if (current) out.push("</table>");
  out.push(`<h2>Persiapan</h2>`);
  if (!state.prep.length) out.push(`<p>Belum ada item persiapan.</p>`);
  else
    out.push(
      `<ul style="list-style:none;padding-left:0">${state.prep
        .map(
          (p) =>
            `<li style="margin:3px 0">${p.done ? "☑" : "☐"} ${esc(p.title)}${p.due ? ` <span style="color:#6b7078">· ${esc(p.due)}</span>` : ""}</li>`,
        )
        .join("")}</ul>`,
    );
  if (state.bookings?.length) {
    out.push(`<h2>Booking</h2><ul>`);
    for (const b of state.bookings)
      out.push(
        `<li><b>${esc(b.title)}</b> <span style="color:#6b7078">· ${esc(b.category)}${b.reference ? ` · ref ${esc(b.reference)}` : ""}</span></li>`,
      );
    out.push("</ul>");
  }
  const r = plan?.research;
  if (plan && r && (r.outbound || r.returnLeg || r.esim)) {
    out.push(`<h2>Tiket dan transport</h2><ul>`);
    const route = r.originCode && r.destinationCode ? `${r.originCode} → ${r.destinationCode}` : "";
    if (r.outbound)
      out.push(
        `<li>Tiket pergi ${esc(route)}: ${rp(r.outbound.priceIdr)} per orang (harga terendah tercatat ${esc(r.outbound.date)}, cek lagi saat membeli)</li>`,
      );
    if (r.returnLeg)
      out.push(
        `<li>Tiket pulang: ${rp(r.returnLeg.priceIdr)} per orang (tercatat ${esc(r.returnLeg.date)})</li>`,
      );
    if (r.esim) out.push(`<li>eSIM ${esc(r.esim.name)}: ${rp(r.esim.priceIdr)} per orang</li>`);
    out.push("</ul>");
  }
  out.push(
    `<table style="width:100%;border-collapse:collapse;margin-top:26px;border-top:1px solid #d9dadf"><tr><td style="padding-top:8px;font-size:9pt;color:#6b7078;line-height:1.6"><b style="color:#1a1a1f">Djiwa Travel</b> · djiwatravel.com<br>${meta.by ? `Dibuat oleh: ${esc(meta.by)}<br>` : ""}Dibuat pada: ${esc(madeAt)}${state.tripUpdatedAt ? `<br>Data perjalanan terakhir diubah: ${esc(formatDocMoment(state.tripUpdatedAt))}` : ""}${plan ? `<br>Rencana Travo terakhir disusun: ${esc(formatDocMoment(plan.updatedAt))}` : ""}<br><span style="color:#9a9aa3">Angka bertanda perkiraan adalah taksiran, bukan harga resmi. Data yang selalu terbaru ada di aplikasi.</span></td>${code ? `<td align="right" style="vertical-align:top;padding-top:8px;font-size:9pt;color:#9a9aa3">${esc(code)}</td>` : ""}</tr></table>`,
  );
  return out.join("");
}

export function buildPlanDocHtml(state: PlanSheetState, madeAt: DocMeta | string): string {
  return `<html><head><meta charset="utf-8"><title>${esc(state.tripName)}</title></head><body style="font-family:Arial,sans-serif;color:#1a1a1f">${buildPlanDocBody(state, madeAt)}</body></html>`;
}
