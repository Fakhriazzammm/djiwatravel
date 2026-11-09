import { describe, expect, it } from "vitest";
import {
  channelFor,
  classifyUserAgent,
  clickThroughPer100,
  isCountableDocumentRequest,
  safeHitPath,
} from "@/lib/traffic-census";

describe("traffic census", () => {
  it("separates assistants, AI crawlers, training bots and search engines", () => {
    expect(classifyUserAgent("Mozilla/5.0 AppleWebKit; compatible; ChatGPT-User/1.0")).toEqual({
      kind: "ai_answer",
      bot: "ChatGPT",
    });
    expect(classifyUserAgent("Claude-User/1.0")).toEqual({ kind: "ai_answer", bot: "Claude" });
    expect(classifyUserAgent("Mozilla/5.0 (compatible; OAI-SearchBot/1.0)")).toEqual({
      kind: "ai_crawl",
      bot: "ChatGPT search",
    });
    expect(classifyUserAgent("Mozilla/5.0 (compatible; GPTBot/1.2)")).toEqual({
      kind: "ai_train",
      bot: "GPTBot",
    });
    expect(classifyUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toEqual({
      kind: "search_engine",
      bot: "Google",
    });
    expect(classifyUserAgent("Mozilla/5.0 (compatible; bingbot/2.0)")).toEqual({
      kind: "search_engine",
      bot: "Bing",
    });
  });

  it("names newer AI crawlers and keeps SEO tools as unidentified-but-named", () => {
    expect(
      classifyUserAgent("Mozilla/5.0 (compatible; Reflectionbot/1.0; +https://reflection.ai/bot)"),
    ).toEqual({ kind: "ai_train", bot: "Reflection AI" });
    expect(
      classifyUserAgent("Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +claudebot@anthropic.com)"),
    ).toEqual({ kind: "ai_crawl", bot: "Claude search" });
    expect(
      classifyUserAgent(
        "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
      ),
    ).toEqual({ kind: "unknown_bot", bot: "SemrushBot" });
  });

  it("treats real browsers as browsers and unidentified automation as unknown", () => {
    expect(
      classifyUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile Safari",
      ),
    ).toEqual({ kind: "browser" });
    expect(classifyUserAgent("python-requests/2.31")).toMatchObject({ kind: "unknown_bot" });
    expect(classifyUserAgent("")).toMatchObject({ kind: "unknown_bot" });
  });

  it("only counts GET page loads, never assets, API or Admin", () => {
    expect(isCountableDocumentRequest("GET", "/destination/JP", "text/html")).toBe(true);
    expect(isCountableDocumentRequest("POST", "/", "text/html")).toBe(false);
    expect(isCountableDocumentRequest("GET", "/assets/app.js", "*/*")).toBe(false);
    expect(isCountableDocumentRequest("GET", "/api/site-events", "text/html")).toBe(false);
    expect(isCountableDocumentRequest("GET", "/admin/traffic", "text/html")).toBe(false);
    expect(isCountableDocumentRequest("GET", "/logo.png", "*/*")).toBe(false);
  });

  it("keeps only a safe path", () => {
    expect(safeHitPath("/destination/JP?email=a@b.c")).toBe("/destination/JP");
    expect(safeHitPath("/a b")).toBe("/");
    expect(safeHitPath("/checkout/PP87JXRB5")).toBe("/checkout/:id");
    expect(safeHitPath("/order/3f1c")).toBe("/order/:id");
    expect(safeHitPath("/plan/CKH278")).toBe("/plan/CKH278");
  });

  it("labels channels and AI click-through", () => {
    expect(channelFor("chatgpt.com")).toBe("Dari jawaban AI");
    expect(channelFor("www.google.com")).toBe("Pencarian");
    expect(channelFor("l.instagram.com")).toBe("Sosial");
    expect(channelFor(null, null)).toBe("Langsung");
    expect(channelFor("example.org")).toBe("Referral");
    expect(clickThroughPer100(3, 48)).toBe(6.3);
    expect(clickThroughPer100(1, 0)).toBeNull();
  });
});
