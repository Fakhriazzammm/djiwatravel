import { Skeleton } from "@/components/ui/skeleton";

/** Preserve the shape of order and eSIM content while local orders are read. */
export function OrderLoading({ list = false, label }: { list?: boolean; label: string }) {
  const bar = "motion-reduce:animate-none";
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="mt-6">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-4">
        {!list && <Skeleton className={`h-5 w-24 ${bar}`} />}
        <div className="rounded-2xl bg-surface p-4">
          <Skeleton className={`h-4 w-2/5 ${bar}`} />
          <Skeleton className={`mt-3 h-5 w-3/4 ${bar}`} />
          <Skeleton className={`mt-3 h-3 w-1/2 ${bar}`} />
        </div>
        <div className="rounded-2xl bg-surface p-4">
          <Skeleton className={`h-4 w-1/3 ${bar}`} />
          {[0, 1, 2].map((index) => (
            <div key={index} className="mt-4 flex items-center justify-between gap-4">
              <Skeleton className={`h-3 w-2/5 ${bar}`} />
              <Skeleton className={`h-3 w-1/4 ${bar}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
