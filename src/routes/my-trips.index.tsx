import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BriefcaseBusiness,
  ChevronRight,
  Plus,
  WalletCards,
  CheckSquare2,
  CalendarDays,
  Smartphone,
} from "lucide-react";
import { useState } from "react";
import { Page, btnRed, btnSoft, group, row } from "@/components/shell";
import { getMyTrips } from "@/lib/my-trips.server";
import { CustomerAuth } from "@/components/customer-auth";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";

export const Route = createFileRoute("/my-trips/")({
  loader: () => getMyTrips(),
  head: () => ({
    meta: [
      { title: "My Trips — Djiwa Travel" },
      { name: "description", content: "Rencanakan dan kelola perjalanan internasionalmu." },
    ],
  }),
  pendingComponent: () => (
    <Page>
      <h1 className="large-title pt-4">My Trips</h1>
      <div className="mt-6 h-32 animate-pulse rounded-2xl bg-secondary" />
    </Page>
  ),
  component: MyTrips,
});

const tabs = ["upcoming", "ongoing", "past"] as const;
const tabLabels = { upcoming: "Akan datang", ongoing: "Berlangsung", past: "Selesai" };
const statusLabels = { upcoming: "Akan datang", ongoing: "Sedang berjalan", past: "Selesai" };
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${value}T00:00:00`),
  );
const rupiah = (minor: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(minor / 100);

function MyTrips() {
  const trips = Route.useLoaderData();
  const { user, setUser, loading: authLoading } = useBetterAuthUser();
  const [active, setActive] = useState<(typeof tabs)[number]>("upcoming");
  const filtered = trips.filter((trip) => trip.status === active);
  return (
    <Page>
      <header className="flex items-start justify-between gap-3 pt-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-red">
            Djiwa Travel
          </p>
          <h1 className="mt-1 large-title">My Trips</h1>
          <p className="mt-2 text-sm text-muted-foreground">Rencanakan perjalananmu.</p>
        </div>
        {user && (
          <Link
            to="/my-trips/new"
            className="tap mt-1 flex size-11 items-center justify-center rounded-full bg-brand-red text-white"
            aria-label="Buat perjalanan"
          >
            <Plus className="size-5" />
          </Link>
        )}
      </header>
      <div
        className="mt-5 grid grid-cols-3 rounded-xl bg-secondary p-1"
        role="tablist"
        aria-label="Status perjalanan"
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            role="tab"
            aria-selected={active === tab}
            className={`min-h-9 rounded-lg px-2 text-[12px] font-semibold ${active === tab ? "bg-surface shadow-sm" : "text-muted-foreground"}`}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="mt-20 text-center">
          <BriefcaseBusiness className="mx-auto size-12 text-muted-foreground" strokeWidth={1.4} />
          {authLoading ? (
            <>
              <h2 className="mt-4 text-lg font-semibold">Memuat akun…</h2>
              <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
                Memeriksa sesi loginmu.
              </p>
            </>
          ) : user ? (
            <>
              <h2 className="mt-4 text-lg font-semibold">Belum ada perjalanan.</h2>
              <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
                Mulai rencanakan perjalanan pertamamu.
              </p>
              <Link to="/my-trips/new" className={`${btnRed} mx-auto mt-6 max-w-xs`}>
                Buat Perjalanan
              </Link>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-lg font-semibold">Masuk untuk melihat perjalanan.</h2>
              <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
                Login agar perjalananmu tersimpan dan bisa dikelola di sini.
              </p>
              <div className="mx-auto mt-6 max-w-xs">
                <CustomerAuth onAuthenticated={setUser} />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {filtered.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
      <section className="mt-8">
        <h2 className="mb-3 px-1 text-sm font-semibold text-muted-foreground">Akses cepat</h2>
        <div className={group}>
          <Link to="/my-esim" className={row}>
            <span className="flex items-center gap-3">
              <Smartphone className="size-5 text-brand-red" />{" "}
              <span>
                <span className="block text-sm font-semibold">My eSIM</span>
                <span className="block text-xs text-muted-foreground">
                  Kelola eSIM dan aktivasi
                </span>
              </span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </div>
      </section>
    </Page>
  );
}

function TripCard({ trip }: { trip: Awaited<ReturnType<typeof getMyTrips>>[number] }) {
  const budget = Number(trip.total_budget_minor ?? 0);
  const spent = Number(trip.spent_minor ?? 0);
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const checklist =
    trip.checklist_total > 0 ? Math.round((trip.checklist_done / trip.checklist_total) * 100) : 0;
  return (
    <Link
      to="/my-trips/$tripId"
      params={{ tripId: trip.id }}
      className="tap block rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border/50"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-brand-red-soft text-2xl">
          🌏
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="truncate text-[16px] font-bold">{trip.name}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {trip.destination_name} · {statusLabels[trip.status as keyof typeof statusLabels]}
              </p>
            </div>
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDate(String(trip.departure_date))} — {formatDate(String(trip.return_date))}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <WalletCards className="size-3.5" /> Budget
          </div>
          <p className="mt-1 text-xs font-semibold">{budget ? rupiah(budget) : "Belum diatur"}</p>
          <div className="mt-1.5 h-1.5 rounded-full bg-secondary">
            <div
              className={`h-full rounded-full ${pct > 90 ? "bg-brand-red" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CheckSquare2 className="size-3.5" /> Checklist
          </div>
          <p className="mt-1 text-xs font-semibold">
            {trip.checklist_done}/{trip.checklist_total} selesai
          </p>
          <div className="mt-1.5 h-1.5 rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${checklist}%` }} />
          </div>
        </div>
      </div>
    </Link>
  );
}
