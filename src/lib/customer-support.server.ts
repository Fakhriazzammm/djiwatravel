import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireBetterAuthUser } from "./customer-profile.server";

const createSchema = z.object({
  action: z.literal("create"),
  order_id: z.string().trim().min(1).max(128).optional(),
  category: z.string().trim().min(1).max(64),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10000),
  idempotency_key: z.string().trim().min(1).max(128).optional(),
});
const replySchema = z.object({
  action: z.literal("reply"),
  case_id: z.string().uuid(),
  body: z.string().trim().min(1).max(10000),
  client_message_id: z.string().trim().min(1).max(128).optional(),
});
const inputSchema = z.discriminatedUnion("action", [createSchema, replySchema]);
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const safeCase = (r: any) => ({
  id: r.id,
  public_case_code: r.public_case_code,
  category: r.category,
  subject: r.subject,
  description: r.description,
  status: r.status,
  priority: r.priority,
  order_id: r.order_id,
  created_at: r.created_at,
  updated_at: r.updated_at,
});
const safeMessage = (r: any) => ({
  id: r.id,
  case_id: r.case_id,
  author_type: r.author_type,
  body: r.body,
  created_at: r.created_at,
});

export async function listCustomerCases() {
  const user = await requireBetterAuthUser();
  const cases = await pool.query(
    "select id, public_case_code, category, subject, description, status, priority, order_id, created_at, updated_at from support_cases where customer_auth_subject = $1 order by updated_at desc",
    [user.id],
  );
  return {
    cases: cases.rows.map(safeCase),
    limitation: "Order binding is unavailable in this runtime; order_id is rejected.",
  };
}

export async function mutateCustomerSupport(input: unknown) {
  const data = inputSchema.parse(input);
  const user = await requireBetterAuthUser();
  if ("order_id" in data && data.order_id)
    throw new Error("Order binding is unavailable; omit order_id");
  const fp = fingerprint(data);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (data.action === "create") {
      if (data.idempotency_key) {
        const prior = await client.query(
          "select * from support_cases where customer_auth_subject = $1 and idempotency_key = $2",
          [user.id, data.idempotency_key],
        );
        if (prior.rows[0]) {
          if (prior.rows[0].request_fingerprint !== fp)
            throw Object.assign(new Error("Idempotency key fingerprint mismatch"), { status: 409 });
          await client.query("commit");
          return { case: safeCase(prior.rows[0]), replayed: true };
        }
      }
      const result = await client.query(
        "insert into support_cases (id, public_case_code, customer_auth_subject, idempotency_key, request_fingerprint, customer_created_at, category, subject, description) values (gen_random_uuid(), 'CS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), $1, $2, $3, now(), $4, $5, $6) returning *",
        [user.id, data.idempotency_key ?? null, fp, data.category, data.subject, data.description],
      );
      await client.query(
        "insert into support_case_messages (case_id, author_type, author_subject, body, request_fingerprint) values ($1, 'customer', $2, $3, $4)",
        [result.rows[0].id, user.id, data.description, fp],
      );
      await client.query("commit");
      return { case: safeCase(result.rows[0]), replayed: false };
    }
    const found = await client.query(
      "select * from support_cases where id = $1 and customer_auth_subject = $2",
      [data.case_id, user.id],
    );
    if (!found.rows[0]) throw new Error("Support case tidak ditemukan");
    if (data.client_message_id) {
      const prior = await client.query(
        "select * from support_case_messages where case_id = $1 and client_message_id = $2",
        [data.case_id, data.client_message_id],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_fingerprint !== fp)
          throw Object.assign(new Error("Client message id fingerprint mismatch"), { status: 409 });
        await client.query("commit");
        return { message: safeMessage(prior.rows[0]), replayed: true };
      }
    }
    const result = await client.query(
      "insert into support_case_messages (case_id, author_type, author_subject, body, client_message_id, request_fingerprint) values ($1, 'customer', $2, $3, $4, $5) returning *",
      [data.case_id, user.id, data.body, data.client_message_id ?? null, fp],
    );
    await client.query("update support_cases set updated_at = now() where id = $1", [data.case_id]);
    await client.query("commit");
    return { message: safeMessage(result.rows[0]), replayed: false };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export const getCustomerSupport = createServerFn({ method: "GET" }).handler(() =>
  listCustomerCases(),
);
export const postCustomerSupport = createServerFn({ method: "POST" })
  .validator(inputSchema)
  .handler(({ data }) => mutateCustomerSupport(data));
export const customerSupportContract = {
  auth: "Better Auth HttpOnly session; customer_auth_subject is derived from session user.id",
  order_binding: "order_id rejected because canonical ownership mapping is unavailable",
  idempotency: "exact replay returns original resource; fingerprint mismatch returns 409",
} as const;
