import { aiConfig, isAIConfigured } from "./config";
import type { AIProviderResponse } from "./contracts";
import { redactAIContext } from "./redaction";

export class AIProviderError extends Error {
  constructor(
    message: string,
    public code: string,
    public requestId: string,
  ) {
    super(message);
  }
}
export async function askOpenRouter(input: {
  system: string;
  state: unknown;
  question: string;
  model?: string;
  requestId?: string;
}): Promise<AIProviderResponse> {
  const requestId = input.requestId ?? crypto.randomUUID();
  if (!isAIConfigured())
    throw new AIProviderError("AI provider is not configured", "AI_NOT_CONFIGURED", requestId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), aiConfig.timeoutMs);
  try {
    const response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://www.djiwatravel.com",
        "X-Title": "Djiwa Travel",
      },
      body: JSON.stringify({
        model: input.model ?? aiConfig.model,
        temperature: 0,
        max_tokens: aiConfig.maxTokens,
        messages: [
          { role: "system", content: input.system },
          {
            role: "user",
            content: JSON.stringify({
              state: redactAIContext(input.state),
              question: input.question,
            }),
          },
        ],
      }),
    });
    if (!response.ok)
      throw new AIProviderError(
        `OpenRouter request failed (${response.status})`,
        response.status === 429 ? "AI_RATE_LIMITED" : "AI_PROVIDER_ERROR",
        requestId,
      );
    return (await response.json()) as AIProviderResponse;
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    throw new AIProviderError("OpenRouter request failed", "AI_REQUEST_FAILED", requestId);
  } finally {
    clearTimeout(timeout);
  }
}
