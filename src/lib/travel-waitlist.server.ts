import { createHash } from "node:crypto";
import { z } from "zod";
import { travelWaitlistEntries } from "../../drizzle/schema";
import { db } from "../db/client.server";
import { normalizeWhatsapp, WHATSAPP_PATTERN } from "./phone";

const schema = z
  .object({
    feature: z.enum(["bagasi", "shopper"]),
    destination: z.string().trim().min(1).max(80),
    travelDate: z.string().trim().date().optional().or(z.literal("")),
    email: z.string().trim().email().max(254).optional().or(z.literal("")),
    whatsapp: z
      .string()
      .trim()
      .min(9)
      .max(32)
      .transform(normalizeWhatsapp)
      .optional()
      .or(z.literal("")),
    consent: z.literal(true),
  })
  .superRefine((value, ctx) => {
    if (!value.email && !value.whatsapp)
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Email atau WhatsApp wajib diisi.",
      });
    if (value.whatsapp && !WHATSAPP_PATTERN.test(value.whatsapp))
      ctx.addIssue({ code: "custom", path: ["whatsapp"], message: "Nomor WhatsApp belum valid." });
  });

export async function joinTravelWaitlist(input: unknown) {
  const value = schema.parse(input);
  const email = value.email ? value.email.toLowerCase() : null;
  const whatsapp = value.whatsapp || null;
  const dedupeKey = createHash("sha256")
    .update(
      [
        value.feature,
        value.destination.toLowerCase(),
        value.travelDate || "",
        email || "",
        whatsapp || "",
      ].join("|"),
      "utf8",
    )
    .digest("hex");
  await db
    .insert(travelWaitlistEntries)
    .values({
      featureKey: value.feature,
      destination: value.destination,
      travelDate: value.travelDate || null,
      email,
      whatsapp,
      consentAt: new Date().toISOString(),
      dedupeKey,
    })
    .onConflictDoNothing({ target: travelWaitlistEntries.dedupeKey });
  return { ok: true, message: "Siap. Kami akan memberi tahu saat layanan tersedia." };
}
