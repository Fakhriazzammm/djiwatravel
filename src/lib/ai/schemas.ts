import { z } from "zod";

export const AIInsightSchema = z.object({
  id: z.string().min(1),
  module: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  recommendation: z.string().min(1),
  evidence: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  isPreview: z.boolean(),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  requestId: z.string().min(1),
});

export const AIProviderEnvelopeSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  recommendation: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

export type AIProviderEnvelope = z.infer<typeof AIProviderEnvelopeSchema>;
