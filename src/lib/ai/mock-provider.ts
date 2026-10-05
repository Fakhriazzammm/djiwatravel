import type { AIProviderEnvelope } from "./schemas";

export function mockAIInsight(question: string): AIProviderEnvelope {
  return {
    title: "AI preview",
    summary: `Preview recommendation for: ${question.slice(0, 120)}`,
    severity: "info",
    recommendation: "Review the source data manually before taking action.",
    evidence: ["Mock provider; no external model call was made."],
    confidence: 0.5,
  };
}
