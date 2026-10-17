import { describe, expect, it } from "vitest";
import { liveInsight, parseAIModelContent, previewInsight } from "@/lib/ai/live-insight";

describe("live AI insight safety", () => {
  it("parses fenced model JSON and rejects invalid output", () => {
    const parsed = parseAIModelContent({
      choices: [
        {
          message: {
            content:
              '```json\n{"title":"T","summary":"S","severity":"info","recommendation":"R","evidence":["E"],"confidence":0.8}\n```',
          },
        },
      ],
      model: "test",
    });
    expect(parsed?.title).toBe("T");
    expect(parseAIModelContent({ choices: [{ message: { content: "not json" } }] })).toBeNull();
  });
  it("marks fallback as preview and live output as non-preview", () => {
    expect(previewInsight("Dashboard", "review", "fallback").isPreview).toBe(true);
    expect(
      liveInsight(
        "Dashboard",
        {
          title: "T",
          summary: "S",
          severity: "info",
          recommendation: "R",
          evidence: [],
          confidence: 0.8,
        },
        "model",
        "req",
      ).isPreview,
    ).toBe(false);
  });
});
