import { Fragment, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, ExternalLink, Link2, MessageCircle, ReceiptText, Timer } from "lucide-react";
import { formatIdr } from "@/lib/personal-shopper";
import {
  STAGE_STEPS,
  formatCountdown,
  linkify,
  type ChatMessageView,
  type OfferState,
} from "@/lib/shopper-chat";
import { offerTotal } from "@/lib/shopper-discovery";
import { ProductImage } from "./shopper-ui";

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const WIB = { timeZone: "Asia/Jakarta" } as const;

/** "10.02" in WIB, the way the team and the customer read the clock. */
export const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { ...WIB, hour: "2-digit", minute: "2-digit" });

export function dayLabel(iso: string, now = Date.now()) {
  const day = (t: number) => new Date(t).toLocaleDateString("en-CA", WIB);
  if (day(new Date(iso).getTime()) === day(now)) return "Hari ini";
  if (day(new Date(iso).getTime()) === day(now - 86_400_000)) return "Kemarin";
  return new Date(iso).toLocaleDateString("id-ID", { ...WIB, day: "numeric", month: "short" });
}

export const listTime = (iso: string, now = Date.now()) => {
  const label = dayLabel(iso, now);
  return label === "Hari ini" ? formatClock(iso) : label;
};

/* ------------------------------------------------------------------ stage */

const dotClass = (k: number, done: number) =>
  k < done ? "bg-success" : k === done && done < 4 ? "bg-brand-red" : "bg-border";

/** Four dots joined by lines: green for finished, red for now, grey for later. */
export function StageDots({ done, mini = false }: { done: number; mini?: boolean }) {
  return (
    <span
      className={`flex items-center ${mini ? "w-24" : "w-full"}`}
      role="img"
      aria-label={`Tahap ${Math.min(done + 1, 4)} dari 4`}
    >
      {[0, 1, 2, 3].map((k) => (
        <Fragment key={k}>
          <i
            className={`shrink-0 rounded-full ${mini ? "size-1.5" : "size-2.5"} ${dotClass(k, done)}`}
          />
          {k < 3 && (
            <u
              className={`block flex-1 no-underline ${mini ? "h-px" : "h-[3px]"} ${k < done ? "bg-success" : "bg-border"}`}
            />
          )}
        </Fragment>
      ))}
    </span>
  );
}

export function StageTrack({ done }: { done: number }) {
  return (
    <div className="border-b border-border/70 bg-surface px-3 pb-1.5 pt-2">
      <StageDots done={done} />
      <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
        {STAGE_STEPS.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
    </div>
  );
}

const PILL_TONE = {
  neutral: "bg-secondary text-muted-foreground",
  warn: "bg-[#fef3c7] text-[#a16207]",
  ok: "bg-[#dcfce7] text-[#15803d]",
  bad: "bg-brand-red-soft text-brand-red",
} as const;

export function Pill({
  tone,
  children,
}: {
  tone: keyof typeof PILL_TONE;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-block shrink-0 self-start rounded-full px-1.5 py-px text-[10px] font-bold leading-snug ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function ThreadIcon({ icon }: { icon: "link" | "photo" | "order" | "chat" }) {
  const Icon = { link: Link2, photo: Camera, order: ReceiptText, chat: MessageCircle }[icon];
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
      <Icon className="size-[18px]" aria-hidden="true" />
    </span>
  );
}

/* --------------------------------------------------------------- messages */

function Linked({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((part, i) =>
        part.href ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all underline"
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

export function SystemLine({ text }: { text: string }) {
  return (
    <div className="my-0.5 flex justify-center">
      <span className="max-w-[85%] rounded-full bg-secondary px-2.5 py-0.5 text-center text-[11px] text-muted-foreground">
        {text}
      </span>
    </div>
  );
}

export function MessageBubble({
  m,
  mine,
  read,
  onPhoto,
}: {
  m: ChatMessageView;
  mine: boolean;
  /** Show a double tick: the team has answered after this message. */
  read?: boolean;
  onPhoto: (url: string, label: string) => void;
}) {
  const note = m.internal;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-2.5 py-1.5 text-[13px] leading-snug ${
          note
            ? "border border-dashed border-[#e6c875] bg-[#fff8e6] text-[#5c4410] dark:bg-[#3a3017] dark:text-[#f1deb0]"
            : mine
              ? "rounded-br-md bg-brand-red text-white"
              : "rounded-bl-md border border-border/70 bg-surface"
        }`}
      >
        {note && <span className="block text-[10px] font-bold">Catatan internal</span>}
        {m.attachmentUrl && (
          <button
            type="button"
            aria-label="Lihat foto"
            onClick={() => onPhoto(m.attachmentUrl!, m.body || "Foto")}
            className="mb-1 block"
          >
            <img
              src={m.attachmentUrl}
              alt="Foto dalam percakapan"
              loading="lazy"
              className="max-h-44 rounded-xl object-cover"
            />
          </button>
        )}
        {m.body && (
          <p className="whitespace-pre-wrap break-words">
            <Linked text={m.body} />
          </p>
        )}
        <span
          className={`mt-0.5 block text-right text-[10px] ${mine && !note ? "text-white/75" : "text-muted-foreground"}`}
        >
          {m.senderName && !mine ? `${m.senderName} · ` : ""}
          {formatClock(m.at)}
          {mine && !note ? (read ? " ✓✓" : " ✓") : ""}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ cards */

type RequestCard = Extract<NonNullable<ChatMessageView["card"]>, { type: "request" }> & {
  photoUrl?: string | null;
};

export function RequestCardView({
  card,
  onPhoto,
}: {
  card: RequestCard;
  onPhoto: (url: string, label: string) => void;
}) {
  const host = (() => {
    try {
      return card.sourceUrl ? new URL(card.sourceUrl).hostname.replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  })();
  return (
    <div className="flex gap-2.5 rounded-2xl border border-border/70 bg-surface p-2">
      {card.photoUrl ? (
        <button
          type="button"
          aria-label="Lihat foto"
          onClick={() => onPhoto(card.photoUrl!, card.title)}
          className="shrink-0"
        >
          <ProductImage src={card.photoUrl} alt="Foto barang" className="size-14" />
        </button>
      ) : (
        <ProductImage src={null} alt="" className="size-14 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground">
          {card.hasPhoto ? "Foto referensi" : host || "Barang incaran"}
        </p>
        <p className="line-clamp-2 text-[13px] font-semibold leading-tight">{card.title}</p>
        {card.sourceUrl && (
          <a
            href={card.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-red"
          >
            Buka link <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}

const STATE_PILL: Record<OfferState, { tone: keyof typeof PILL_TONE; text: string }> = {
  open: { tone: "warn", text: "Menunggu" },
  expired: { tone: "neutral", text: "Kedaluwarsa" },
  superseded: { tone: "neutral", text: "Diganti" },
  declined: { tone: "bad", text: "Ditolak" },
  accepted: { tone: "warn", text: "Menunggu bayar" },
  paid: { tone: "ok", text: "Dibayar" },
  closed: { tone: "neutral", text: "Selesai" },
};

type OfferCard = Extract<NonNullable<ChatMessageView["card"]>, { type: "offer" }>;

export function OfferCardView({
  card,
  orderId,
  perspective,
  onAccept,
  onAsk,
  onRefresh,
}: {
  card: OfferCard;
  /** The order this offer became, when it did. */
  orderId: string | null;
  perspective: "customer" | "admin";
  onAccept?: () => void;
  onAsk?: () => void;
  onRefresh?: () => void;
}) {
  const now = useNow(1000);
  const state: OfferState = card.state ?? "open";
  const pill = STATE_PILL[state];
  const o = card.offer;
  const goods = o.unitIdr * o.quantity;
  const percent = goods > 0 ? Math.round((o.feeIdr / goods) * 100) : 0;
  const left = new Date(card.expiresAt).getTime() - now;
  const dim = state === "superseded" || state === "closed";
  const rows: [string, number][] = [
    [
      `Harga toko ¥${o.unitJpy.toLocaleString("id-ID")}${o.quantity > 1 ? ` × ${o.quantity}` : ""} × kurs ${o.rateIdr.toLocaleString("id-ID")}`,
      goods,
    ],
    ["Kirim dalam Jepang", o.domesticIdr],
    [`Jasa titip${percent ? ` ${percent}%` : ""}`, o.feeIdr],
    ["Ongkir ke Indonesia", o.shippingIdr],
  ];
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border/70 bg-surface ${dim ? "opacity-60" : ""}`}
    >
      <div className="flex gap-2.5 p-2">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <MessageCircle className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight">Penawaran {card.number}</p>
          <p className="line-clamp-2 text-[11px] text-muted-foreground">
            {o.name} · {o.merchant} · {o.quantity} pcs
          </p>
          {state === "open" && (
            <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-[#a16207]">
              <Timer className="size-3" aria-hidden="true" />
              Berlaku {formatCountdown(left)} lagi
            </p>
          )}
        </div>
        <Pill tone={pill.tone}>{pill.text}</Pill>
      </div>
      <dl className="space-y-0.5 px-2 pb-2 text-[12px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{formatIdr(value)}</dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-dashed border-border pt-1 text-[13px] font-bold">
          <dt>Total</dt>
          <dd>{formatIdr(offerTotal(o))}</dd>
        </div>
      </dl>
      <p className="px-2 pb-2 text-[11px] text-muted-foreground">
        {[o.condition && `Kondisi: ${o.condition}`, o.variant && `Pilihan: ${o.variant}`, o.note]
          .filter(Boolean)
          .join(" · ")}{" "}
        <a
          href={o.productUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-0.5 font-semibold text-brand-red"
        >
          Lihat produk <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </p>
      <div className="flex gap-1.5 px-2 pb-2">
        {perspective === "customer" && state === "open" && (
          <>
            <button
              type="button"
              onClick={onAsk}
              className="tap ios-btn min-h-9 flex-1 bg-secondary text-[12px]"
            >
              Tanya dulu
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="tap ios-btn min-h-9 flex-1 bg-brand-red text-[12px] text-white"
            >
              Setuju &amp; bayar
            </button>
          </>
        )}
        {perspective === "customer" && state === "expired" && (
          <button
            type="button"
            onClick={onRefresh}
            className="tap ios-btn min-h-9 flex-1 bg-secondary text-[12px]"
          >
            Minta penawaran baru
          </button>
        )}
        {perspective === "customer" && (state === "accepted" || state === "paid") && orderId && (
          <Link
            to="/titip-belanja/pesanan/$id"
            params={{ id: orderId }}
            className="tap ios-btn min-h-9 flex-1 bg-secondary text-[12px]"
          >
            {state === "paid" ? "Lihat pesanan" : "Lanjut bayar"} ›
          </Link>
        )}
      </div>
    </div>
  );
}
