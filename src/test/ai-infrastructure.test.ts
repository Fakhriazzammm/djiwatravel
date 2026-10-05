import { describe, expect, it } from "vitest";
import { InMemoryAIInsightRepository } from "@/lib/ai/repositories";
import { AIInsightSchema, AIProviderEnvelopeSchema } from "@/lib/ai/schemas";
import { isAIActionAllowed, safeRecommendation } from "@/lib/ai/policy";
import { mockAIInsight } from "@/lib/ai/mock-provider";
import { redactAIContext } from "@/lib/ai/redaction";

describe("AI infrastructure", () => {
  it("redacts sensitive nested fields", () => {
    const value = redactAIContext({ customer: { email: "a@b.test", iccid: "secret" }, safe: "ok" });
    expect(value).toEqual({ customer: { email: "[REDACTED]", iccid: "[REDACTED]" }, safe: "ok" });
  });

  it("rejects malformed provider envelopes", () => {
    expect(AIProviderEnvelopeSchema.safeParse({ title: "bad" }).success).toBe(false);
  });

  it("produces a valid preview insight", () => {
    const preview = mockAIInsight("check payment mismatch");
    expect(AIProviderEnvelopeSchema.parse(preview).confidence).toBe(0.5);
  });

  it("keeps automated actions disabled", () => {
    expect(isAIActionAllowed("refund")).toBe(false);
    expect(safeRecommendation("refund")).toBe("manual_review");
  });

  it("stores and filters insights in memory", async () => {
    const repo = new InMemoryAIInsightRepository();
    const insight = AIInsightSchema.parse({
      id: "i1", module: "payments", title: "Review", summary: "Review payment",
      severity: "medium", recommendation: "Manual review", evidence: [], confidence: 0.8,
      isPreview: true, generatedAt: new Date().toISOString(), model: "mock", requestId: "r1",
    });
    await repo.save(insight);
    expect((await repo.list("payments")).length).toBe(1);
    expect((await repo.list("orders")).length).toBe(0);
  });
});
