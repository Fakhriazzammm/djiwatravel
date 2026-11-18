import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { CustomerAuth } from "@/components/customer-auth";
import { BackBar, Page } from "@/components/shell";
import { PhotoPicker, type PickedPhoto } from "@/components/shipping/shipping-photos";
import {
  DropPointCard,
  Row,
  ShippingField,
  shippingField,
  shippingPrimaryBtn,
  shippingSoftBtn,
} from "@/components/shipping/shipping-ui";
import {
  JAPAN_PREFECTURES,
  SHIPPING_CATEGORIES,
  estimateShippingIdr,
  formatIdr,
  formatKg,
  validateShippingGoods,
  validateShippingInbound,
  validateShippingRecipient,
  type ShippingConfig,
} from "@/lib/shipping";

export type ShippingBookingPayload = {
  country: "JP";
  recipient: {
    recipientName: string;
    phone: string;
    postalCode: string;
    prefecture: string;
    city: string;
    addressLine: string;
  };
  goods: { category: string; contents: string; declaredValueIdr: number; estimatedKg: number };
  acceptedRules: true;
  inbound: { mode: "SELF" } | { mode: "COURIER"; courier: string; tracking: string };
};

export type ShippingBookingFormProps = {
  config: ShippingConfig;
  available: boolean;
  signedIn: boolean;
  last: ShippingBookingPayload["recipient"] | null;
  /** Creates the booking and returns its id; the route sends the customer to the new shipment. */
  onSubmit: (payload: ShippingBookingPayload, photos: File[]) => Promise<{ id: string }>;
  onCreated: (id: string) => void;
};

type Step = 1 | 2 | 3;

export function ShippingBookingForm({
  config,
  available,
  signedIn,
  last,
  onSubmit,
  onCreated,
}: ShippingBookingFormProps) {
  const tariff = config.countries.JP;
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [recipient, setRecipient] = useState({
    recipientName: last?.recipientName ?? "",
    phone: last?.phone ?? "+81 ",
    postalCode: last?.postalCode ?? "",
    prefecture: last?.prefecture ?? "",
    city: last?.city ?? "",
    addressLine: last?.addressLine ?? "",
  });
  const [goods, setGoods] = useState({
    category: "",
    contents: "",
    declaredValue: "",
    estimatedKg: Math.min(Math.max(2, config.minKg), config.maxKg),
    acceptedRules: false,
  });
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const photoError =
    photos.length < config.minPhotos
      ? `Lampirkan minimal ${config.minPhotos} foto isi paket`
      : undefined;
  const [inbound, setInbound] = useState<{
    mode: "SELF" | "COURIER";
    courier: string;
    tracking: string;
  }>({ mode: "SELF", courier: "", tracking: "" });

  const declaredValueIdr = Number(goods.declaredValue.replace(/\D/g, "")) || 0;
  const recipientErrors = useMemo(() => validateShippingRecipient(recipient), [recipient]);
  const goodsErrors = useMemo(
    () => validateShippingGoods({ ...goods, declaredValueIdr }, config),
    [goods, declaredValueIdr, config],
  );
  const inboundErrors = validateShippingInbound(inbound);
  const estimate = estimateShippingIdr(goods.estimatedKg, config, tariff.rateIdrPerKg);
  const shown = (errors: Record<string, string>, key: string) =>
    showErrors ? errors[key] : undefined;

  const setR = (key: keyof typeof recipient) => (e: { target: { value: string } }) =>
    setRecipient((r) => ({ ...r, [key]: e.target.value }));

  function next() {
    setShowErrors(true);
    if (step === 1) {
      if (Object.keys(recipientErrors).length === 0) {
        setShowErrors(false);
        setStep(2);
      }
      return;
    }
    if (step === 2) {
      if (Object.keys(goodsErrors).length === 0 && !photoError) {
        setShowErrors(false);
        setStep(3);
      }
    }
  }

  async function submit() {
    setShowErrors(true);
    if (Object.keys(inboundErrors).length > 0) return;
    setBusy(true);
    try {
      const result = await onSubmit(
        {
          country: "JP",
          recipient,
          goods: {
            category: goods.category,
            contents: goods.contents,
            declaredValueIdr,
            estimatedKg: goods.estimatedKg,
          },
          acceptedRules: true,
          inbound:
            inbound.mode === "COURIER"
              ? { mode: "COURIER", courier: inbound.courier, tracking: inbound.tracking }
              : { mode: "SELF" },
        },
        photos.map((p) => p.file),
      );
      onCreated(result.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Booking belum berhasil, coba lagi.");
      setBusy(false);
    }
  }

  if (!available || !config.enabled) {
    return (
      <Page tabs={false}>
        <BackBar title="Kirim Barang" fallbackTo="/kirim-barang" />
        <p className="mt-10 text-center text-[13px] text-muted-foreground">
          Kirim Barang belum dibuka.
        </p>
        <Link to="/kirim-barang" className={`${shippingSoftBtn} mt-3`}>
          Kembali
        </Link>
      </Page>
    );
  }

  return (
    <Page tabs={false}>
      <BackBar
        title={step === 1 ? "Penerima" : step === 2 ? "Barang" : "Ringkasan"}
        fallbackTo="/kirim-barang"
        action={<span className="text-[11px] text-muted-foreground">{step} dari 3</span>}
      />
      <div className="mb-3 flex gap-1" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <i
            key={n}
            className={`h-1 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-2">
          <ShippingField label="Nama penerima" error={shown(recipientErrors, "recipientName")}>
            <input
              className={shippingField}
              value={recipient.recipientName}
              onChange={setR("recipientName")}
              autoComplete="off"
            />
          </ShippingField>
          <ShippingField label="Nomor telepon (+81)" error={shown(recipientErrors, "phone")}>
            <input
              className={shippingField}
              inputMode="tel"
              value={recipient.phone}
              onChange={setR("phone")}
              placeholder="+81 90 1234 5678"
            />
          </ShippingField>
          <p className="ios-section-label !mb-0 !mt-3 !px-0">Alamat di Jepang</p>
          <div className="grid grid-cols-2 gap-2">
            <ShippingField label="Kode pos" error={shown(recipientErrors, "postalCode")}>
              <input
                className={shippingField}
                inputMode="numeric"
                value={recipient.postalCode}
                onChange={setR("postalCode")}
                placeholder="150-0002"
              />
            </ShippingField>
            <ShippingField label="Prefektur" error={shown(recipientErrors, "prefecture")}>
              <select
                className={shippingField}
                value={recipient.prefecture}
                onChange={setR("prefecture")}
              >
                <option value="">Pilih</option>
                {JAPAN_PREFECTURES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </ShippingField>
          </div>
          <ShippingField label="Kota / kelurahan" error={shown(recipientErrors, "city")}>
            <input className={shippingField} value={recipient.city} onChange={setR("city")} />
          </ShippingField>
          <ShippingField label="Alamat lengkap" error={shown(recipientErrors, "addressLine")}>
            <input
              className={shippingField}
              value={recipient.addressLine}
              onChange={setR("addressLine")}
              placeholder="2-21-1 Shibuya, Apt 302"
            />
          </ShippingField>
          <p className="text-[11px] text-muted-foreground">
            Tulis alamat dengan huruf latin. Kurir butuh nomor telepon aktif untuk konfirmasi.
          </p>
          <button type="button" className={`${shippingPrimaryBtn} mt-2`} onClick={next}>
            Lanjut
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Kategori</p>
            <div className="flex flex-wrap gap-1.5">
              {SHIPPING_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={goods.category === c}
                  onClick={() => setGoods((g) => ({ ...g, category: c }))}
                  className={`tap ios-chip border ${goods.category === c ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-surface"}`}
                >
                  {c}
                </button>
              ))}
            </div>
            {shown(goodsErrors, "category") && (
              <p className="mt-0.5 text-[11px] text-destructive">{goodsErrors["category"]}</p>
            )}
          </div>
          <ShippingField label="Isi paket" error={shown(goodsErrors, "contents")}>
            <input
              className={shippingField}
              value={goods.contents}
              maxLength={300}
              onChange={(e) => setGoods((g) => ({ ...g, contents: e.target.value }))}
              placeholder="Keripik, kopi bubuk, 2 kaos"
            />
          </ShippingField>
          <ShippingField
            label="Nilai barang (Rp), untuk bea cukai"
            error={shown(goodsErrors, "declaredValueIdr")}
          >
            <input
              className={shippingField}
              inputMode="numeric"
              value={goods.declaredValue}
              onChange={(e) => setGoods((g) => ({ ...g, declaredValue: e.target.value }))}
              placeholder="650000"
            />
          </ShippingField>
          <PhotoPicker
            photos={photos}
            onChange={setPhotos}
            min={config.minPhotos}
            error={showErrors ? photoError : undefined}
          />
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Estimasi berat</p>
            <div className="ios-card flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Kurangi berat"
                  disabled={goods.estimatedKg <= config.minKg}
                  onClick={() =>
                    setGoods((g) => ({
                      ...g,
                      estimatedKg: Math.max(config.minKg, g.estimatedKg - config.roundKg),
                    }))
                  }
                  className="tap flex size-9 items-center justify-center rounded-lg border border-border/70 disabled:opacity-40"
                >
                  <Minus className="size-4" aria-hidden="true" />
                </button>
                <output className="min-w-14 text-center text-[15px] font-bold">
                  {formatKg(goods.estimatedKg)}
                </output>
                <button
                  type="button"
                  aria-label="Tambah berat"
                  disabled={goods.estimatedKg >= config.maxKg}
                  onClick={() =>
                    setGoods((g) => ({
                      ...g,
                      estimatedKg: Math.min(config.maxKg, g.estimatedKg + config.roundKg),
                    }))
                  }
                  className="tap flex size-9 items-center justify-center rounded-lg border border-border/70 disabled:opacity-40"
                >
                  <Plus className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="text-right">
                <p className="text-[10.5px] text-muted-foreground">Estimasi biaya</p>
                <p className="text-[15px] font-bold">{formatIdr(estimate)}</p>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Biaya akhir mengikuti berat timbang di drop point.
            </p>
          </div>
          <div className="flex items-start gap-2 pt-1">
            <button
              type="button"
              role="checkbox"
              aria-checked={goods.acceptedRules}
              aria-label="Setujui daftar barang terlarang"
              onClick={() => setGoods((g) => ({ ...g, acceptedRules: !g.acceptedRules }))}
              className={`tap mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border ${goods.acceptedRules ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface"}`}
            >
              {goods.acceptedRules && <Check className="size-3.5" aria-hidden="true" />}
            </button>
            <p className="text-[11.5px] text-muted-foreground">
              Paket tidak berisi: {config.prohibited.join("; ")}.
              {shown(goodsErrors, "acceptedRules") && (
                <span className="mt-0.5 block text-destructive">
                  {goodsErrors["acceptedRules"]}
                </span>
              )}
            </p>
          </div>
          {shown(goodsErrors, "estimatedKg") && (
            <p className="text-[11px] text-destructive">{goodsErrors["estimatedKg"]}</p>
          )}
          <div className="mt-2 flex gap-2">
            <button type="button" className={shippingSoftBtn} onClick={() => setStep(1)}>
              Kembali
            </button>
            <button type="button" className={shippingPrimaryBtn} onClick={next}>
              Lihat ringkasan
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <p className="ios-section-label">Penerima</p>
          <div className="ios-group p-3 text-[12px]">
            <p className="text-[13px] font-semibold">{recipient.recipientName}</p>
            <p className="text-muted-foreground">{recipient.phone}</p>
            <p className="text-muted-foreground">
              {recipient.addressLine}, {recipient.city}, {recipient.prefecture}{" "}
              {recipient.postalCode}
            </p>
          </div>
          <p className="ios-section-label mt-3">Barang</p>
          <dl className="ios-group space-y-1 p-3 text-[12px]">
            <Row label="Kategori" value={goods.category} />
            <Row label="Isi" value={goods.contents} />
            <Row label="Nilai" value={formatIdr(declaredValueIdr)} />
            <Row label="Foto isi paket" value={`${photos.length} foto`} />
          </dl>
          {photos.length > 0 && (
            <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
              {photos.map((p) => (
                <img
                  key={p.id}
                  src={p.url}
                  alt="Foto isi paket"
                  className="size-14 shrink-0 rounded-lg object-cover"
                />
              ))}
            </div>
          )}
          <p className="ios-section-label mt-3">Estimasi biaya</p>
          <dl className="ios-group space-y-1 p-3 text-[12px]">
            <Row
              label={`Estimasi ${formatKg(goods.estimatedKg)} × ${formatIdr(tariff.rateIdrPerKg)}`}
              value={formatIdr(estimate)}
            />
            <Row label="Dibayar nanti" value="setelah ditimbang" strong />
          </dl>
          <p className="ios-section-label mt-3">Cara antar ke drop point</p>
          <div className="flex gap-1.5">
            {(
              [
                ["SELF", "Antar sendiri"],
                ["COURIER", "Lewat kurir"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={inbound.mode === mode}
                onClick={() => setInbound((i) => ({ ...i, mode }))}
                className={`tap ios-chip flex-1 justify-center border ${inbound.mode === mode ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-surface"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {inbound.mode === "COURIER" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ShippingField label="Nama kurir" error={shown(inboundErrors, "inboundCourier")}>
                <input
                  className={shippingField}
                  value={inbound.courier}
                  onChange={(e) => setInbound((i) => ({ ...i, courier: e.target.value }))}
                  placeholder="JNE, J&T, SiCepat"
                />
              </ShippingField>
              <ShippingField label="Nomor resi" error={shown(inboundErrors, "inboundTracking")}>
                <input
                  className={shippingField}
                  value={inbound.tracking}
                  onChange={(e) => setInbound((i) => ({ ...i, tracking: e.target.value }))}
                />
              </ShippingField>
            </div>
          )}
          <div className="mt-2">
            <DropPointCard point={config.dropPoint} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Antar maksimal {config.dropDeadlineDays} hari setelah booking.
          </p>

          {signedIn ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className={shippingSoftBtn}
                onClick={() => setStep(2)}
                disabled={busy}
              >
                Kembali
              </button>
              <button type="button" className={shippingPrimaryBtn} onClick={submit} disabled={busy}>
                {busy ? "Membuat booking…" : "Kirim booking"}
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <p className="mb-2 text-[13px] text-muted-foreground">
                Masuk dulu untuk membuat booking.
              </p>
              <CustomerAuth size="block" />
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Belum ada pembayaran di langkah ini.
          </p>
        </div>
      )}
    </Page>
  );
}
