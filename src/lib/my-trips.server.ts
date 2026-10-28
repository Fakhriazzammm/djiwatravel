import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pool } from "@/db/client.server";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";
import { buildMyTripsHome } from "./my-trips-home";


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

const tripPatchSchema = z.object({
  tripId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  destinationCode: z.string().trim().min(2).max(8),
  destinationName: z.string().trim().min(1).max(120),
  departureDate: z.string().date(),
  returnDate: z.string().date(),
  travelersCount: z.number().int().min(1).max(50),
  primaryCurrency: z.enum(currencies),
  totalBudgetMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  timezone: z.string().trim().max(80).optional(),
}).refine((value) => value.returnDate >= value.departureDate, { message: "Tanggal pulang harus setelah tanggal berangkat", path: ["returnDate"] });

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
const budgetPatchSchema = z.object({
  id: z.string().uuid(),
  allocatedMinor: z.number().int().min(0),
});
const bookingSchema = z.object({
  tripId: z.string().uuid(),
  category: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  bookingDate: z.string().date().optional(),
  provider: z.string().trim().max(160).optional(),
  referenceNumber: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
});
const itemIdSchema = z.object({ id: z.string().uuid() });

const tripIdSchema = z.object({ tripId: z.string().uuid() });
const tripSectionSchema = z.object({
  tripId: z.string().uuid(),
  section: z.enum(["budget", "expenses", "itinerary", "checklist", "bookings"]),
});

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
  const user = await getAuthenticatedUser();
  const result = await pool.query(
    `select t.*, coalesce(sum(e.converted_amount_minor), 0) as spent_minor,
      (select count(*) from travel_checklist_items c where c.trip_id=t.id) as checklist_total,
      (select count(*) from travel_checklist_items c where c.trip_id=t.id and c.is_completed) as checklist_done,
      (select count(*) from travel_itinerary_items i where i.trip_id=t.id) as itinerary_count,
      (select count(*) from travel_bookings b where b.trip_id=t.id) as booking_count
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
    itinerary_count: Number(row.itinerary_count ?? 0),
    booking_count: Number(row.booking_count ?? 0),
  }));
}

export async function updateTrip(input: unknown) {
  const data = tripPatchSchema.parse(input);
  const user = await getAuthenticatedUser();
  const result = await pool.query(
    `update travel_trips set name=$1,destination_code=$2,destination_name=$3,departure_date=$4,return_date=$5,travelers_count=$6,primary_currency=$7,total_budget_minor=$8,timezone=$9,updated_at=now()
     where id=$10 and customer_auth_subject=$11 returning *`,
    [data.name, data.destinationCode, data.destinationName, data.departureDate, data.returnDate, data.travelersCount, data.primaryCurrency, data.totalBudgetMinor, data.timezone ?? null, data.tripId, user.id],
  );
  if (!result.rows[0]) throw new Error("Perjalanan tidak ditemukan");
  return result.rows[0];
}

export async function createTrip(input: unknown) {
  const data = tripSchema.parse(input);
  const user = await getAuthenticatedUser();
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
  const user = await getAuthenticatedUser();
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

/** Load only the selected section so navigation is responsive on mobile. */
export async function getTripSectionData(tripId: string, section: string) {
  const user = await getAuthenticatedUser();
  const trip = await ownedTrip(tripId, user.id);
  const queries: Record<string, Promise<{ rows: Record<string, unknown>[] }>> = {
    budget: pool.query(
      "select * from travel_budget_categories where trip_id=$1 order by sort_order",
      [tripId],
    ),
    expenses: pool.query(
      "select * from travel_expenses where trip_id=$1 order by transaction_date desc, created_at desc",
      [tripId],
    ),
    itinerary: pool.query(
      "select * from travel_itinerary_items where trip_id=$1 order by activity_date, start_time nulls last",
      [tripId],
    ),
    checklist: pool.query(
      "select * from travel_checklist_items where trip_id=$1 order by sort_order, created_at",
      [tripId],
    ),
    bookings: pool.query(
      "select * from travel_bookings where trip_id=$1 order by booking_date nulls last, created_at desc",
      [tripId],
    ),
  };
  const result = await queries[section];
  if (!result) throw new Error("Section perjalanan tidak valid");
  return {
    trip: {
      ...trip,
      total_budget_minor: money(trip["total_budget_minor"]),
      status: statusFor(String(trip["departure_date"]), String(trip["return_date"])),
    },
    items: result.rows.map((row) => ({
      ...row,
      allocated_minor: money(row["allocated_minor"]),
      original_amount_minor: money(row["original_amount_minor"]),
      converted_amount_minor: money(row["converted_amount_minor"]),
    })),
  };
}

export async function patchBudgetCategory(input: unknown) {
  const data = budgetPatchSchema.parse(input);
  const user = await getAuthenticatedUser();
  const result = await pool.query(
    `update travel_budget_categories c set allocated_minor=$1, updated_at=now()
     from travel_trips t where c.id=$2 and c.trip_id=t.id and t.customer_auth_subject=$3 returning c.*`,
    [data.allocatedMinor, data.id, user.id],
  );
  if (!result.rows[0]) throw new Error("Kategori budget tidak ditemukan");
  return result.rows[0];
}

async function deleteOwned(table: "travel_expenses" | "travel_itinerary_items" | "travel_checklist_items" | "travel_bookings", id: string) {
  const user = await getAuthenticatedUser();
  const result = await pool.query(
    `delete from ${table} item using travel_trips t where item.id=$1 and item.trip_id=t.id and t.customer_auth_subject=$2 returning item.id`,
    [id, user.id],
  );
  if (!result.rows[0]) throw new Error("Item perjalanan tidak ditemukan");
  return result.rows[0];
}

export async function addBooking(input: unknown) {
  const data = bookingSchema.parse(input);
  const user = await getAuthenticatedUser();
  await ownedTrip(data.tripId, user.id);
  const result = await pool.query(
    `insert into travel_bookings (trip_id,category,title,booking_date,provider,reference_number,notes)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [data.tripId, data.category, data.title, data.bookingDate ?? null, data.provider ?? null, data.referenceNumber ?? null, data.notes ?? null],
  );
  return result.rows[0];
}

export async function deleteTripItem(input: unknown) {
  const data = itemIdSchema.parse(input);
  return deleteOwned("travel_expenses", data.id);
}

export async function deleteItineraryItem(input: unknown) {
  const data = itemIdSchema.parse(input);
  return deleteOwned("travel_itinerary_items", data.id);
}

export async function deleteChecklistItem(input: unknown) {
  const data = itemIdSchema.parse(input);
  return deleteOwned("travel_checklist_items", data.id);
}

export async function deleteBooking(input: unknown) {
  const data = itemIdSchema.parse(input);
  return deleteOwned("travel_bookings", data.id);
}

export async function addExpense(input: unknown) {
  const data = expenseSchema.parse(input);
  const user = await getAuthenticatedUser();
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
  const user = await getAuthenticatedUser();
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
  return result.rows[0];
}

export async function toggleChecklist(input: unknown) {
  const data = z.object({ id: z.string().uuid(), completed: z.boolean() }).parse(input);
  const user = await getAuthenticatedUser();
  const result = await pool.query(
    `update travel_checklist_items c set is_completed=$1, updated_at=now() from travel_trips t where c.id=$2 and c.trip_id=t.id and t.customer_auth_subject=$3 returning c.*`,
    [data.completed, data.id, user.id],
  );
  if (!result.rows[0]) throw new Error("Checklist tidak ditemukan");
  return result.rows[0];
}

export async function addChecklistItem(input: unknown) {
  const data = checklistSchema.parse(input);
  const user = await getAuthenticatedUser();
  await ownedTrip(data.tripId, user.id);
  const result = await pool.query(
    `insert into travel_checklist_items (trip_id,title,due_date,sort_order) values ($1,$2,$3,coalesce((select max(sort_order)+1 from travel_checklist_items where trip_id=$1),0)) returning *`,
    [data.tripId, data.title, data.dueDate ?? null],
  );
  return result.rows[0];
}

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
export const getMyTripsHome = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const trips = await listTrips();
    const focusId = buildMyTripsHome(trips, [], []).focusTrip?.id;
    if (!focusId) return buildMyTripsHome(trips, [], []);

    const [agenda, checklist] = await Promise.all([
      pool.query(
        `select id, trip_id, activity_date, start_time, end_time, title, location, activity_category
         from travel_itinerary_items
         where trip_id=$1 and activity_date between current_date - 1 and current_date + 14
         order by activity_date asc, start_time asc nulls last
         limit 12`,
        [focusId],
      ),
      pool.query(
        `select id, trip_id, title, due_date, is_completed
         from travel_checklist_items
         where trip_id=$1
         order by is_completed asc, due_date asc nulls last, sort_order asc
         limit 12`,
        [focusId],
      ),
    ]);
    return buildMyTripsHome(trips, agenda.rows, checklist.rows);
  } catch (error) {
    console.error("[my-trips] failed to load home", error);
    return buildMyTripsHome([], [], []);
  }
});
export const postTrip = createServerFn({ method: "POST" })
  .validator(tripSchema)
  .handler(({ data }) => createTrip(data));
export const patchTrip = createServerFn({ method: "POST" })
  .validator(tripPatchSchema)
  .handler(({ data }) => updateTrip(data));
export const getTrip = createServerFn({ method: "GET" })
  .validator(tripIdSchema)
  .handler(({ data }) => getTripDashboard(data.tripId));
export const getTripSection = createServerFn({ method: "GET" })
  .validator(tripSectionSchema)
  .handler(({ data }) => getTripSectionData(data.tripId, data.section));
export const postExpense = createServerFn({ method: "POST" })
  .validator(expenseSchema)
  .handler(({ data }) => addExpense(data));
export const postItinerary = createServerFn({ method: "POST" })
  .validator(itinerarySchema)
  .handler(({ data }) => addItineraryItem(data));
export const postChecklist = createServerFn({ method: "POST" })
  .validator(checklistSchema)
  .handler(({ data }) => addChecklistItem(data));
export const patchChecklist = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), completed: z.boolean() }))
  .handler(({ data }) => toggleChecklist(data));
export const patchBudget = createServerFn({ method: "POST" })
  .validator(budgetPatchSchema)
  .handler(({ data }) => patchBudgetCategory(data));
export const postBooking = createServerFn({ method: "POST" })
  .validator(bookingSchema)
  .handler(({ data }) => addBooking(data));
export const deleteExpense = createServerFn({ method: "POST" })
  .validator(itemIdSchema)
  .handler(({ data }) => deleteTripItem(data));
export const deleteItinerary = createServerFn({ method: "POST" })
  .validator(itemIdSchema)
  .handler(({ data }) => deleteItineraryItem(data));
export const deleteChecklist = createServerFn({ method: "POST" })
  .validator(itemIdSchema)
  .handler(({ data }) => deleteChecklistItem(data));
export const deleteBookingRecord = createServerFn({ method: "POST" })
  .validator(itemIdSchema)
  .handler(({ data }) => deleteBooking(data));

export const myTripsContract = {
  auth: "Better Auth HttpOnly session; all queries are scoped to user.id",
  money: "integer minor units; original and converted expense values are stored separately",
  status: "derived from departure/return dates on server",
  eSim: "trip linking is optional and does not modify provisioning or checkout",
} as const;
