import { timingSafeEqual } from "node:crypto";

type WebhookEnvironment = {
  ESIM_ACCESS_WEBHOOK_TOKEN?: string;
};

export function resolveWebhookToken(environment: WebhookEnvironment = process.env) {
  const token = environment.ESIM_ACCESS_WEBHOOK_TOKEN?.trim();
  return token ? token : null;
}

export function isValidWebhookToken(provided: string, expected: string | null) {
  if (!expected) return false;
  const actualBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
