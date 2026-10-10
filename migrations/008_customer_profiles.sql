-- Additive, idempotent customer onboarding profile storage.
-- auth_user_id is the Better Auth user id. Verified against the live auth DB
-- (auth.zantara.id): the better-auth "user"."id" column is `text` holding a
-- 32-character opaque token, NOT a uuid, so this column must be text too.
-- Guest checkout does not use this table.
create table if not exists customer_profiles (
  auth_user_id text primary key,
  email text not null,
  whatsapp text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_profiles_email_key unique (email),
  constraint customer_profiles_whatsapp_check check (whatsapp ~ '^62[0-9]{7,13}$')
);
