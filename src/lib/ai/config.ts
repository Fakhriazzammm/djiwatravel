export const aiConfig = {
  enabled: process.env["AI_ENABLED"] !== "false",
  apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
  baseUrl: process.env["OPENROUTER_BASE_URL"] ?? "https://openrouter.ai/api/v1",
  model: process.env["OPENROUTER_MODEL"] ?? "google/gemini-2.5-flash",
  timeoutMs: Number(process.env["OPENROUTER_TIMEOUT_MS"] ?? 12000),
  maxTokens: Number(process.env["OPENROUTER_MAX_TOKENS"] ?? 500),
};
export function isAIConfigured() { return Boolean(aiConfig.enabled && aiConfig.apiKey && aiConfig.model); }
