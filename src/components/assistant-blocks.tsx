import { Fragment, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Clock3, Info, Lightbulb, MapPin, TriangleAlert, Wallet } from "lucide-react";
import { springIos } from "@/lib/motion";
import type { AssistantBlock } from "@/lib/trip-assistant";

/** Travo's sentence: **bold** terms and line breaks, nothing else of markdown. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i} className="font-bold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

const TIME = /^(\d{1,2}[:.]\d{2})(?:\s*[-–]\s*(\d{1,2}[:.]\d{2}))?\s*[:·-]?\s*(.+)$/;

function factIcon(label: string) {
  if (/jam|buka|waktu|durasi/i.test(label)) return Clock3;
  if (/harga|biaya|tiket|tarif|budget|anggaran/i.test(label)) return Wallet;
  if (/lokasi|area|alamat|dekat|jarak|stasiun/i.test(label)) return MapPin;
  return Info;
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="relative space-y-2.5 pl-1">
      <span className="absolute bottom-2 left-[27px] top-2 w-px bg-border" aria-hidden="true" />
      {items.map((item, i) => {
        const m = TIME.exec(item);
        return (
          <li key={i} className="relative flex items-start gap-2.5">
            <span className="z-10 mt-0.5 grid h-5 min-w-[46px] place-items-center rounded-full bg-brand-red px-1.5 text-[10px] font-bold tabular-nums text-white">
              {m ? m[1]!.replace(".", ":") : i + 1}
            </span>
            <span className="min-w-0 flex-1 text-[13px] leading-[1.35]">
              <RichText text={m ? (m[2] ? `${m[3]} (sampai ${m[2]})` : m[3]!) : item} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Facts({ items }: { items: string[] }) {
  return (
    <dl className="divide-y divide-border/60 rounded-xl bg-secondary/60">
      {items.map((item, i) => {
        const at = item.indexOf(":");
        const label = at > 0 && at < 28 ? item.slice(0, at).trim() : "";
        const value = label ? item.slice(at + 1).trim() : item;
        const Icon = factIcon(label);
        return (
          <div key={i} className="flex min-h-9 items-center gap-2 px-2.5 py-1.5">
            <Icon className="size-3.5 shrink-0 text-brand-red" aria-hidden="true" />
            {label && <dt className="shrink-0 text-[12px] text-muted-foreground">{label}</dt>}
            <dd className="min-w-0 flex-1 text-right text-[13px] font-semibold">
              <RichText text={value} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Callout({ items, tone }: { items: string[]; tone: "tip" | "warning" }) {
  const Icon = tone === "tip" ? Lightbulb : TriangleAlert;
  return (
    <div
      className={`flex gap-2 rounded-xl px-2.5 py-2 ${
        tone === "tip" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
      }`}
      role={tone === "warning" ? "note" : undefined}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5 text-[12.5px] leading-[1.4]">
        {items.map((item, i) => (
          <p key={i}>
            <RichText text={item} />
          </p>
        ))}
      </div>
    </div>
  );
}

function Places({ items, onAsk }: { items: string[]; onAsk: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onAsk(`Ceritakan lebih lanjut soal ${item}`)}
          className="tap inline-flex min-h-8 items-center gap-1 rounded-full bg-brand-red-soft px-2.5 text-xs font-semibold text-brand-red"
        >
          <MapPin className="size-3" aria-hidden="true" />
          {item}
        </button>
      ))}
    </div>
  );
}

/** The visual part of a Travo answer: steps, facts, tips, warnings and tappable places. */
export function AssistantBlocks({
  blocks,
  onAsk,
}: {
  blocks: AssistantBlock[];
  onAsk: (text: string) => void;
}) {
  const reduce = Boolean(useReducedMotion());
  if (!blocks.length) return null;
  return (
    <div
      className="space-y-2.5 border-t border-border/60 px-3 py-2.5"
      data-testid="assistant-blocks"
    >
      {blocks.map((block, index) => {
        let body: ReactNode;
        if (block.kind === "steps") body = <Steps items={block.items} />;
        else if (block.kind === "facts") body = <Facts items={block.items} />;
        else if (block.kind === "tip" || block.kind === "warning")
          body = <Callout items={block.items} tone={block.kind} />;
        else body = <Places items={block.items} onAsk={onAsk} />;
        return (
          <motion.section
            key={`${block.kind}-${index}`}
            data-block={block.kind}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springIos, delay: reduce ? 0 : index * 0.08 }}
          >
            {block.title && (
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {block.title}
              </h3>
            )}
            {body}
          </motion.section>
        );
      })}
    </div>
  );
}
