import { pool } from "../db/client.server";
import { formatDocMoment, type DocMeta } from "./google-plan-doc";

/** The header facts of a generated document: who asked for it (their profile name, else email, else guest) and when. */
export async function docMeta(
  subject: string,
  who: { guest?: boolean; email?: string | null } = {},
): Promise<DocMeta> {
  let by = who.guest ? "Tamu (tanpa akun)" : "";
  if (!by) {
    const profile = await pool
      .query("select display_name from customer_profiles where auth_user_id=$1 limit 1", [subject])
      .catch(() => ({ rows: [] as { display_name?: string }[] }));
    by =
      String(profile.rows[0]?.display_name ?? "").trim() ||
      (who.email ?? "").trim() ||
      "Pengguna Djiwa Travel";
  }
  return { madeAt: formatDocMoment(new Date()), by: by.slice(0, 80) };
}
