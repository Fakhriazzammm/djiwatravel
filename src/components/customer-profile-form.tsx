import type { FormEvent } from "react";
import {
  CUSTOMER_PROFILE_GENDERS,
  type CustomerProfileDraft,
  type CustomerProfileErrors,
} from "@/lib/customer-profile";

const inputClass =
  "h-12 w-full rounded-xl border border-border bg-background px-3.5 text-[16px] outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30";

type ProfileField = "displayName" | "whatsapp" | "nationality" | "dateOfBirth" | "gender";

export function CustomerProfileForm({
  profile,
  onChange,
  onSubmit,
  onCancel,
  saving,
  saveLabel,
  error,
  errors = {},
  canCancel,
}: {
  profile: CustomerProfileDraft;
  onChange: (field: ProfileField, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
  error: string | null;
  errors?: CustomerProfileErrors;
  canCancel: boolean;
}) {
  const fieldError = (field: keyof CustomerProfileErrors) =>
    errors[field] ? <p className="mt-1 text-xs text-destructive">{errors[field]}</p> : null;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <section aria-labelledby="profile-account-heading">
        <h2
          id="profile-account-heading"
          className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
        >
          Akun
        </h2>
        <div className="overflow-hidden rounded-2xl bg-surface divide-y divide-border/70">
          <div className="px-4 py-3">
            <label htmlFor="profile-email" className="text-xs font-medium text-muted-foreground">
              Email akun
            </label>
            <input
              id="profile-email"
              type="email"
              value={profile.email}
              readOnly
              className={`${inputClass} mt-1.5 bg-secondary/60 text-muted-foreground`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Email mengikuti akun yang kamu gunakan.
            </p>
          </div>
          <div className="px-4 py-3">
            <label
              htmlFor="profile-display-name"
              className="text-xs font-medium text-muted-foreground"
            >
              Nama lengkap
            </label>
            <input
              id="profile-display-name"
              type="text"
              autoComplete="name"
              value={profile.displayName ?? ""}
              onChange={(event) => onChange("displayName", event.target.value)}
              placeholder="Nama yang ingin ditampilkan"
              className={`${inputClass} mt-1.5`}
              aria-invalid={Boolean(errors.displayName)}
            />
            {fieldError("displayName")}
          </div>
        </div>
      </section>

      <section aria-labelledby="profile-contact-heading">
        <h2
          id="profile-contact-heading"
          className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
        >
          Kontak
        </h2>
        <div className="overflow-hidden rounded-2xl bg-surface">
          <div className="px-4 py-3">
            <label htmlFor="profile-whatsapp" className="text-xs font-medium text-muted-foreground">
              Nomor WhatsApp
            </label>
            <input
              id="profile-whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={profile.whatsapp}
              onChange={(event) => onChange("whatsapp", event.target.value)}
              placeholder="0851 5639 9831"
              className={`${inputClass} mt-1.5`}
              aria-invalid={Boolean(errors.whatsapp)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Dipakai untuk detail pesanan dan bantuan perjalanan.
            </p>
            {fieldError("whatsapp")}
          </div>
        </div>
      </section>

      <section aria-labelledby="profile-traveler-heading">
        <h2
          id="profile-traveler-heading"
          className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
        >
          Data traveler
        </h2>
        <div className="overflow-hidden rounded-2xl bg-surface divide-y divide-border/70">
          <div className="px-4 py-3">
            <label
              htmlFor="profile-nationality"
              className="text-xs font-medium text-muted-foreground"
            >
              Kewarganegaraan
            </label>
            <input
              id="profile-nationality"
              type="text"
              autoComplete="country-name"
              value={profile.nationality ?? ""}
              onChange={(event) => onChange("nationality", event.target.value)}
              placeholder="Indonesia"
              className={`${inputClass} mt-1.5`}
              aria-invalid={Boolean(errors.nationality)}
            />
            {fieldError("nationality")}
          </div>
          <div className="grid grid-cols-2 gap-3 px-4 py-3">
            <div>
              <label
                htmlFor="profile-date-of-birth"
                className="text-xs font-medium text-muted-foreground"
              >
                Tanggal lahir
              </label>
              <input
                id="profile-date-of-birth"
                type="date"
                autoComplete="bday"
                value={profile.dateOfBirth ?? ""}
                onChange={(event) => onChange("dateOfBirth", event.target.value)}
                className={`${inputClass} mt-1.5`}
                aria-invalid={Boolean(errors.dateOfBirth)}
              />
              {fieldError("dateOfBirth")}
            </div>
            <div>
              <label htmlFor="profile-gender" className="text-xs font-medium text-muted-foreground">
                Jenis kelamin
              </label>
              <select
                id="profile-gender"
                value={profile.gender ?? ""}
                onChange={(event) => onChange("gender", event.target.value)}
                className={`${inputClass} mt-1.5`}
                aria-invalid={Boolean(errors.gender)}
              >
                <option value="">Pilih</option>
                <option value={CUSTOMER_PROFILE_GENDERS[0]}>Perempuan</option>
                <option value={CUSTOMER_PROFILE_GENDERS[1]}>Laki-laki</option>
                <option value={CUSTOMER_PROFILE_GENDERS[2]}>Tidak ingin menyebutkan</option>
              </select>
              {fieldError("gender")}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="tap h-12 flex-1 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saveLabel}
        </button>
        {canCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="tap h-12 rounded-xl bg-secondary px-4 font-semibold"
          >
            Batal
          </button>
        )}
      </div>
    </form>
  );
}
