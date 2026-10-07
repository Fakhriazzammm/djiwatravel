import type { AIInsight, AIProviderResponse } from "./contracts";
import { AIProviderEnvelopeSchema, type AIProviderEnvelope } from "./schemas";
import { mockAIInsight } from "./mock-provider";

export function parseAIModelContent(response: AIProviderResponse): AIProviderEnvelope | null {
  const content = response.choices?.[0]?.message?.content;
  if (!content) return null;
  const withoutFence = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed: unknown = JSON.parse(withoutFence);
    const result = AIProviderEnvelopeSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function previewInsight(page: string, question: string, reason: string): AIInsight {
  const envelope = mockAIInsight(question);
  const requestId = `preview-${crypto.randomUUID()}`;
  return { id: requestId, module: page, ...envelope, evidence: [...envelope.evidence, reason], isPreview: true, generatedAt: new Date().toISOString(), model: "preview", requestId };
}

export function liveInsight(page: string, envelope: AIProviderEnvelope, model: string, requestId: string): AIInsight {
  return { id: `ai-${requestId}`, module: page, ...envelope, isPreview: false, generatedAt: new Date().toISOString(), model, requestId };
}
