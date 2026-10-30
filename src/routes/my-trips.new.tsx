import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BackBar, Page, btnRed, group, label, row } from "@/components/shell";
import { postTrip } from "@/lib/my-trips.fn";

export const Route = createFileRoute("/my-trips/new")({ component: NewTrip });
function NewTrip() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    destinationName: "",
    destinationCode: "JP",
    departureDate: "",
    returnDate: "",
    travelersCount: 1,
    primaryCurrency: "IDR" as const,
    totalBudgetMinor: 0,
    timezone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const update = (key: string, value: string | number) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const trip = await postTrip({ data: form });
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
      <form onSubmit={submit} className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Perjalanan baru</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Simpan rencana perjalananmu di satu tempat.
          </p>
        </div>
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
            {
              <Field
                label="Destinasi"
                value={form.destinationName}
                placeholder="Jepang"
                onChange={(v) => update("destinationName", v)}
              />
            }
            <label className={row}>
              <span className="text-sm font-medium">Negara</span>
              <select
                value={form.destinationCode}
                onChange={(event) => {
                  const destinationCode = event.target.value;
                  const countryByCode: Record<
                    string,
                    { name: string; currency: "IDR" | "JPY" | "USD" | "SGD" | "KRW" }
                  > = {
                    JP: { name: "Jepang", currency: "JPY" },
                    US: { name: "Amerika Serikat", currency: "USD" },
                    SG: { name: "Singapura", currency: "SGD" },
                    KR: { name: "Korea Selatan", currency: "KRW" },
                    ID: { name: "Indonesia", currency: "IDR" },
                  };
                  const country = countryByCode[destinationCode];
                  setForm((current) => ({
                    ...current,
                    destinationCode,
                    destinationName: country.name,
                    primaryCurrency: country.currency,
                  }));
                }}
                className="max-w-44 bg-transparent text-right text-sm outline-none"
              >
                <option value="JP">Jepang</option>
                <option value="SG">Singapura</option>
                <option value="KR">Korea Selatan</option>
                <option value="US">Amerika Serikat</option>
                <option value="ID">Indonesia</option>
              </select>
            </label>
          </div>
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
              <input
                required
                type="number"
                min="0"
                inputMode="numeric"
                value={form.totalBudgetMinor / 100 || ""}
                onChange={(e) =>
                  update("totalBudgetMinor", Math.round(Number(e.target.value || 0) * 100))
                }
                className="w-36 bg-transparent text-right text-sm outline-none"
                placeholder="0"
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
        <button disabled={saving} className={btnRed}>
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
