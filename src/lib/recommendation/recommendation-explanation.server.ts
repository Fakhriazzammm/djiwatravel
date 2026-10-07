import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aiConfig } from "@/lib/ai/config";
import { askOpenRouter } from "@/lib/ai/openrouter-client";
import { parseAIModelContent } from "@/lib/ai/live-insight";
import { recommendationPreferencesSchema } from "./preferences";
const inputSchema = z.object({ preferences: recommendationPreferencesSchema, recommendations: z.array(z.object({ packageCode: z.string(), score: z.number(), reasons: z.array(z.string()), name: z.string(), priceIdr: z.number() })).max(8) });
export const explainRecommendations = createServerFn({ method: "POST" }).validator(inputSchema).handler(async ({ data }) => { const fallback = "Rekomendasi dihitung dari kecocokan destinasi, durasi, kuota, fitur, dan budget. Harga serta cakupan berasal dari katalog live."; if (!aiConfig.enabled || !aiConfig.apiKey || !aiConfig.model) return { summary: fallback, live: false }; try { const response = await askOpenRouter({ requestId: crypto.randomUUID(), system: "You explain already-ranked eSIM recommendations in Indonesian. Return ONLY JSON with keys title, summary, severity, recommendation, evidence array, confidence number 0..1. Never change ranking, price, coverage, or eligibility.", question: "Explain the top recommendations briefly.", state: { preferences: data.preferences, recommendations: data.recommendations } }); const parsed = parseAIModelContent(response); return parsed ? { summary: parsed.summary, live: true } : { summary: fallback, live: false }; } catch { return { summary: fallback, live: false }; } });
