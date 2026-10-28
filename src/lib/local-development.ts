export const LOCAL_DEMO_USER = {
  id: "local-demo-user",
  email: "local@djiwatravel.test",
  name: "Local Traveler",
} as const;

export function isLocalDevelopmentHost(hostname: string | null | undefined) {
  const normalized = (hostname ?? "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
