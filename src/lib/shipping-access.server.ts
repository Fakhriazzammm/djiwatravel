/**
 * Who may work on Kirim Barang shipments. Admin (the ADMIN_EMAILS allowlist) can do everything.
 * Field staff ("petugas") are Google accounts the team registered in Admin, limited to the hubs they
 * work at. There is no shadow auth store: identity is the verified Better Auth session email, and
 * this table only says what that email may do. Server only.
 */
import { pool } from "../db/client.server";
import { getAdminEmailHandler, isAdminEmail } from "./admin-guard.server";
import { HUBS, isHub, type Hub } from "./shipping";

export type Ops = { email: string; name: string; isAdmin: boolean; hubs: Hub[] };

export async function currentOps(): Promise<Ops | null> {
  const email = (await getAdminEmailHandler())?.trim().toLowerCase();
  if (!email) return null;
  if (isAdminEmail(email)) return { email, name: email, isAdmin: true, hubs: [...HUBS] };
  const row = (
    await pool.query("select name, hubs, active from shipping_staff where email = $1", [email])
  ).rows[0] as { name: string; hubs: string[]; active: boolean } | undefined;
  if (!row || !row.active) return null;
  // Remember when the account was last used, without writing on every request.
  await pool
    .query(
      "update shipping_staff set last_seen_at = now() where email = $1 and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')",
      [email],
    )
    .catch(() => undefined);
  return { email, name: row.name, isAdmin: false, hubs: row.hubs.filter(isHub) };
}

export async function requireOps(): Promise<Ops> {
  const ops = await currentOps();
  if (!ops) throw new Error("Akun ini belum terdaftar sebagai petugas");
  return ops;
}

/** Name written into the shipment history. */
export const actorOf = (ops: Ops) => (ops.isAdmin ? ops.email : `${ops.name} (petugas)`);

export function assertHub(ops: Ops, hub: Hub) {
  if (!ops.isAdmin && !ops.hubs.includes(hub))
    throw new Error("Akunmu tidak terdaftar untuk lokasi ini");
}

/**
 * What field staff may do on a single shipment. Tasikmalaya staff run the drop point (receive,
 * weigh and bill, review photos, reject); every other action is Admin's.
 */
const TASIK_ACTIONS = new Set([
  "advance",
  "bill",
  "reject",
  "photo_approve",
  "photo_redo",
  "undo_receive",
]);

export function assertActionAllowed(ops: Ops, action: string, status: string) {
  if (ops.isAdmin) return;
  const ok =
    ops.hubs.includes("TASIK") &&
    TASIK_ACTIONS.has(action) &&
    (action !== "advance" || status === "AWAITING_DROP");
  if (!ok) throw new Error("Tindakan ini hanya untuk Admin");
}
