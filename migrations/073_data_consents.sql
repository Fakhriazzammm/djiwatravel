-- Persetujuan data akun (popup setelah masuk dan Profil > Privasi). Additive and append-only:
-- every change is a new row, so the history (who agreed to what, which wording, when) is kept.
-- Purposes: community (Feeds), ai (Travo and other AI helpers), personalization, promo.
-- Analytics stays a device choice (cookie banner) and is not stored here.

create table if not exists customer_data_consents (
  id uuid primary key default gen_random_uuid(),
  customer_auth_subject text not null,
  purpose text not null check (purpose in ('community','ai','personalization','promo')),
  granted boolean not null,
  policy_version text not null,
  source text not null check (source in ('prompt','settings','just_in_time')),
  created_at timestamptz not null default now()
);
create index if not exists customer_data_consents_latest_idx
  on customer_data_consents (customer_auth_subject, purpose, created_at desc);
create index if not exists customer_data_consents_recent_idx on customer_data_consents (created_at desc);

-- Whether the member has answered the one-time prompt, or asked to be asked again later.
create table if not exists customer_consent_prompts (
  customer_auth_subject text primary key,
  answered_at timestamptz,
  snoozed_until timestamptz,
  updated_at timestamptz not null default now()
);
