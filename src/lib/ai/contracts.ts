export type AISeverity = "info" | "low" | "medium" | "high" | "critical";
export type AIInsight = {
  id: string;
  module: string;
  title: string;
  summary: string;
  severity: AISeverity;
  recommendation: string;
  evidence: string[];
  confidence: number;
  isPreview: boolean;
  generatedAt: string;
  model: string;
  requestId: string;
};
export type AIProviderResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};
