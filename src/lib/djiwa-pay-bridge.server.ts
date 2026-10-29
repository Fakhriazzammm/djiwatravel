const PAY_BRIDGE_START_URL = "https://api.djiwatentram.web.id/v1/customer/pay-bridge/start";
const TRAVEL_ORIGIN = "https://djiwatravel.com";
const ALLOWED_PAY_ORIGINS = new Set(["https://djiwapay.web.id", "https://pay.djiwatentram.web.id"]);

export class DjiwaPayBridgeError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 502,
  ) {
    super(message);
    this.name = "DjiwaPayBridgeError";
  }
}

export async function createDjiwaPayBridgeUrl(request: Request) {
  const cookie = request.headers.get("cookie")?.trim();
  if (!cookie) throw new DjiwaPayBridgeError("Autentikasi diperlukan", 401);

  const returnTo = new URL("https://djiwapay.web.id/");
  const url = `${PAY_BRIDGE_START_URL}?returnTo=${encodeURIComponent(returnTo.toString())}`;
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "manual",
      headers: {
        accept: "text/html",
        cookie,
        origin: TRAVEL_ORIGIN,
      },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new DjiwaPayBridgeError("SSO Djiwa Pay sedang tidak tersedia", 502);
  }

  if (response.status === 401) {
    throw new DjiwaPayBridgeError("Autentikasi diperlukan", 401);
  }
  if (response.status < 300 || response.status >= 400) {
    throw new DjiwaPayBridgeError("SSO Djiwa Pay gagal dimulai", 502);
  }

  const location = response.headers.get("location");
  if (!location) throw new DjiwaPayBridgeError("SSO Djiwa Pay tidak menghasilkan tujuan", 502);

  let target: URL;
  try {
    target = new URL(location);
  } catch {
    throw new DjiwaPayBridgeError("Tujuan SSO Djiwa Pay tidak valid", 502);
  }
  if (target.protocol !== "https:" || !ALLOWED_PAY_ORIGINS.has(target.origin)) {
    throw new DjiwaPayBridgeError("Tujuan SSO Djiwa Pay tidak diizinkan", 502);
  }
  return target.toString();
}
