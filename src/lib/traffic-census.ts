/** Pure rules for the Admin "Lalu lintas" census: who is reading, and how to label them. */

export type BotKind = "ai_answer" | "ai_crawl" | "ai_train" | "search_engine" | "unknown_bot";
export type UserAgentClass = { kind: BotKind; bot: string } | { kind: "browser" };

/** Assistants that open one page because someone asked a question. */
const AI_ANSWER: [RegExp, string][] = [
  [/ChatGPT-User/i, "ChatGPT"],
  [/Claude-User/i, "Claude"],
  [/Perplexity-User/i, "Perplexity"],
  [/MistralAI-User/i, "Mistral"],
  [/DuckAssistBot/i, "DuckDuckGo AI"],
];
/** Crawlers that build an AI search index. */
const AI_SEARCH: [RegExp, string][] = [
  [/OAI-SearchBot/i, "ChatGPT search"],
  [/Claude-SearchBot/i, "Claude search"],
  [/PerplexityBot/i, "Perplexity search"],
  [/Amazonbot/i, "Amazon search"],
  [/ExaBot|\bExa\b/i, "Exa"],
  [/Applebot-Extended/i, "Apple AI"],
  [/AzureAI|Azure-?AI/i, "Azure AI search"],
];
/** Crawlers that collect training data. */
const AI_TRAIN: [RegExp, string][] = [
  [/GPTBot/i, "GPTBot"],
  [/ClaudeBot/i, "ClaudeBot"],
  [/CCBot/i, "Common Crawl"],
  [/Bytespider/i, "Bytespider"],
  [/Google-Extended/i, "Google AI"],
  [/meta-externalagent|FacebookBot/i, "Meta AI"],
  [/cohere-ai/i, "Cohere"],
];
const SEARCH_ENGINE: [RegExp, string][] = [
  [/Googlebot|Google-InspectionTool|GoogleOther/i, "Google"],
  [/bingbot|BingPreview/i, "Bing"],
  [/Applebot/i, "Apple"],
  [/YandexBot/i, "Yandex"],
  [/DuckDuckBot/i, "DuckDuckGo"],
  [/Baiduspider/i, "Baidu"],
  [/SeznamBot/i, "Seznam"],
];
/** Generic automation that is not a browser and claims no known identity. */
const GENERIC_BOT =
  /\b(bot|crawler|spider|scrapy|curl|wget|python-requests|python-urllib|aiohttp|httpx|go-http-client|java\/|okhttp|libwww|headlesschrome|phantomjs|axios|node-fetch|postmanruntime)\b/i;

function match(list: [RegExp, string][], ua: string): string | null {
  for (const [re, name] of list) if (re.test(ua)) return name;
  return null;
}

/** Classifies by the claimed identity only; the name is a claim, not a proof. */
export function classifyUserAgent(ua: string | null | undefined): UserAgentClass {
  const agent = (ua ?? "").trim();
  if (!agent) return { kind: "unknown_bot", bot: "Tanpa identitas" };
  let bot = match(AI_ANSWER, agent);
  if (bot) return { kind: "ai_answer", bot };
  bot = match(AI_TRAIN, agent);
  if (bot) return { kind: "ai_train", bot };
  bot = match(AI_SEARCH, agent);
  if (bot) return { kind: "ai_crawl", bot };
  bot = match(SEARCH_ENGINE, agent);
  if (bot) return { kind: "search_engine", bot };
  if (GENERIC_BOT.test(agent)) return { kind: "unknown_bot", bot: "Otomatis tidak dikenal" };
  return { kind: "browser" };
}

const SKIP_PREFIXES = ["/api/", "/admin", "/_serverFn", "/assets/", "/_build", "/@"];

/** Only HTML page loads count: assets, API calls, Admin and server functions never do. */
export function isCountableDocumentRequest(
  method: string,
  pathname: string,
  accept: string | null | undefined,
): boolean {
  if (method !== "GET") return false;
  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  if (/\.[A-Za-z0-9]{1,8}$/.test(pathname) && !pathname.endsWith(".html")) return false;
  const a = accept ?? "";
  return a === "" || a.includes("text/html") || a.includes("*/*");
}

/** A path that is safe to keep: no query string, no identifiers beyond the public route. */
export function safeHitPath(pathname: string): string {
  const clean = (pathname.split(/[?#]/)[0] ?? "/").slice(0, 120);
  return /^\/[A-Za-z0-9_/.-]*$/.test(clean) ? clean : "/";
}

export const AI_REFERRER_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "claude.ai",
  "perplexity.ai",
  "www.perplexity.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
  "you.com",
  "poe.com",
];

const SEARCH_HOST = /(^|\.)(google|bing|yahoo|duckduckgo|yandex|baidu|ecosia|search\.brave)\./i;
const SOCIAL_HOST =
  /(^|\.)(instagram|facebook|t\.co|twitter|x|tiktok|threads|linkedin|youtube|pinterest|wa\.me|whatsapp|l\.facebook)(\.|$)/i;

export type TrafficChannel = "Dari jawaban AI" | "Langsung" | "Pencarian" | "Sosial" | "Referral";

export function channelFor(
  referrerHost: string | null | undefined,
  utmSource?: string | null,
): TrafficChannel {
  const host = (referrerHost ?? "").toLowerCase();
  const utm = (utmSource ?? "").toLowerCase();
  if (
    AI_REFERRER_HOSTS.includes(host) ||
    /chatgpt|openai|claude|perplexity|gemini|copilot/.test(utm)
  )
    return "Dari jawaban AI";
  if (!host && !utm) return "Langsung";
  if (SEARCH_HOST.test(host) || /^(google|bing|yahoo|duckduckgo)$/.test(utm)) return "Pencarian";
  if (SOCIAL_HOST.test(host) || /instagram|facebook|tiktok|twitter|threads|whatsapp|wa$/.test(utm))
    return "Sosial";
  return "Referral";
}

export function percentShare(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** AI clicks per 100 answers, one decimal; null without answers. */
export function clickThroughPer100(clicks: number, answers: number): number | null {
  return answers > 0 ? Math.round((clicks / answers) * 1000) / 10 : null;
}

export const BOT_KIND_LABEL: Record<BotKind, string> = {
  ai_answer: "Jawaban AI",
  ai_crawl: "Pencarian AI",
  ai_train: "Pelatihan AI",
  search_engine: "Mesin pencari",
  unknown_bot: "Otomatis tidak dikenal",
};
