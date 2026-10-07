import { z } from "zod";
export const recommendationPreferencesSchema = z.object({ destinations: z.array(z.string().trim().min(2).max(12)).min(1).max(5), durationDays: z.number().int().min(1).max(365).optional(), dataNeed: z.enum(["low", "medium", "high", "unlimited"]), budgetIdr: z.number().int().min(0).max(100_000_000).optional(), needsHotspot: z.boolean().optional(), needsTopUp: z.boolean().optional(), deviceOs: z.enum(["ios", "android", "unknown"]).optional(), regionalTravel: z.boolean().optional() });
export type RecommendationPreferences = z.infer<typeof recommendationPreferencesSchema>;
export function normalizePreferences(input: RecommendationPreferences): RecommendationPreferences { return { ...input, destinations: [...new Set(input.destinations.map((v) => v.toUpperCase()))] }; }
