import { createFileRoute } from "@tanstack/react-router";

const UPSTREAM_BASE = "https://auth.zantara.id/api/auth";
const PUBLIC_BASE = "https://djiwatravel.com/api/auth";

function rewriteCookie(value: string) {
  return value.replace(/;\s*Domain=[^;]*/gi, "");
}

function rewriteText(value: string) {
  return value.replaceAll(UPSTREAM_BASE, PUBLIC_BASE);
}

async function proxyAuth(request: Request) {
  const incoming = new URL(request.url);
  const suffix = incoming.pathname.slice("/api/auth/".length);
  const upstream = `${UPSTREAM_BASE}/${suffix}${incoming.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.set("origin", "https://djiwatravel.com");

  const upstreamResponse = await fetch(upstream, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("content-length");
  const location = responseHeaders.get("location");
  if (location) responseHeaders.set("location", rewriteText(location));
  const cookies = upstreamResponse.headers.getSetCookie?.() ?? [];
  responseHeaders.delete("set-cookie");
  for (const cookie of cookies) responseHeaders.append("set-cookie", rewriteCookie(cookie));

  const contentType = responseHeaders.get("content-type") ?? "";
  const body = contentType.includes("application/json")
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
