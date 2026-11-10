import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Pencil } from "lucide-react";
import { AssistantMascot } from "@/components/assistant-mascot";
import { FlightPlaceField } from "@/components/flight-place-field";
import { InlineAnswer } from "@/components/inline-answer";
import { Bubble } from "@/components/travo-parts";
import {
  applyTripAssistantProposal,
  createPlanTrip,
  streamTripAssistantMessage,
} from "@/lib/trip-assistant.fn";
import type { AssistantMessage } from "@/lib/trip-assistant";
import type { FlightPlace } from "@/lib/flights";
import {
  nextStep,
  parseAnswer,
  question,
  recapLines,
  toRequest,
  type Question,
  type WizardAnswers,
} from "@/lib/travo-plan-wizard";

type Line = { id: number; role: "assistant" | "user"; text: string };

const todayKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const chip = (on: boolean) =>
  `tap min-h-8 rounded-full px-3 text-xs font-semibold ring-1 ${
    on ? "bg-brand-red-soft text-brand-red ring-brand-red" : "bg-secondary ring-transparent"
  }`;

const PROGRESS = [
  "Mengumpulkan harga tiket, eSIM, dan biaya harian…",
  "Mencari tempat makan dan wisata di peta…",
  "Menyusun rencana hari demi hari…",
];

/**
 * "Itinerary lengkap": Travo asks one thing at a time in its own bubble and the traveler answers
 * right there (chips, typed text, a date, a departure city). When everything is answered the trip is
 * created and the full plan is built live, then the traveler lands on the trip with the proposals
 * ready to apply.
 */
export function TravoPlanWizard({ onExit }: { onExit: () => void }) {
  const navigate = useNavigate();
  const today = todayKey();
  const [answers, setAnswers] = useState<WizardAnswers>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [typing, setTyping] = useState(true);
  const [asked, setAsked] = useState<Question | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState<{ step: number; text: string } | null>(null);
  const [failure, setFailure] = useState<{ message: string; tripId?: string } | null>(null);
  const [ready, setReady] = useState<{ tripId: string; proposals: string[]; items: number } | null>(
    null,
  );
  const [applying, setApplying] = useState(false);
  const counter = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  const push = (role: Line["role"], text: string) =>
    setLines((list) => [...list, { id: (counter.current += 1), role, text }]);

  // Travo "types" each question, then shows its controls.
  useEffect(() => {
    const step = nextStep(answers);
    setAsked(null);
    if (!step) return;
    setTyping(true);
    const timer = window.setTimeout(
      () => {
        const q = question(step, answers, today);
        push("assistant", q.text);
        setAsked(q);
        setTyping(false);
        setPicked([]);
      },
      lines.length === 0 ? 350 : 650,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length, typing, asked, building]);

  function answer(raw: string) {
    if (!asked) return;
    const parsed = parseAnswer(asked.step, raw, answers, today);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    push("user", parsed.echo);
    setAnswers((current) => ({ ...current, ...parsed.patch }));
  }

  function pickOrigin(place: FlightPlace | null) {
    if (!place) return;
    setError(null);
    push("user", `${place.name} (${place.code})`);
    setAnswers((current) => ({ ...current, origin: { code: place.code, name: place.name } }));
  }

  function skipOrigin() {
    push("user", "Belum tahu");
    setAnswers((current) => ({ ...current, origin: null }));
  }

  async function build() {
    const request = toRequest(answers);
    if (!request) return;
    setAsked(null);
    setFailure(null);
    setBuilding({ step: 0, text: PROGRESS[0]! });
    try {
      const created = await createPlanTrip({ data: request });
      if (created.status !== "ok") {
        setBuilding(null);
        setFailure({ message: created.message });
        return;
      }
      const stream = await streamTripAssistantMessage({
        data: {
          tripId: created.tripId,
          text: created.text,
          intent: "full_plan",
          plan: {
            oneWay: request.oneWay,
            style: request.style,
            interests: request.interests,
            esim: request.esim,
          },
        },
      });
      let outcome: { status: string; message?: string } | null = null;
      for await (const event of stream) {
        if (event.type === "status") {
          const index = /peta/i.test(event.text)
            ? 1
            : /rencana harian|menyusun/i.test(event.text)
              ? 2
              : 0;
          setBuilding({ step: index, text: event.text });
        } else if (event.type === "done")
          outcome = event.result as { status: string; message?: string };
      }
      if (outcome?.status === "ok") {
        const messages = ((outcome as { messages?: AssistantMessage[] }).messages ?? []).filter(
          (m) => m.proposal?.status === "proposed",
        );
        const agenda = messages.find((m) => m.proposal?.payload.kind === "agenda")?.proposal;
        setBuilding(null);
        setReady({
          tripId: created.tripId,
          proposals: messages.map((m) => m.proposal!.id),
          items: agenda?.payload.kind === "agenda" ? agenda.payload.items.length : 0,
        });
        return;
      }
      setBuilding(null);
      setFailure({
        message: outcome?.message ?? "Rencana belum berhasil disusun.",
        tripId: created.tripId,
      });
    } catch {
      setBuilding(null);
      setFailure({ message: "Koneksi terputus. Coba lagi sebentar lagi." });
    }
  }

  /** One tap: the whole plan is applied (agenda with map pins, budget, checklist), then the trip opens. */
  async function applyAndOpen() {
    if (!ready) return;
    setApplying(true);
    try {
      for (const id of ready.proposals)
        await applyTripAssistantProposal({ data: { proposalId: id } });
    } catch {
      setApplying(false);
      setError(
        "Sebagian rencana belum bisa diterapkan. Buka perjalanannya, lalu terapkan satu per satu.",
      );
      return;
    }
    await navigate({ to: "/my-trips/$tripId", params: { tripId: ready.tripId } });
  }

  const q = asked;
  return (
    <div className="flex flex-col gap-2" data-testid="plan-wizard">
      <div className="flex items-center justify-between px-1">
        <p className="text-[12px] font-bold uppercase tracking-wide text-brand-red">
          Itinerary lengkap
        </p>
        <button
          type="button"
          onClick={onExit}
          className="tap text-[12px] font-semibold text-muted-foreground"
        >
          Batal
        </button>
      </div>
      {lines.map((line, index) => {
        const last = index === lines.length - 1 && line.role === "assistant";
        return (
          <Bubble
            key={line.id}
            role={line.role}
            footer={last && q && !building ? renderControls() : undefined}
          >
            {line.text}
          </Bubble>
        );
      })}
      {typing && !building && !failure && (
        <div className="flex items-end gap-1.5" role="status" aria-label="Travo sedang mengetik">
          <span className="mb-0.5">
            <AssistantMascot size={28} mood="thinking" />
          </span>
          <span className="flex gap-1 rounded-2xl rounded-bl-md bg-surface px-3 py-3 ring-1 ring-border/50">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </span>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="ml-8 rounded-xl bg-brand-red-soft px-3 py-2 text-[12px] text-brand-red"
        >
          {error}
        </p>
      )}
      {building && (
        <Bubble role="assistant" mood="thinking">
          <span className="block font-semibold">Aku susun rencananya ya…</span>
          <span className="mt-1 block space-y-1" data-testid="plan-progress">
            {PROGRESS.map((label, i) => (
              <span
                key={label}
                className={`flex items-center gap-1.5 text-[12px] ${i <= building.step ? "text-foreground" : "text-muted-foreground/60"}`}
              >
                {i < building.step ? (
                  <Check className="size-3.5 text-success" aria-hidden="true" />
                ) : (
                  <span
                    className={`size-1.5 rounded-full ${i === building.step ? "animate-pulse bg-brand-red" : "bg-muted-foreground/40"}`}
                  />
                )}
                {label}
              </span>
            ))}
          </span>
        </Bubble>
      )}
      {ready && (
        <Bubble
          role="assistant"
          footer={
            <div
              className="flex gap-2 border-t border-border/60 px-3 py-2"
              data-testid="plan-ready"
            >
              <button
                type="button"
                disabled={applying}
                className="tap min-h-9 rounded-xl bg-secondary px-3 text-[13px] font-semibold disabled:opacity-50"
                onClick={() =>
                  void navigate({ to: "/my-trips/$tripId", params: { tripId: ready.tripId } })
                }
              >
                Lihat dulu
              </button>
              <button
                type="button"
                disabled={applying}
                className="tap min-h-9 flex-1 rounded-xl bg-brand-red px-3 text-[13px] font-bold text-white disabled:opacity-50"
                onClick={() => void applyAndOpen()}
              >
                {applying ? "Menerapkan…" : "Terapkan semua & buka"}
              </button>
            </div>
          }
        >
          Rencananya siap{ready.items ? `: ${ready.items} aktivitas, anggaran, dan persiapan` : ""}.
          Terapkan semua supaya masuk ke Agenda, peta, Biaya, dan Checklist, atau lihat dulu satu
          per satu.
        </Bubble>
      )}
      {failure && (
        <Bubble
          role="assistant"
          footer={
            <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-3 py-2">
              {failure.tripId ? (
                <button
                  type="button"
                  className={chip(false)}
                  onClick={() =>
                    void navigate({ to: "/my-trips/$tripId", params: { tripId: failure.tripId! } })
                  }
                >
                  Buka perjalanannya
                </button>
              ) : (
                <button
                  type="button"
                  className={chip(false)}
                  onClick={() => {
                    setFailure(null);
                    void build();
                  }}
                >
                  Coba lagi
                </button>
              )}
              <button type="button" className={chip(false)} onClick={onExit}>
                Selesai
              </button>
            </div>
          }
        >
          {failure.message}
        </Bubble>
      )}
      <div ref={endRef} />
    </div>
  );

  /** The controls for the current question (a plain function, so typed text survives re-renders). */
  function renderControls() {
    if (!q) return null;
    const ask = q.ask;
    if (ask.kind === "chips")
      return (
        <>
          {ask.chips.length > 0 && (
            <div
              className="flex flex-wrap gap-1.5 border-t border-border/60 px-3 py-2"
              data-testid="assistant-chips"
            >
              {ask.chips.map((c) => (
                <button key={c} type="button" className={chip(false)} onClick={() => answer(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          {ask.input && <InlineAnswer placeholder={ask.input} onSubmit={answer} />}
        </>
      );
    if (ask.kind === "place")
      return (
        <div className="space-y-2 border-t border-border/60 px-3 py-2">
          <FlightPlaceField
            id="wizard-origin"
            label="Kota atau bandara asal"
            value={null}
            onPick={pickOrigin}
          />
          <button type="button" className={chip(false)} onClick={skipOrigin}>
            Belum tahu
          </button>
        </div>
      );
    if (ask.kind === "date")
      return (
        <InlineAnswer
          type="date"
          min={ask.min}
          max={ask.max}
          placeholder="Pilih tanggal berangkat"
          submitLabel="Pilih tanggal"
          onSubmit={answer}
        />
      );
    if (ask.kind === "money")
      return (
        <>
          <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-3 py-2">
            {ask.chips.map((c) => (
              <button key={c} type="button" className={chip(false)} onClick={() => answer(c)}>
                {c}
              </button>
            ))}
          </div>
          <InlineAnswer
            placeholder="Ketik anggaran, mis. 20 juta"
            inputMode="text"
            onSubmit={answer}
          />
        </>
      );
    if (ask.kind === "number")
      return (
        <>
          <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-3 py-2">
            {ask.chips.map((c) => (
              <button key={c} type="button" className={chip(false)} onClick={() => answer(c)}>
                {c}
              </button>
            ))}
          </div>
          <InlineAnswer
            type="number"
            min={ask.min}
            max={ask.max}
            inputMode="numeric"
            placeholder={ask.placeholder}
            onSubmit={answer}
          />
        </>
      );
    if (ask.kind === "multi")
      return (
        <div
          className="flex flex-wrap gap-1.5 border-t border-border/60 px-3 py-2"
          data-testid="assistant-chips"
        >
          {ask.chips.map((c) => {
            const on = picked.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                className={chip(on)}
                onClick={() =>
                  setPicked((list) => (on ? list.filter((x) => x !== c) : [...list, c]))
                }
              >
                {c}
              </button>
            );
          })}
          <button
            type="button"
            className="tap min-h-8 rounded-full bg-brand-red px-3 text-xs font-bold text-white"
            onClick={() => answer(picked.length ? picked.join(", ") : "Terserah Travo")}
          >
            {picked.length ? `Lanjut (${picked.length})` : "Terserah Travo"}
          </button>
        </div>
      );
    return (
      <div className="border-t border-border/60" data-testid="plan-recap">
        <ul className="space-y-1 px-3 py-2">
          {recapLines(answers).map((row) => {
            const [label, ...rest] = row.split(": ");
            return (
              <li key={row} className="flex gap-2 text-[12px]">
                <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
                <span className="min-w-0 flex-1 font-semibold">{rest.join(": ")}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2 border-t border-border/60 px-3 py-2">
          <button
            type="button"
            className="tap inline-flex min-h-9 items-center gap-1 rounded-xl bg-secondary px-3 text-[13px] font-semibold"
            onClick={() => {
              setLines([]);
              setAnswers({});
            }}
          >
            <Pencil className="size-3.5" aria-hidden="true" /> Ulangi
          </button>
          <button
            type="button"
            className="tap min-h-9 flex-1 rounded-xl bg-brand-red px-3 text-[13px] font-bold text-white"
            onClick={() => {
              setAnswers((a) => ({ ...a, confirmed: true }));
              void build();
            }}
          >
            Buat rencana lengkap
          </button>
        </div>
      </div>
    );
  }
}
