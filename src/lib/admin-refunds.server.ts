import { z } from "zod";
import { pool } from "../db/client.server";
import { getAdminEmailHandler } from "./admin-guard.server";
import { requireAdmin } from "./admin-guard";

const inputSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(4).max(500),
});
export const adminRefundInput = (data: unknown) => inputSchema.parse(data);

export async function decideAdminRefundHandler({ data }: { data: unknown }) {
  const input = adminRefundInput(data);
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const status = input.decision === "approve" ? "APPROVED" : "REJECTED";
  const eventKey = `admin-refund:${input.requestId}:${status}`;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const request = await client.query("select id, order_id, status from refund_requests where id = $1 for update", [input.requestId]);
    if (!request.rows[0]) throw new Error("Refund request tidak ditemukan");
    if (request.rows[0].status !== "REQUESTED") {
      await client.query("commit");
      return { requestId: input.requestId, status: request.rows[0].status, replayed: true };
    }
    await client.query("update refund_requests set status = $2, updated_at = now() where id = $1", [input.requestId, status]);
    await client.query(
      "insert into refund_events (order_id, status, actor_subject, reason, note_safe, idempotency_key) values ($1, $2, $3, $4, $5, $6) on conflict (idempotency_key) do nothing",
      [request.rows[0].order_id, status, actor, input.reason, "Provider refund belum dijalankan; keputusan tercatat untuk tindak lanjut aman.", eventKey],
    );
    await client.query("commit");
    return { requestId: input.requestId, status, replayed: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
