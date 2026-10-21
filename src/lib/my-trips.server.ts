import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pool } from "@/db/client.server";
import { requireBetterAuthUser } from "@/lib/customer-profile.server";
import { syncItineraryItem } from "@/lib/google-calendar.server";

const currencies = ["IDR", "JPY", "USD", "SGD", "KRW"] as const;
const defaultCategories = [
  "Flights",
  "Accommodation",
  "Transportation",
  "Food & Drinks",
  "Attractions",
  "Shopping",
  "eSIM & Internet",
  "Visa",
  "Insurance",
  "Emergency",
  "Other",
] as const;

const tripSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    destinationCode: z.string().trim().min(2).max(8),
    destinationName: z.string().trim().min(1).max(120),
    departureDate: z.string().date(),
    returnDate: z.string().date(),
    travelersCount: z.number().int().min(1).max(50),
    primaryCurrency: z.enum(currencies),
    totalBudgetMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    timezone: z.string().trim().max(80).optional(),
  })
  .refine((value) => value.returnDate >= value.departureDate, {
    message: "Tanggal pulang harus setelah tanggal berangkat",
    path: ["returnDate"],
  });

const expenseSchema = z.object({
  tripId: z.string().uuid(),
  description: z.string().trim().min(1).max(160),
  transactionDate: z.string().date(),
  originalAmountMinor: z.number().int().positive(),
  originalCurrency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  exchangeRate: z.number().positive().optional(),
  exchangeRateSource: z.string().trim().max(120).optional(),
  exchangeRateStatus: z.enum(["estimated", "confirmed", "manual"]).default("manual"),
  convertedAmountMinor: z.number().int().positive(),
  convertedCurrency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  categoryId: z.string().uuid().optional(),
  paymentMethod: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const itinerarySchema = z
  .object({
    tripId: z.string().uuid(),
    activityDate: z.string().date(),
    startTime: z
      .string()
      .regex(/^([01]\\d|2[0-3]):[0-5]\\d$/)
      .optional(),
    endTime: z
      .string()
      .regex(/^([01]\\d|2[0-3]):[0-5]\\d$/)
      .optional(),
    timezone: z.string().trim().max(80).optional(),
    title: z.string().trim().min(1).max(160),
    location: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    estimatedCostMinor: z.number().int().min(0).optional(),
    currency: z.string().trim().length(3).optional(),
    bookingReference: z.string().trim().max(120).optional(),
    activityCategory: z.string().trim().max(80).optional(),
  })
  .refine((value) => !value.startTime || !value.endTime || value.endTime >= value.startTime, {
    message: "Waktu selesai harus setelah waktu mulai",
    path: ["endTime"],
  });

const checklistSchema = z.object({
  tripId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  dueDate: z.string().date().optional(),
});

const bookingSchema = z.object({ tripId: z.string().uuid(), category: z.string().trim().max(80).optional(), title: z.string().trim().min(1).max(160), bookingDate: z.string().date().optional(), provider: z.string().trim().max(160).optional(), referenceNumber: z.string().trim().max(120).optional(), notes: z.string().trim().max(2000).optional() });

const tripIdSchema = z.object({ tripId: z.string().uuid() });

function statusFor(
  departure: string,
  returnDate: string,
  today = new Date().toISOString().slice(0, 10),
) {
  if (today < departure) return "upcoming" as const;
  if (today > returnDate) return "past" as const;
  return "ongoing" as const;
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

async function ownedTrip(tripId: string, subject: string) {
  const result = await pool.query(
    "select id, name, destination_code, destination_name, departure_date, return_date, travelers_count, primary_currency, total_budget_minor, timezone, created_at, updated_at from travel_trips where id = $1 and customer_auth_subject = $2 limit 1",
    [tripId, subject],
  );
  if (!result.rows[0]) throw new Error("Perjalanan tidak ditemukan");
  return result.rows[0] as Record<string, unknown>;
}

export async function listTrips() {
  const user = await requireBetterAuthUser();
  const result = await pool.query(
    `select t.*, coalesce(sum(e.converted_amount_minor), 0) as spent_minor,
      (select count(*) from travel_checklist_items c where c.trip_id=t.id) as checklist_total,
      (select count(*) from travel_checklist_items c where c.trip_id=t.id and c.is_completed) as checklist_done
     from travel_trips t left join travel_expenses e on e.trip_id=t.id
     where t.customer_auth_subject=$1 group by t.id order by t.departure_date asc`,
    [user.id],
  );
  return result.rows.map((row) => ({
    ...row,
    total_budget_minor: money(row.total_budget_minor),
    spent_minor: money(row.spent_minor),
    status: statusFor(String(row.departure_date), String(row.return_date)),
    checklist_total: Number(row.checklist_total ?? 0),
    checklist_done: Number(row.checklist_done ?? 0),
  }));
}

export async function createTrip(input: unknown) {
  const data = tripSchema.parse(input);
  const user = await requireBetterAuthUser();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const trip = await client.query(
      `insert into travel_trips (customer_auth_subject,name,destination_code,destination_name,departure_date,return_date,travelers_count,primary_currency,total_budget_minor,timezone)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [
        user.id,
        data.name,
        data.destinationCode.toUpperCase(),
        data.destinationName,
        data.departureDate,
        data.returnDate,
        data.travelersCount,
        data.primaryCurrency,
        data.totalBudgetMinor,
        data.timezone ?? null,
      ],
    );
    for (const [index, name] of defaultCategories.entries()) {
      await client.query(
        `insert into travel_budget_categories (trip_id,name,category_key,allocated_minor,currency,sort_order) values ($1,$2,$3,0,$4,$5)`,
        [
          trip.rows[0].id,
          name,
          name.toLowerCase().replaceAll(" ", "-"),
          data.primaryCurrency,
          index,
        ],
      );
    }
    for (const [index, title] of [
      "Passport",
      "Visa",
      "Flight tickets",
      "Hotel booking",
      "Travel insurance",
      "eSIM installation",
      "Currency exchange",
      "Packing",
      "Airport preparation",
    ].entries()) {
      await client.query(
        `insert into travel_checklist_items (trip_id,title,sort_order,is_default) values ($1,$2,$3,true)`,
        [trip.rows[0].id, title, index],
      );
    }
    await client.query("commit");
    return { ...trip.rows[0], status: statusFor(data.departureDate, data.returnDate) };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getTripDashboard(tripId: string) {
  const user = await requireBetterAuthUser();
  const trip = await ownedTrip(tripId, user.id);
  const [budget, expenses, itinerary, checklist, bookings, places, documents] = await Promise.all([
    pool.query("select * from travel_budget_categories where trip_id=$1 order by sort_order", [
      tripId,
    ]),
    pool.query(
      "select * from travel_expenses where trip_id=$1 order by transaction_date desc, created_at desc",
      [tripId],
    ),
    pool.query(
      "select * from travel_itinerary_items where trip_id=$1 order by activity_date, start_time nulls last",
      [tripId],
    ),
    pool.query(
      "select * from travel_checklist_items where trip_id=$1 order by sort_order, created_at",
      [tripId],
    ),
    pool.query(
      "select * from travel_bookings where trip_id=$1 order by booking_date nulls last, created_at desc",
      [tripId],
    ),
    pool.query(
      "select * from travel_saved_places where trip_id=$1 order by planned_visit_date nulls last, created_at desc",
      [tripId],
    ),
    pool.query(
      "select id,category,title,notes,created_at from travel_documents where trip_id=$1 order by created_at desc",
      [tripId],
    ),
  ]);
  const totalSpent = expenses.rows.reduce((sum, row) => sum + money(row.converted_amount_minor), 0);
  return {
    trip: {
      ...trip,
      total_budget_minor: money(trip["total_budget_minor"]),
      status: statusFor(String(trip["departure_date"]), String(trip["return_date"])),
    },
    budget: budget.rows.map((row) => ({ ...row, allocated_minor: money(row.allocated_minor) })),
    expenses: expenses.rows.map((row) => ({
      ...row,
      original_amount_minor: money(row.original_amount_minor),
      converted_amount_minor: money(row.converted_amount_minor),
    })),
    itinerary: itinerary.rows,
    checklist: checklist.rows,
    bookings: bookings.rows,
    places: places.rows,
    documents: documents.rows,
    totals: {
      spentMinor: totalSpent,
      remainingMinor: money(trip["total_budget_minor"]) - totalSpent,
    },
  };
}

export async function addExpense(input: unknown) {
  const data = expenseSchema.parse(input);
  const user = await requireBetterAuthUser();
  await ownedTrip(data.tripId, user.id);
  const result = await pool.query(
    `insert into travel_expenses (trip_id,category_id,description,transaction_date,original_amount_minor,original_currency,exchange_rate,exchange_rate_source,exchange_rate_status,exchange_rate_as_of,converted_amount_minor,converted_currency,payment_method,notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,$11,$12,$13) returning *`,
    [
      data.tripId,
      data.categoryId ?? null,
      data.description,
      data.transactionDate,
      data.originalAmountMinor,
      data.originalCurrency,
      data.exchangeRate ?? null,
      data.exchangeRateSource ?? null,
      data.exchangeRateStatus,
      data.convertedAmountMinor,
      data.convertedCurrency,
      data.paymentMethod ?? null,
      data.notes ?? null,
    ],
  );
  return result.rows[0];
}

export async function addItineraryItem(input: unknown) {
  const data = itinerarySchema.parse(input);
  const user = await requireBetterAuthUser();
  await ownedTrip(data.tripId, user.id);
  const result = await pool.query(
    `insert into travel_itinerary_items (trip_id,activity_date,start_time,end_time,timezone,title,location,notes,estimated_cost_minor,currency,booking_reference,activity_category)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [
      data.tripId,
      data.activityDate,
      data.startTime ?? null,
      data.endTime ?? null,
      data.timezone ?? null,
      data.title,
      data.location ?? null,
      data.notes ?? null,
      data.estimatedCostMinor ?? null,
      data.currency?.toUpperCase() ?? null,
      data.bookingReference ?? null,
      data.activityCategory ?? null,
    ],
  );
  const item = result.rows[0];
  try {
    await syncItineraryItem(String(item.id), user.id);
  } catch (error) {
    // Calendar sync must never roll back a saved itinerary item.
    console.error("[google-calendar] itinerary sync failed", error);
  }
  return item;
}

export async function toggleChecklist(input: unknown) {
  const data = z.object({ id: z.string().uuid(), completed: z.boolean() }).parse(input);
  const user = await requireBetterAuthUser();
  const result = await pool.query(
    `update travel_checklist_items c set is_completed=$1, updated_at=now() from travel_trips t where c.id=$2 and c.trip_id=t.id and t.customer_auth_subject=$3 returning c.*`,
    [data.completed, data.id, user.id],
  );
  if (!result.rows[0]) throw new Error("Checklist tidak ditemukan");
  return result.rows[0];
}

export async function addBooking(input: unknown) {
  const data = bookingSchema.parse(input); const user = await requireBetterAuthUser(); await ownedTrip(data.tripId, user.id);
  const result = await pool.query(`insert into travel_bookings (trip_id,category,title,booking_date,provider,reference_number,notes,status) values ($1,$2,$3,$4,$5,$6,$7,'planned') returning *`, [data.tripId, data.category ?? null, data.title, data.bookingDate ?? null, data.provider ?? null, data.referenceNumber ?? null, data.notes ?? null]);
  return result.rows[0];
}

export async function addChecklistItem(input: unknown) {
  const data = checklistSchema.parse(input);
  const user = await requireBetterAuthUser();
  await ownedTrip(data.tripId, user.id);
  const result = await pool.query(
    `insert into travel_checklist_items (trip_id,title,due_date,sort_order) values ($1,$2,$3,coalesce((select max(sort_order)+1 from travel_checklist_items where trip_id=$1),0)) returning *`,
    [data.tripId, data.title, data.dueDate ?? null],
  );
  return result.rows[0];
}


async function ownedChild(table: string, id: string, tripId: string, subject: string) {
  const allowed = new Set(["travel_budget_categories", "travel_expenses", "travel_itinerary_items", "travel_checklist_items", "travel_bookings"]);
  if (!allowed.has(table)) throw new Error("Entity tidak valid");
  const result = await pool.query(
    `select c.* from ${table} c join travel_trips t on t.id=c.trip_id where c.id=$1 and c.trip_id=$2 and t.customer_auth_subject=$3 limit 1`,
    [id, tripId, subject],
  );
  if (!result.rows[0]) throw new Error("Data tidak ditemukan");
  return result.rows[0];
}

export async function updateTrip(input: unknown) {
  const data = tripSchema.and(z.object({ tripId: z.string().uuid() })).parse(input);
  const user = await requireBetterAuthUser();
  const result = await pool.query(
    `update travel_trips set name=$1,destination_code=$2,destination_name=$3,departure_date=$4,return_date=$5,travelers_count=$6,primary_currency=$7,total_budget_minor=$8,timezone=$9,updated_at=now() where id=$10 and customer_auth_subject=$11 returning *`,
    [data.name, data.destinationCode.toUpperCase(), data.destinationName, data.departureDate, data.returnDate, data.travelersCount, data.primaryCurrency, data.totalBudgetMinor, data.timezone ?? null, data.tripId, user.id],
  );
  if (!result.rows[0]) throw new Error("Perjalanan tidak ditemukan");
  return { ...result.rows[0], status: statusFor(data.departureDate, data.returnDate) };
}

export async function updateBudget(input: unknown) {
  const data = z.object({ tripId:z.string().uuid(), id:z.string().uuid(), name:z.string().trim().min(1).max(80), allocatedMinor:z.number().int().min(0), currency:z.string().length(3) }).parse(input);
  const user = await requireBetterAuthUser(); await ownedTrip(data.tripId, user.id);
  const result = await pool.query(`update travel_budget_categories set name=$1,allocated_minor=$2,currency=$3,updated_at=now() where id=$4 and trip_id=$5 returning *`, [data.name,data.allocatedMinor,data.currency.toUpperCase(),data.id,data.tripId]);
  if (!result.rows[0]) throw new Error("Kategori budget tidak ditemukan"); return result.rows[0];
}

export async function updateExpense(input: unknown) {
  const data = expenseSchema.extend({ id:z.string().uuid() }).parse(input); const user=await requireBetterAuthUser(); await ownedTrip(data.tripId,user.id);
  const result=await pool.query(`update travel_expenses set category_id=$1,description=$2,transaction_date=$3,original_amount_minor=$4,original_currency=$5,exchange_rate=$6,exchange_rate_source=$7,exchange_rate_status=$8,converted_amount_minor=$9,converted_currency=$10,payment_method=$11,notes=$12,updated_at=now() where id=$13 and trip_id=$14 returning *`,[data.categoryId??null,data.description,data.transactionDate,data.originalAmountMinor,data.originalCurrency,data.exchangeRate??null,data.exchangeRateSource??null,data.exchangeRateStatus,data.convertedAmountMinor,data.convertedCurrency,data.paymentMethod??null,data.notes??null,data.id,data.tripId]);
  if(!result.rows[0]) throw new Error("Pengeluaran tidak ditemukan"); return result.rows[0];
}

export async function updateItinerary(input: unknown) {
  const data=itinerarySchema.extend({id:z.string().uuid()}).parse(input); const user=await requireBetterAuthUser(); await ownedTrip(data.tripId,user.id);
  const result=await pool.query(`update travel_itinerary_items set activity_date=$1,start_time=$2,end_time=$3,timezone=$4,title=$5,location=$6,notes=$7,estimated_cost_minor=$8,currency=$9,booking_reference=$10,activity_category=$11,updated_at=now() where id=$12 and trip_id=$13 returning *`,[data.activityDate,data.startTime??null,data.endTime??null,data.timezone??null,data.title,data.location??null,data.notes??null,data.estimatedCostMinor??null,data.currency?.toUpperCase()??null,data.bookingReference??null,data.activityCategory??null,data.id,data.tripId]);
  if(!result.rows[0]) throw new Error("Agenda tidak ditemukan"); return result.rows[0];
}

export async function updateChecklist(input: unknown) {
  const data=checklistSchema.extend({id:z.string().uuid(),completed:z.boolean().optional()}).parse(input); const user=await requireBetterAuthUser(); await ownedTrip(data.tripId,user.id);
  const result=await pool.query(`update travel_checklist_items set title=$1,due_date=$2,is_completed=coalesce($3,is_completed),updated_at=now() where id=$4 and trip_id=$5 returning *`,[data.title,data.dueDate??null,data.completed??null,data.id,data.tripId]);
  if(!result.rows[0]) throw new Error("Checklist tidak ditemukan"); return result.rows[0];
}

export async function updateBooking(input: unknown) {
  const data=bookingSchema.extend({id:z.string().uuid(),status:z.enum(["manual","cancelled","completed"]).optional()}).parse(input); const user=await requireBetterAuthUser(); await ownedTrip(data.tripId,user.id);
  const result=await pool.query(`update travel_bookings set category=$1,title=$2,booking_date=$3,provider=$4,reference_number=$5,notes=$6,status=coalesce($7,status),updated_at=now() where id=$8 and trip_id=$9 returning *`,[data.category??null,data.title,data.bookingDate??null,data.provider??null,data.referenceNumber??null,data.notes??null,data.status??null,data.id,data.tripId]);
  if(!result.rows[0]) throw new Error("Booking tidak ditemukan"); return result.rows[0];
}

export async function deleteTripEntity(input: unknown) {
  const data=z.object({tripId:z.string().uuid(),id:z.string().uuid(),entity:z.enum(["budget","expense","itinerary","checklist","booking"])}).parse(input); const user=await requireBetterAuthUser();
  const table={budget:"travel_budget_categories",expense:"travel_expenses",itinerary:"travel_itinerary_items",checklist:"travel_checklist_items",booking:"travel_bookings"}[data.entity]; await ownedChild(table,data.id,data.tripId,user.id);
  await pool.query(`delete from ${table} where id=$1 and trip_id=$2`,[data.id,data.tripId]); return {id:data.id};
}

export const patchTrip = createServerFn({ method: "POST" }).validator(tripSchema.and(z.object({ tripId: z.string().uuid() }))).handler(({ data }) => updateTrip(data));
export const patchBudget = createServerFn({ method: "POST" }).handler(({ data }) => updateBudget(data));
export const patchExpense = createServerFn({ method: "POST" }).handler(({ data }) => updateExpense(data));
export const patchItinerary = createServerFn({ method: "POST" }).handler(({ data }) => updateItinerary(data));
export const patchChecklistItem = createServerFn({ method: "POST" }).handler(({ data }) => updateChecklist(data));
export const patchBooking = createServerFn({ method: "POST" }).handler(({ data }) => updateBooking(data));
export const removeTripEntity = createServerFn({ method: "POST" }).handler(({ data }) => deleteTripEntity(data));

export const getMyTrips = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return await listTrips();
  } catch (error) {
    // My Trips is a read-only surface: an auth/database hiccup must not replace
    // the whole page with the generic route error screen. Keep the failure
    // observable in server logs and render the empty state as a safe fallback.
    console.error("[my-trips] failed to load trips", error);
    return [];
  }
});
export const postTrip = createServerFn({ method: "POST" })
  .validator(tripSchema)
  .handler(({ data }) => createTrip(data));
export const getTrip = createServerFn({ method: "GET" })
  .validator(tripIdSchema)
  .handler(({ data }) => getTripDashboard(data.tripId));
export const postExpense = createServerFn({ method: "POST" })
  .validator(expenseSchema)
  .handler(({ data }) => addExpense(data));
export const postItinerary = createServerFn({ method: "POST" })
  .validator(itinerarySchema)
  .handler(({ data }) => addItineraryItem(data));
export const postChecklist = createServerFn({ method: "POST" })
  .validator(checklistSchema)
  .handler(({ data }) => addChecklistItem(data));
export const postBooking = createServerFn({ method: "POST" })
  .validator(bookingSchema)
  .handler(({ data }) => addBooking(data));
export const patchChecklist = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), completed: z.boolean() }))
  .handler(({ data }) => toggleChecklist(data));

export const myTripsContract = {
  auth: "Better Auth HttpOnly session; all queries are scoped to user.id",
  money: "integer minor units; original and converted expense values are stored separately",
  status: "derived from departure/return dates on server",
  eSim: "trip linking is optional and does not modify provisioning or checkout",
} as const;
