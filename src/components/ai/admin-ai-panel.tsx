import { BrainCircuit, ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import type { AIInsight } from "@/lib/ai/contracts";
import { generateAdminAIInsight } from "@/lib/admin-ai-insight.fn";

export function AdminAIInsight({ page }: { page: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<AIInsight | null>(null);
  async function generate() {
    setLoading(true);
    try {
      setInsight(await generateAdminAIInsight({ data: { page } }));
    } catch {
      setInsight(null);
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="mb-6 rounded-2xl border border-[#d9c8ff] bg-[#fbf9ff] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl bg-[#eee7ff] p-2">
          <BrainCircuit className="size-5 text-[#6e45c7]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-[#3e315d]">AI decision support</h2>
            <span
              className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${insight?.isPreview ? "bg-[#fff4df] text-[#9a6100]" : "bg-[#eee7ff] text-[#6e45c7]"}`}
            >
              {insight ? (insight.isPreview ? "Preview fallback" : "Live AI") : "Read-only"}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#726982]">
            Rekomendasi read-only untuk {page}; tidak menjalankan action.
          </p>
        </div>
        <button
          onClick={() => setOpen((value) => !value)}
          className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#d9c8ff] bg-white px-3 text-sm font-semibold text-[#5a3da2]"
        >
          {open ? "Hide" : "Show insight"}
          <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="mt-4 rounded-xl border border-[#e8defd] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[#726982]">
              Source: aggregate operational data · Status:{" "}
              {insight ? (insight.isPreview ? "fallback" : "live") : "ready"}
            </p>
            <button
              onClick={() => void generate()}
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#6e45c7] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Sparkles className="size-4" />
              {loading ? "Generating..." : "Generate insight"}
            </button>
          </div>
          {insight && (
            <div className="mt-4 border-t border-[#f0ebff] pt-4">
              <p className="font-semibold text-[#3e315d]">{insight.title}</p>
              <p className="mt-2 text-sm text-[#5f566b]">{insight.summary}</p>
              <p className="mt-3 text-sm font-semibold text-[#5a3da2]">
                Next safe step: {insight.recommendation}
              </p>
              <ul className="mt-3 list-disc pl-5 text-xs text-[#726982]">
                {insight.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
