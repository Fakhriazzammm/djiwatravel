import { createServerFn } from "@tanstack/react-start";

import { requireAdmin } from "@/lib/admin-guard";
import { ADMIN_INVITE_READINESS, adminEmails } from "@/lib/admin-guard.server";
import { maskEmail } from "@/lib/admin-display";

/**
 * Read-only view of who can reach `/admin/*`.
 *
 * The allowlist is the only source of truth this repository actually verifies, so it is what the
 * page reports. Emails are masked before leaving the server: an admin needs to recognise the entries,
 * not to export the list. Invite/role management stays explicitly unavailable until the canonical
 * Better Auth admin API is verified — the page says so instead of pretending to offer it.
 */

export type AdminTeamMember = {
  id: string;
  maskedEmail: string;
  role: "Owner/admin allowlist";
};

export type AdminTeamView = {
  members: AdminTeamMember[];
  invite: { available: boolean; reason: string };
  /** True when no allowlist is configured; nobody can reach the console in that state. */
  empty: boolean;
};

export function buildAdminTeamView(emails: readonly string[]): AdminTeamView {
  return {
    members: emails.map((email, index) => ({
      id: `admin-allowlist-${index}`,
      maskedEmail: maskEmail(email) ?? "••••••",
      role: "Owner/admin allowlist",
    })),
    invite: {
      available: ADMIN_INVITE_READINESS.available,
      reason: ADMIN_INVITE_READINESS.reason,
    },
    empty: emails.length === 0,
  };
}

export const getAdminTeamHandler = async () => {
  await requireAdmin();
  return buildAdminTeamView(adminEmails());
};

export const getAdminTeam = createServerFn({ method: "GET" }).handler(getAdminTeamHandler);
