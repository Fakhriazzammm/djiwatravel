-- Additive optional traveler profile details. Existing onboarding remains
-- complete with the required email and WhatsApp fields only.
alter table if exists customer_profiles
  add column if not exists display_name text,
  add column if not exists nationality text,
  add column if not exists date_of_birth date,
  add column if not exists gender text;

alter table if exists customer_profiles
  drop constraint if exists customer_profiles_gender_check;

alter table if exists customer_profiles
  add constraint customer_profiles_gender_check
  check (gender is null or gender in ('female', 'male', 'unspecified'));
