import { MoneyInput } from "@/components/money-input";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BackBar, Page, btnRed, group, label, row } from "@/components/shell";
import { postTrip } from "@/lib/my-trips.fn";
import { getGuestTripStatus } from "@/lib/guest-trips.fn";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import { CustomerAuth } from "@/components/customer-auth";
import { TripCountryPicker } from "@/components/trip-country-picker";
import { tripCurrencyFor } from "@/lib/trip-countries";
import { FlightPlaceField } from "@/components/flight-place-field";
import type { FlightPlace } from "@/lib/flights";

export const Route = createFileRoute("/my-trips/new")({
  loader: () => getGuestTripStatus(),
  component: NewTrip,
});

function NewTrip() {
  const navigate = useNavigate();
  const guest = Route.useLoaderData();
  const { user, loading: authLoading } = useBetterAuthUser();
  // A guest without a remaining free trip sees the login CTA here, not a failed save.
  const guestBlocked = !user && !authLoading && guest.remaining <= 0;
  const [form, setForm] = useState({
    name: "",
    destinationName: "Jepang",
    destinationCode: "JP",
    departureDate: "",
    returnDate: "",
    travelersCount: 1,
    primaryCurrency: "IDR" as "IDR" | "JPY" | "USD" | "SGD" | "KRW",
    totalBudgetMinor: 0,
    timezone: "",
  });
  const [origin, setOrigin] = useState<FlightPlace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const update = (key: string, value: string | number) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const trip = await postTrip({
        data: {
          ...form,
          ...(origin ? { originName: origin.name, originCode: origin.code } : {}),
        },
      });
      await navigate({ to: "/my-trips/$tripId", params: { tripId: trip.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Perjalanan belum dapat disimpan.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Page>
      <BackBar title="Buat Perjalanan" />
      <form onSubmit={submit} className="space-y-3">
        <div>
          <h1 className="text-[22px] font-bold">Perjalanan baru</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Simpan rencana perjalananmu di satu tempat.
          </p>
        </div>
        {!user && !authLoading && (
          <section className="rounded-2xl bg-surface px-3 py-2.5 ring-1 ring-border/50">
            {guestBlocked ? (
              <>
                <p className="text-[14px] font-semibold">Perjalanan gratis sudah terpakai</p>
                <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">
                  Masuk atau daftar untuk membuat perjalanan lagi.
                </p>
                <div className="mt-2">
                  <CustomerAuth size="compact" />
                </div>
              </>
            ) : (
              <p className="text-[12px] leading-4 text-muted-foreground">
                Tanpa login kamu bisa membuat {guest.remaining} perjalanan gratis. Masuk nanti untuk
                menyimpannya ke akunmu.
              </p>
            )}
          </section>
        )}
        <div>
          <p className={label}>Detail perjalanan</p>
          <div className={group}>
            {
              <Field
                label="Nama perjalanan"
                value={form.name}
                placeholder="Tokyo Spring Trip"
                onChange={(v) => update("name", v)}
              />
            }
            <div className={row}>
              <span className="text-sm font-medium">Negara</span>
              <TripCountryPicker
                value={form.destinationCode}
                onChange={(country) =>
                  setForm((current) => ({
                    ...current,
                    destinationCode: country.code,
                    destinationName: country.name,
                    primaryCurrency: tripCurrencyFor(country.code),
                  }))
                }
              />
            </div>
          </div>
        </div>
        <div>
          <p className={label}>Berangkat dari (opsional)</p>
          <FlightPlaceField
            id="trip-origin"
            label="Kota atau bandara asal"
            value={origin}
            onPick={setOrigin}
          />
          <p className="mt-1 px-1 text-[11px] text-muted-foreground">
            Dipakai Travo untuk mencari harga tiket pesawat ke tujuanmu.
          </p>
        </div>
        <div>
          <p className={label}>Tanggal</p>
          <div className={group}>
            <DateField
              label="Berangkat"
              value={form.departureDate}
              onChange={(v) => update("departureDate", v)}
            />
            <DateField
              label="Pulang"
              value={form.returnDate}
              onChange={(v) => update("returnDate", v)}
            />
          </div>
        </div>
        <div>
          <p className={label}>Anggaran & traveler</p>
          <div className={group}>
            <label className={row}>
              <span className="text-sm font-medium">Anggaran ({form.primaryCurrency})</span>
              <MoneyInput
                required
                value={form.totalBudgetMinor ? String(Math.round(form.totalBudgetMinor / 100)) : ""}
                onValueChange={(digits) => update("totalBudgetMinor", Number(digits || 0) * 100)}
                aria-label="Anggaran"
                className="w-36 bg-transparent text-right text-sm outline-none"
                placeholder="Rp 1.000.000"
              />
            </label>
            <label className={row}>
              <span className="text-sm font-medium">Jumlah traveler</span>
              <input
                required
                type="number"
                min="1"
                max="50"
                value={form.travelersCount}
                onChange={(e) => update("travelersCount", Number(e.target.value))}
                className="w-20 bg-transparent text-right text-sm outline-none"
              />
            </label>
          </div>
        </div>
        {error && (
          <p className="rounded-xl bg-brand-red-soft px-3 py-2 text-sm text-brand-red" role="alert">
            {error}
          </p>
        )}
        <button disabled={saving || guestBlocked} className={btnRed}>
          {saving ? "Menyimpan…" : "Buat Perjalanan"}
        </button>
      </form>
    </Page>
  );
}
function Field({
  label: fieldLabel,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={row}>
      <span className="text-sm font-medium">{fieldLabel}</span>
      <input
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-44 bg-transparent text-right text-sm outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
function DateField({
  label: fieldLabel,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={row}>
      <span className="text-sm font-medium">{fieldLabel}</span>
      <input
        required
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-right text-sm outline-none"
      />
    </label>
  );
}
