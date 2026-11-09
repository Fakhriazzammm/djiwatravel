import { pool } from "../db/client.server";
import { classifyUserAgent, isCountableDocumentRequest, safeHitPath } from "./traffic-census";

/**
 * Logs one automated page request (never a browser). Fire and forget: a storage failure or a
 * missing table must never slow down or break a page. No IP, user agent or header is stored.
 */
export function noteDocumentRequest(request: Request): void {
  try {
    const url = new URL(request.url);
    if (!isCountableDocumentRequest(request.method, url.pathname, request.headers.get("accept")))
      return;
    const found = classifyUserAgent(request.headers.get("user-agent"));
    if (found.kind === "browser") return;
    void pool
      .query(`insert into traffic_bot_hits (kind, bot, path) values ($1, $2, $3)`, [
        found.kind,
        found.bot,
        safeHitPath(url.pathname),
      ])
      .catch(() => undefined);
  } catch {
    // Measurement must never affect a page.
  }
}
