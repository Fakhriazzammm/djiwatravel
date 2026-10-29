-- An itinerary may continue past midnight (for example 22:00 to 02:00).
do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
    from pg_constraint
   where conrelid = 'public.travel_itinerary_items'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%end_time%start_time%';

  if constraint_name is not null then
    execute format('alter table public.travel_itinerary_items drop constraint %I', constraint_name);
  end if;
end $$;
