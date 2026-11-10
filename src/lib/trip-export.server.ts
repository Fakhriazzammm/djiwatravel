import { pool } from "../db/client.server";
import { resolveTripOwner } from "./guest-trips.server";
import { buildPlanDocBody } from "./google-plan-doc";
import { loadPlanState } from "./google-sheets-plan.server";
import { z } from "zod";

const input = z.object({ tripId: z.string().uuid() });
export const tripExportInput = (data: unknown) => input.parse(data);

const madeAt = () =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );

/**
 * The whole trip as one printable document (itinerary, budget and spending, preparation, bookings,
 * tickets): the print page turns it into a PDF in the traveler's browser. Owner only (guests included).
 */
export async function tripExportHandler({ data }: { data: ReturnType<typeof tripExportInput> }) {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  const owned = await pool.query(
    "select name from travel_trips where id=$1 and customer_auth_subject=$2",
    [data.tripId, owner.id],
  );
  if (!owned.rows[0]) throw new Error("Perjalanan tidak ditemukan");
  const state = await loadPlanState(data.tripId);
  return { title: String(owned.rows[0].name), body: buildPlanDocBody(state, madeAt()) };
}
