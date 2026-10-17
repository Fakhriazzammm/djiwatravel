const SENSITIVE_KEYS =
  /iccid|activation|sm[-_ ]?dp|secret|token|password|api[-_ ]?key|card|cvc|cvv|email|phone/i;
export function redactAIContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAIContext);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.test(key) ? "[REDACTED]" : redactAIContext(item),
    ]),
  );
}
