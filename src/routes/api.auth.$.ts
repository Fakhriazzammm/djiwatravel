import { createFileRoute } from "@tanstack/react-router";
import { renderAuthErrorPage } from "../lib/error-page";

const UPSTREAM_BASE = "https://api.djiwatentram.web.id/api/auth";
const PUBLIC_BASE = "https://djiwatravel.com/api/auth";

function rewriteCookie(value: string) {
  const hostOnly = value.replace(/;\s*Domain=[^;]*/gi, "");
  if (/;\s*Path=/i.test(hostOnly)) return hostOnly.replace(/;\s*Path=[^;]*/gi, "; Path=/");
  return `${hostOnly}; Path=/`;
}

function cookieName(value: string) {
  return value.slice(0, value.indexOf("=")).trim();
}

function copySessionCookieToAppRoot(request: Request, headers: Headers) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return;
  const existingNames = new Set((headers.getSetCookie?.() ?? []).map(cookieName).filter(Boolean));
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!value || !/session/i.test(name) || existingNames.has(name)) continue;
    // Older sessions may still be scoped to /api/auth. Re-issue the same
    // opaque token at the app root so SSR loaders such as /my-trips receive it.
    headers.append("set-cookie", `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax`);
    existingNames.add(name);
  }
}

function rewriteText(value: string) {
  return value
    .replaceAll(UPSTREAM_BASE, PUBLIC_BASE)
    .replaceAll(encodeURIComponent(UPSTREAM_BASE), encodeURIComponent(PUBLIC_BASE));
}

async function proxyAuth(request: Request) {
  const incoming = new URL(request.url);
  const suffix = incoming.pathname.slice("/api/auth/".length);
  if (incoming.pathname === "/api/auth/error") {
    return new Response(renderAuthErrorPage(incoming.searchParams.get("error") ?? undefined), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const upstream = `${UPSTREAM_BASE}/${suffix}${incoming.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("upgrade");
  headers.delete("transfer-encoding");
  headers.delete("content-length");
  headers.set("origin", "https://djiwatravel.com");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", "https");

  const upstreamResponse = await fetch(upstream, {
    method: request.method,
    headers,
    ...(request.method === "GET" || request.method === "HEAD"
      ? {}
      : { body: await request.arrayBuffer() }),
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("content-length");
  responseHeaders.delete("content-encoding");
  const location = responseHeaders.get("location");
  if (location) responseHeaders.set("location", rewriteText(location));
  const cookies = upstreamResponse.headers.getSetCookie?.() ?? [];
  responseHeaders.delete("set-cookie");
  for (const cookie of cookies) responseHeaders.append("set-cookie", rewriteCookie(cookie));
  copySessionCookieToAppRoot(request, responseHeaders);

  const contentType = responseHeaders.get("content-type") ?? "";
  const hasNoBody =
    upstreamResponse.status === 204 ||
    upstreamResponse.status === 205 ||
    upstreamResponse.status === 304;
  const body = hasNoBody
    ? null
    : contentType.includes("application/json")
      ? rewriteText(await upstreamResponse.text())
      : await upstreamResponse.arrayBuffer();
  return new Response(body, { status: upstreamResponse.status, headers: responseHeaders });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => proxyAuth(request),
      POST: ({ request }) => proxyAuth(request),
      OPTIONS: ({ request }) => proxyAuth(request),
    },
  },
});
