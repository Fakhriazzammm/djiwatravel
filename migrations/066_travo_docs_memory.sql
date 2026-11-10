-- Travo's team guide (an "agent" document for persona and know-how, and "skill" documents per topic,
-- both edited in Admin) and what Travo remembers about a traveler (only what they agreed to).
create table if not exists travel_assistant_docs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('agent', 'skill')),
  slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  title text not null check (char_length(title) between 2 and 80),
  body text not null check (char_length(body) between 1 and 4000),
  enabled boolean not null default true,
  -- {"intents": [...], "scopes": [...], "keywords": [...]}: when a skill is added to the prompt.
  triggers jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_by text,
  updated_at timestamptz not null default now(),
  unique (kind, slug)
);

create table if not exists travel_assistant_memory (
  id uuid primary key default gen_random_uuid(),
  customer_auth_subject text not null,
  text text not null check (char_length(text) between 3 and 160),
  source text not null default 'chat' check (source in ('chat', 'wizard', 'manual')),
  created_at timestamptz not null default now()
);
create index if not exists travel_assistant_memory_owner_idx
  on travel_assistant_memory (customer_auth_subject, created_at);

grant select, insert, update, delete on travel_assistant_docs to djiwatravel_app;
grant select, insert, update, delete on travel_assistant_memory to djiwatravel_app;
