import type { getOpsMe, listBatches, scanOps } from "@/lib/shipping-ops.fn";

export type OpsMe = Awaited<ReturnType<typeof getOpsMe>>;
export type ScanResult = Awaited<ReturnType<typeof scanOps>>;
export type BatchList = Awaited<ReturnType<typeof listBatches>>;
export type BatchSlim = BatchList["open"][number];

export const bigBtn =
  "tap inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-[14px] font-semibold disabled:opacity-50";
export const field =
  "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-[15px] outline-none focus:border-brand-red";
