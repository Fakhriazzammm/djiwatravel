import type { ReactNode } from "react";

export type StatusTone = "neutral" | "good" | "warn" | "danger";
const toneClasses = {
  neutral: "bg-[#f4f4f5] text-[#6b6b72]",
  good: "bg-[#e8f8ed] text-[#248a3d]",
  warn: "bg-[#fff4df] text-[#9a6100]",
  danger: "bg-[#fff0ef] text-[#c7352d]",
};
export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div>
      <h2 className="font-semibold">{title}</h2>
      {detail && <p className="mt-1 text-sm text-[#8a8a91]">{detail}</p>}
    </div>
  );
}
export function DisabledSafeAction({
  children,
  reason = "Aksi aktif setelah backend dan permission tersedia.",
}: {
  children: ReactNode;
  reason?: string;
}) {
  return (
    <button
      type="button"
      disabled
      title={reason}
      className="min-h-11 cursor-not-allowed rounded-xl border border-[#e5e5ea] px-3 text-sm font-semibold text-[#a1a1a8]"
    >
      {children}
    </button>
  );
}
export function PreviewBanner() {
  return (
    <div className="mb-6 rounded-2xl border border-[#f1d9a8] bg-[#fffaf0] px-4 py-3 text-sm text-[#6b6b72]">
      <strong>Data belum tersambung:</strong> halaman ini tidak menampilkan angka atau record
      contoh.
    </div>
  );
}
export function MetricTile({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: StatusTone;
}) {
  return (
    <div
      className={`rounded-2xl border border-[#e5e5ea] p-5 ${tone === "good" ? "bg-[#f1fbf4]" : tone === "warn" ? "bg-[#fffaf0]" : tone === "danger" ? "bg-[#fff4f3]" : "bg-white"}`}
    >
      <p className="text-sm font-semibold text-[#6b6b72]">{label}</p>
      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-[#8a8a91]">{detail}</p>
    </div>
  );
}
export function PreviewTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#e5e5ea] bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[#e5e5ea] bg-[#fafafa] text-xs uppercase tracking-wide text-[#8a8a91]">
          <tr>
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap px-5 py-4 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0f0f2]">
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="whitespace-nowrap px-5 py-4 text-[#3e3e43]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
