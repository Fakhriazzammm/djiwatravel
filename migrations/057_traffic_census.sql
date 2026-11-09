-- Admin "Lalu lintas": people vs AI vs crawlers, and which visits led to a paid order.
set lock_timeout = '5s';

-- Server-side log of automated requests (crawlers do not run the browser script, so site_events
-- never sees them). No IP address, user agent string or account data is stored: only the
-- recognized bot name, its class and the public path.
create table if not exists public.traffic_bot_hits (
  id bigserial primary key,
  kind text not null check (kind in ('ai_answer', 'ai_crawl', 'ai_train', 'search_engine', 'unknown_bot')),
  bot text not null,
  path text not null,
  created_at timestamptz not null default now()
);
create index if not exists traffic_bot_hits_created_idx on public.traffic_bot_hits (created_at desc, kind);
alter table public.traffic_bot_hits enable row level security;

-- A new anonymous event links a browser session to the order it created (target = order id),
-- so paid orders can be attributed to the visit's source.
alter table public.site_events drop constraint if exists site_events_event_name_check;
alter table public.site_events add constraint site_events_event_name_check
  check (event_name in ('page_view', 'click', 'finder_submit', 'checkout_start', 'destination_view', 'order_start'));
create index if not exists site_events_order_start_idx
  on public.site_events (target) where event_name = 'order_start';
