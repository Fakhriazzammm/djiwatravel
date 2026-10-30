import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const getAdminTeam = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminTeamHandler } = await import("./admin-team.server");
  return getAdminTeamHandler();
});
