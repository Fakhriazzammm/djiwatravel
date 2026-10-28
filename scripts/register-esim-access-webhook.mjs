import { createHmac, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const API_BASE_URL = "https://api.esimaccess.com";

export function buildWebhookUrl({ publicBaseUrl, webhookToken }) {
  const base = String(publicBaseUrl ?? "")
    .trim()
    .replace(/\/+$/, "");
  const token = String(webhookToken ?? "").trim();
  if (!/^https:\/\//i.test(base)) throw new Error("PUBLIC_BASE_URL harus menggunakan https://");
  if (!token) throw new Error("ESIM_ACCESS_WEBHOOK_TOKEN belum diisi");
  return `${base}/api/webhooks/esim-access/${encodeURIComponent(token)}`;
}

export function buildProviderRequest({ accessCode, secretKey, requestId, timestamp, path, body }) {
  const requestBody = JSON.stringify(body ?? {});
  const signature = createHmac("sha256", secretKey)
    .update(timestamp + requestId + accessCode + requestBody)
    .digest("hex");
  return {
    path,
    body: requestBody,
    headers: {
      "content-type": "application/json",
      "RT-AccessCode": accessCode,
      "RT-RequestID": requestId,
      "RT-Timestamp": timestamp,
      "RT-Signature": signature,
    },
  };
}

function providerError(payload, status) {
  return (
    payload?.errorMessage ??
    payload?.errorMsg ??
    `eSIM Access request gagal (${payload?.errorCode ?? status ?? "unknown"})`
  );
}

async function providerRequest(path, body, environment) {
  const request = buildProviderRequest({
    accessCode: environment.ESIM_ACCESS_CODE,
    secretKey: environment.ESIM_ACCESS_SECRET_KEY,
    requestId: randomUUID(),
    timestamp: String(Date.now()),
    path,
    body,
  });
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  const code = payload?.errorCode == null ? undefined : String(payload.errorCode);
  if (!response.ok || (code && code !== "0"))
    throw new Error(providerError(payload, response.status));
  return payload;
}

function extractWebhook(payload) {
  const value = payload?.obj?.webhook ?? payload?.data?.webhook ?? payload?.webhook;
  return typeof value === "string" ? value : "";
}

export function formatRegistrationResult({ webhookUrl, configuredWebhookUrl }) {
  return [
    `webhook_url=${webhookUrl}`,
    `configured_webhook_url=${configuredWebhookUrl}`,
    `verified=${configuredWebhookUrl === webhookUrl}`,
  ].join("\n");
}

function requiredEnvironment(environment) {
  const required = [
    "ESIM_ACCESS_CODE",
    "ESIM_ACCESS_SECRET_KEY",
    "ESIM_ACCESS_WEBHOOK_TOKEN",
    "PUBLIC_BASE_URL",
  ];
  const missing = required.filter((key) => !String(environment[key] ?? "").trim());
  if (missing.length) throw new Error(`Environment belum lengkap: ${missing.join(", ")}`);
}

async function main() {
  requiredEnvironment(process.env);
  const webhookUrl = buildWebhookUrl({
    publicBaseUrl: process.env.PUBLIC_BASE_URL,
    webhookToken: process.env.ESIM_ACCESS_WEBHOOK_TOKEN,
  });
  if (process.argv.includes("--dry-run")) {
    process.stdout.write(`dry_run=true\nwebhook_url=${webhookUrl}\n`);
    return;
  }
  await providerRequest("/api/v1/open/webhook/save", { webhook: webhookUrl }, process.env);
  const configuredWebhookUrl = extractWebhook(
    await providerRequest("/api/v1/open/webhook/query", {}, process.env),
  );
  if (configuredWebhookUrl !== webhookUrl) {
    throw new Error("URL webhook tersimpan tidak sama dengan URL yang diminta");
  }
  process.stdout.write(`${formatRegistrationResult({ webhookUrl, configuredWebhookUrl })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "registrasi webhook gagal";
    const safeMessage = [process.env.ESIM_ACCESS_CODE, process.env.ESIM_ACCESS_SECRET_KEY]
      .filter(Boolean)
      .reduce((output, value) => output.replaceAll(value, "[REDACTED]"), message);
    console.error(safeMessage);
    process.exitCode = 1;
  });
}
