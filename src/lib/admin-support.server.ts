import { z } from "zod";
import { pool } from "../db/client.server";
import { getAdminEmailHandler } from "./admin-guard.server";
import { requireAdmin } from "./admin-guard";

const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reply"),
    caseId: z.string().uuid(),
    body: z.string().trim().min(1).max(10_000),
  }),
  z.object({
    action: z.literal("status"),
    caseId: z.string().uuid(),
    status: z.enum(["open", "pending", "resolved", "closed"]),
  }),
]);

export const adminSupportInput = (data: unknown) => inputSchema.parse(data);

export async function mutateAdminSupportHandler({ data }: { data: unknown }) {
  const input = adminSupportInput(data);
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const found = await client.query("select id from support_cases where id = $1 for update", [
      input.caseId,
    ]);
    if (!found.rows[0]) throw new Error("Support case tidak ditemukan");
    if (input.action === "reply") {
      await client.query(
        "insert into support_case_messages (case_id, author_type, author_subject, body, request_fingerprint) values ($1, 'admin', $2, $3, encode(digest($3, 'sha256'), 'hex'))",
        [input.caseId, actor, input.body],
      );
      await client.query("update support_cases set status = 'pending', updated_at = now() where id = $1", [input.caseId]);
    } else {
      await client.query("update support_cases set status = $2, updated_at = now() where id = $1", [
        input.caseId,
        input.status,
      ]);
    }
    await client.query("commit");
    return { ok: true, caseId: input.caseId, action: input.action, status: input.action === "reply" ? "pending" : input.status };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
