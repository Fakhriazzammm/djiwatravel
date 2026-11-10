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

const RED = "#D12F33";
const th = `style="background:${RED};color:#ffffff;text-align:left;padding:6px 8px;font-size:10pt"`;
const td = `style="padding:6px 8px;border-bottom:1px solid #e5e5ea;font-size:10pt;vertical-align:top"`;
const tdr = `style="padding:6px 8px;border-bottom:1px solid #e5e5ea;font-size:10pt;text-align:right"`;

export function buildPlanDocHtml(state: PlanSheetState, madeAt: string): string {
  const out: string[] = [];
  out.push(
    `<html><head><meta charset="utf-8"><title>${esc(state.tripName)}</title></head><body style="font-family:Arial,sans-serif;color:#1a1a1f">`,
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
    `<p style="color:#9a9aa3;font-size:9pt;margin-top:24px">Dibuat Travo dari Djiwa Travel pada ${esc(madeAt)}. Angka bertanda perkiraan adalah taksiran, bukan harga resmi. Data yang hidup ada di Google Spreadsheet perjalanan ini.</p></body></html>`,
  );
  return out.join("");
}
