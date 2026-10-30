import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { pool } from "@/db/client.server";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";
import { syncItineraryItem } from "@/lib/google-calendar.server";
import { buildMyTripsHome } from "./my-trips-home";

const currencies = ["IDR", "JPY", "USD", "SGD", "KRW"] as const;
const defaultCategories = [
  "Penerbangan",
  "Akomodasi",
  "Transportasi",
  "Makan & minum",
  "Aktivitas",
  "Belanja",
  "eSIM & internet",
  "Visa",
  "Asuransi",
  "Darurat",
  "Lainnya",
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

const tripPatchSchema = z
  .object({
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

const itinerarySchema = z.object({
  tripId: z.string().uuid(),
  activityDate: z.string().date(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  timezone: z.string().trim().max(80).optional(),
  title: z.string().trim().min(1).max(160),
  location: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  estimatedCostMinor: z.number().int().min(0).optional(),
  currency: z.string().trim().length(3).optional(),
  bookingReference: z.string().trim().max(120).optional(),
  activityCategory: z.string().trim().max(80).optional(),
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
const shareTokenSchema = z.object({ token: z.string().trim().min(20).max(128) });

function statusFor(departure: string, returnDate: string, today = todayInJakarta()) {
  const start = dateText(departure) ?? departure;
  const end = dateText(returnDate) ?? returnDate;
  if (today < start) return "upcoming" as const;
  if (today > end) return "past" as const;
  return "ongoing" as const;
}

function todayInJakarta() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Postgres returns `date` columns as local Date objects; keep API dates as YYYY-MM-DD. */
function dateText(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate(),
    ).padStart(2, "0")}`;
  }
  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? raw;
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
      (select count(*) from travel_checklist_items c where c.trip_id=t.id and c.is_completed) as checklist_done
     from travel_trips t left join travel_expenses e on e.trip_id=t.id
     where t.customer_auth_subject=$1 group by t.id order by t.departure_date asc`,
    [user.id],
  );
  return result.rows.map((row) => {
    const departureDate = dateText(row.departure_date);
    const returnDate = dateText(row.return_date);
    return {
      ...row,
      departure_date: departureDate,
      return_date: returnDate,
      total_budget_minor: money(row.total_budget_minor),
      spent_minor: money(row.spent_minor),
      status: statusFor(departureDate ?? "", returnDate ?? ""),
      checklist_total: Number(row.checklist_total ?? 0),
      checklist_done: Number(row.checklist_done ?? 0),
    };
  });
}

export async function updateTrip(input: unknown) {
  const data = tripPatchSchema.parse(input);
  const user = await getAuthenticatedUser();
  const result = await pool.query(
    `update travel_trips set name=$1,destination_code=$2,destination_name=$3,departure_date=$4,return_date=$5,travelers_count=$6,primary_currency=$7,total_budget_minor=$8,timezone=$9,updated_at=now()
     where id=$10 and customer_auth_subject=$11 returning *`,
    [
      data.name,
      data.destinationCode,
      data.destinationName,
      data.departureDate,
      data.returnDate,
      data.travelersCount,
      data.primaryCurrency,
      data.totalBudgetMinor,
      data.timezone ?? null,
      data.tripId,
      user.id,
    ],
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
      "Paspor",
      "Visa",
      "Tiket penerbangan",
      "Pemesanan penginapan",
      "Asuransi perjalanan",
      "Aktifkan eSIM",
      "Tukar mata uang",
      "Siapkan barang bawaan",
      "Persiapan bandara",
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

/**
 * Copy the planning surface of a trip (budget, agenda, checklist, bookings)
 * into a new trip owned by the same customer. Expenses and checklist progress
 * are intentionally not copied: a duplicate is a fresh plan, not a clone of
 * past spending.
 */
export async function duplicateTripRecord(tripId: string) {
  const user = await getAuthenticatedUser();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const source = await client.query(
      `select name,destination_code,destination_name,departure_date::text as departure_date,
        return_date::text as return_date,travelers_count,primary_currency,total_budget_minor,timezone
       from travel_trips where id=$1 and customer_auth_subject=$2`,
      [tripId, user.id],
    );
    if (!source.rows[0]) throw new Error("Perjalanan tidak ditemukan");
    const t = source.rows[0];
    const copyName = `${String(t.name).slice(0, 110)} (salinan)`;
    const copied = await client.query(
      `insert into travel_trips (customer_auth_subject,name,destination_code,destination_name,departure_date,return_date,travelers_count,primary_currency,total_budget_minor,timezone)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [
        user.id,
        copyName,
        t.destination_code,
        t.destination_name,
        t.departure_date,
        t.return_date,
        t.travelers_count,
        t.primary_currency,
        t.total_budget_minor,
        t.timezone,
      ],
    );
    const id = copied.rows[0].id as string;
    await client.query(
      `insert into travel_budget_categories (trip_id,name,category_key,allocated_minor,currency,sort_order)
       select $1,name,category_key,allocated_minor,currency,sort_order from travel_budget_categories where trip_id=$2`,
      [id, tripId],
    );
    await client.query(
      `insert into travel_itinerary_items (trip_id,activity_date,start_time,end_time,timezone,title,location,notes,estimated_cost_minor,currency,booking_reference,activity_category)
       select $1,activity_date,start_time,end_time,timezone,title,location,notes,estimated_cost_minor,currency,booking_reference,activity_category from travel_itinerary_items where trip_id=$2`,
      [id, tripId],
    );
    await client.query(
      `insert into travel_checklist_items (trip_id,title,due_date,sort_order,is_default)
       select $1,title,due_date,sort_order,is_default from travel_checklist_items where trip_id=$2`,
      [id, tripId],
    );
    await client.query(
      `insert into travel_bookings (trip_id,category,title,booking_date,provider,reference_number,notes,status)
       select $1,category,title,booking_date,provider,reference_number,notes,'manual' from travel_bookings where trip_id=$2`,
      [id, tripId],
    );
    await client.query("commit");
    return { id };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export const duplicateTrip = createServerFn({ method: "POST" })
  .validator(tripIdSchema)
  .handler(({ data }) => duplicateTripRecord(data.tripId));

/** Return the newest active share link for an owned trip, if sharing is enabled. */
export async function getActiveTripShare(tripId: string) {
  try {
    const result = await pool.query(
      `select token, created_at from travel_trip_shares
       where trip_id=$1 and revoked_at is null
       order by created_at desc limit 1`,
      [tripId],
    );
    return result.rows[0]
      ? { token: String(result.rows[0].token), createdAt: result.rows[0].created_at as string }
      : null;
  } catch (error) {
    // Keep My Trips readable while a pre-migration deployment is rolling out.
    console.error("[my-trips] share lookup failed", error);
    return null;
  }
}

export async function createTripShareLink(tripId: string) {
  const user = await getAuthenticatedUser();
  await ownedTrip(tripId, user.id);
  const token = randomBytes(24).toString("base64url");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "update travel_trip_shares set revoked_at=now() where trip_id=$1 and revoked_at is null",
      [tripId],
    );
    const result = await client.query(
      `insert into travel_trip_shares (trip_id,token,created_by) values ($1,$2,$3)
       returning token, created_at`,
      [tripId, token, user.id],
    );
    await client.query("commit");
    return {
      token: String(result.rows[0].token),
      createdAt: result.rows[0].created_at as string,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeTripShareLink(tripId: string) {
  const user = await getAuthenticatedUser();
  const result = await pool.query(
    `update travel_trip_shares s set revoked_at=now()
     from travel_trips t
     where s.trip_id=t.id and s.trip_id=$1 and t.customer_auth_subject=$2 and s.revoked_at is null
     returning s.id`,
    [tripId, user.id],
  );
  return { revoked: Boolean(result.rows[0]) };
}

/**
 * Public read model for a shared itinerary. The bearer token is the capability;
 * it never exposes expenses, checklist, documents, or booking references.
 */
export async function loadSharedTrip(token: string) {
  if (!shareTokenSchema.safeParse({ token }).success) return null;
  const share = await pool.query(
    `select s.token, s.created_at as shared_at,
      t.id, t.name, t.destination_code, t.destination_name,
      t.departure_date::text as departure_date, t.return_date::text as return_date,
      t.travelers_count, t.primary_currency, t.timezone
     from travel_trip_shares s
     join travel_trips t on t.id=s.trip_id
     where s.token=$1 and s.revoked_at is null
     limit 1`,
    [token],
  );
  if (!share.rows[0]) return null;
  const trip = share.rows[0];
  const itinerary = await pool.query(
    `select id, activity_date::text as activity_date, start_time, end_time, timezone,
      title, location, notes, activity_category
     from travel_itinerary_items
     where trip_id=$1
     order by activity_date, start_time nulls last`,
    [trip.id],
  );
  return {
    trip,
    sharedAt: trip.shared_at as string,
    itinerary: itinerary.rows,
  };
}

export async function getTripDashboard(tripId: string) {
  const user = await getAuthenticatedUser();
  const trip = await ownedTrip(tripId, user.id);
  const [budget, expenses, itinerary, checklist, bookings, places, documents, share] =
    await Promise.all([
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
      getActiveTripShare(tripId),
    ]);
  const totalSpent = expenses.rows.reduce((sum, row) => sum + money(row.converted_amount_minor), 0);
  const departureDate = dateText(trip["departure_date"]);
  const returnDate = dateText(trip["return_date"]);
  return {
    trip: {
      ...trip,
      departure_date: departureDate,
      return_date: returnDate,
      total_budget_minor: money(trip["total_budget_minor"]),
      status: statusFor(departureDate ?? "", returnDate ?? ""),
    },
    budget: budget.rows.map((row) => ({ ...row, allocated_minor: money(row.allocated_minor) })),
    expenses: expenses.rows.map((row) => ({
      ...row,
      transaction_date: dateText(row.transaction_date),
      original_amount_minor: money(row.original_amount_minor),
      converted_amount_minor: money(row.converted_amount_minor),
    })),
    itinerary: itinerary.rows.map((row) => ({
      ...row,
      activity_date: dateText(row.activity_date),
    })),
    checklist: checklist.rows.map((row) => ({ ...row, due_date: dateText(row.due_date) })),
    bookings: bookings.rows.map((row) => ({ ...row, booking_date: dateText(row.booking_date) })),
    places: places.rows.map((row) => ({
      ...row,
      planned_visit_date: dateText(row.planned_visit_date),
    })),
    documents: documents.rows,
    share,
    totals: {
      spentMinor: totalSpent,
      remainingMinor: money(trip["total_budget_minor"]) - totalSpent,
    },
  };
}

export type TripSectionSummary = {
  allocatedMinor: number;
  spentMinor: number;
  uncategorizedSpentMinor: number;
  uncategorizedCount: number;
  budgetMinor: number;
};

export type TripSectionCategory = {
  id: string;
  name: string;
  allocated_minor: number;
  currency: string;
};

const emptySummary = (budgetMinor: number): TripSectionSummary => ({
  allocatedMinor: 0,
  spentMinor: 0,
  uncategorizedSpentMinor: 0,
  uncategorizedCount: 0,
  budgetMinor,
});

function normalizeSectionItem(row: Record<string, unknown>) {
  const { activity_date_text, ...item } = row;
  return {
    ...item,
    ...(dateText(row["activity_date"]) ? { activity_date: dateText(row["activity_date"]) } : {}),
    ...(dateText(row["due_date"]) ? { due_date: dateText(row["due_date"]) } : {}),
    ...(dateText(row["booking_date"]) ? { booking_date: dateText(row["booking_date"]) } : {}),
    ...(dateText(row["transaction_date"])
      ? { transaction_date: dateText(row["transaction_date"]) }
      : {}),
    ...(activity_date_text ? { activity_date: activity_date_text } : {}),
    allocated_minor: money(row["allocated_minor"]),
    original_amount_minor: money(row["original_amount_minor"]),
    converted_amount_minor: money(row["converted_amount_minor"]),
    spent_minor: money(row["spent_minor"]),
    expense_count: Number(row["expense_count"] ?? 0),
  };
}

/** Load only the selected section so navigation is responsive on mobile. */
export async function getTripSectionData(tripId: string, section: string) {
  const user = await getAuthenticatedUser();
  const trip = await ownedTrip(tripId, user.id);
  const budgetMinor = money(trip["total_budget_minor"]);
  const departureDate = dateText(trip["departure_date"]);
  const returnDate = dateText(trip["return_date"]);
  const tripView = {
    ...trip,
    departure_date: departureDate,
    return_date: returnDate,
    total_budget_minor: budgetMinor,
    status: statusFor(departureDate ?? "", returnDate ?? ""),
  };

  if (section === "budget") {
    const [categories, uncategorized] = await Promise.all([
      pool.query(
        `select c.*, coalesce(sum(e.converted_amount_minor), 0) as spent_minor,
          count(e.id) as expense_count
         from travel_budget_categories c
         left join travel_expenses e on e.category_id=c.id
         where c.trip_id=$1
         group by c.id
         order by c.sort_order`,
        [tripId],
      ),
      pool.query(
        `select coalesce(sum(converted_amount_minor), 0) as spent_minor, count(*) as expense_count
         from travel_expenses where trip_id=$1 and category_id is null`,
        [tripId],
      ),
    ]);
    const items = categories.rows.map(normalizeSectionItem);
    const uncategorizedSpentMinor = money(uncategorized.rows[0]?.["spent_minor"]);
    const uncategorizedCount = Number(uncategorized.rows[0]?.["expense_count"] ?? 0);
    const allocatedMinor = items.reduce((sum, item) => sum + Number(item.allocated_minor ?? 0), 0);
    const categorySpent = items.reduce((sum, item) => sum + Number(item.spent_minor ?? 0), 0);
    return {
      trip: tripView,
      items,
      categories: [] as TripSectionCategory[],
      summary: {
        allocatedMinor,
        spentMinor: categorySpent + uncategorizedSpentMinor,
        uncategorizedSpentMinor,
        uncategorizedCount,
        budgetMinor,
      } satisfies TripSectionSummary,
    };
  }

  if (section === "expenses") {
    const [expenses, categories] = await Promise.all([
      pool.query(
        `select e.*, c.name as category_name
         from travel_expenses e
         left join travel_budget_categories c on c.id=e.category_id
         where e.trip_id=$1
         order by e.transaction_date desc, e.created_at desc`,
        [tripId],
      ),
      pool.query(
        "select id, name, allocated_minor, currency from travel_budget_categories where trip_id=$1 order by sort_order",
        [tripId],
      ),
    ]);
    return {
      trip: tripView,
      items: expenses.rows.map(normalizeSectionItem),
      categories: categories.rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        allocated_minor: money(row.allocated_minor),
        currency: String(row.currency).trim(),
      })) satisfies TripSectionCategory[],
      summary: null,
    };
  }

  const queries: Record<string, () => Promise<{ rows: Record<string, unknown>[] }>> = {
    itinerary: () =>
      pool.query(
        "select *, activity_date::text as activity_date_text from travel_itinerary_items where trip_id=$1 order by activity_date, start_time nulls last",
        [tripId],
      ),
    checklist: () =>
      pool.query(
        "select * from travel_checklist_items where trip_id=$1 order by sort_order, created_at",
        [tripId],
      ),
    bookings: () =>
      pool.query(
        "select * from travel_bookings where trip_id=$1 order by booking_date nulls last, created_at desc",
        [tripId],
      ),
  };
  const selectedQuery = queries[section];
  if (!selectedQuery) throw new Error("Section perjalanan tidak valid");
  const result = await selectedQuery();
  return {
    trip: tripView,
    items: result.rows.map(normalizeSectionItem),
    categories: [] as TripSectionCategory[],
    summary: emptySummary(budgetMinor),
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

async function deleteOwned(
  table:
    "travel_expenses" | "travel_itinerary_items" | "travel_checklist_items" | "travel_bookings",
  id: string,
) {
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
    [
      data.tripId,
      data.category,
      data.title,
      data.bookingDate ?? null,
      data.provider ?? null,
      data.referenceNumber ?? null,
      data.notes ?? null,
    ],
  );
  return result.rows[0];
}

export async function deleteTrip(input: unknown) {
  const data = itemIdSchema.parse(input);
  const user = await getAuthenticatedUser();
  const result = await pool.query(
    "delete from travel_trips where id=$1 and customer_auth_subject=$2 returning id",
    [data.id, user.id],
  );
  if (!result.rows[0]) throw new Error("Perjalanan tidak ditemukan");
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
  if (data.categoryId) {
    const category = await pool.query(
      `select c.id from travel_budget_categories c
       join travel_trips t on t.id=c.trip_id
       where c.id=$1 and c.trip_id=$2 and t.customer_auth_subject=$3 limit 1`,
      [data.categoryId, data.tripId, user.id],
    );
    if (!category.rows[0]) throw new Error("Kategori anggaran tidak ditemukan");
  }
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
  const item = result.rows[0];
  try {
    await syncItineraryItem(item.id, user.id);
  } catch (error) {
    console.error("[my-trips] failed to sync itinerary item to Google Calendar", error);
  }
  return item;
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
         where trip_id=$1 and activity_date between current_date and current_date + 14
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
export const deleteTripRecord = createServerFn({ method: "POST" })
  .validator(itemIdSchema)
  .handler(({ data }) => deleteTrip(data));
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
export const postTripShare = createServerFn({ method: "POST" })
  .validator(tripIdSchema)
  .handler(({ data }) => createTripShareLink(data.tripId));
export const deleteTripShare = createServerFn({ method: "POST" })
  .validator(tripIdSchema)
  .handler(({ data }) => revokeTripShareLink(data.tripId));
export const getSharedTrip = createServerFn({ method: "GET" })
  .validator(shareTokenSchema)
  .handler(({ data }) => loadSharedTrip(data.token));

export const myTripsContract = {
  auth: "Better Auth HttpOnly session; all queries are scoped to user.id",
  money: "integer minor units; original and converted expense values are stored separately",
  status: "derived from departure/return dates on server",
  eSim: "trip linking is optional and does not modify provisioning or checkout",
} as const;
