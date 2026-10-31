import { AdminShell } from "@/components/admin-shell";

const bar = "rounded-full bg-muted motion-safe:animate-pulse";

/** Placeholder for the summary, filters, and records of an operational admin page. */
export function AdminLoadingContent({ label = "Memuat data admin…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-3">
      <span className="sr-only">{label}</span>
      <div
        data-testid="admin-loading-summary"
        aria-hidden="true"
        className="grid grid-cols-2 gap-3 rounded-2xl border border-border/60 bg-surface p-4 sm:grid-cols-4"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2 py-1">
            <div className={`${bar} h-3 w-20 max-w-full`} />
            <div className={`${bar} h-6 w-16 max-w-full`} />
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="space-y-3 rounded-2xl border border-border/60 bg-surface p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className={`${bar} h-5 w-32`} />
          <div className={`${bar} h-9 w-24 rounded-xl`} />
        </div>
        <div className={`${bar} h-10 w-full rounded-xl`} />
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            data-testid="admin-loading-row"
            className="flex items-center gap-3 border-t border-border/60 pt-3"
          >
            <div className={`${bar} size-10 shrink-0 rounded-xl`} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`${bar} h-3.5 w-2/5`} />
              <div className={`${bar} h-3 w-3/5`} />
            </div>
            <div className={`${bar} h-6 w-16 shrink-0`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminPendingScreen({ title = "Admin", label }: { title?: string; label?: string }) {
  return (
    <AdminShell title={title}>
      <AdminLoadingContent label={label} />
    </AdminShell>
  );
}
