-- The PDF copy of a trip document saved in the traveler's own Drive (next to the Google Doc).
alter table travel_google_plan_docs
  add column if not exists pdf_id text,
  add column if not exists pdf_url text,
  add column if not exists pdf_updated_at timestamptz;
