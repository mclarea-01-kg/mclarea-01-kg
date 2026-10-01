-- 11-hindrance.sql - NEW table for the Daily Hindrance Entry tool (index.html).
-- Paste this WHOLE block into the Supabase SQL Editor and press Run. Safe to run twice.
-- It creates one NEW table. It never drops a table and never deletes rows. The diesel table is not touched.
--
-- What it does, in plain English:
--  1) Creates table hindrance_entries: ONE row per hindrance (nothing is ever overwritten).
--  2) Locations allowed: Laikera, Kanika, Inpit, Sardega.
--  3) Start and end time are optional, but if one is given the other is needed.
--     If a hindrance runs past midnight, the page ticks "ends_next_day".
--  4) duration_minutes is worked out by the database for each single entry.
--     (The NET time, without counting overlaps twice, is worked out by the page and the Excel file.)
--  5) submit_key stops the same form being saved twice (double tap).
--  6) Same login rules as the diesel table: nobody without a role sees anything;
--     Fuel Manager, E&M Manager and Shift Supervisor add entries; Viewer only reads;
--     only Fuel Manager and E&M Manager may correct an entry; nobody can delete.
--  7) contractor is empty for now: it is kept for a later contractor-wise dashboard.

create table if not exists public.hindrance_entries (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),          -- entry time, captured automatically
  entry_date       date        not null,
  location         text        not null check (location in ('Laikera','Kanika','Inpit','Sardega')),
  category         text        not null default 'Other',
  detail           text        not null check (length(btrim(detail)) > 0),
  equipment_no     text,
  cause            text,
  start_time       time,
  end_time         time,
  ends_next_day    boolean     not null default false,
  duration_minutes integer generated always as (
    case when start_time is not null and end_time is not null
         then (extract(epoch from (end_time - start_time)) / 60)::integer + case when ends_next_day then 1440 else 0 end
    end) stored,
  contractor       text,
  entered_by       text,
  source           text        not null default 'typed' check (source in ('typed','voice')),
  submit_key       text unique,
  constraint hindrance_times_ok check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and (
         (not ends_next_day and end_time > start_time)
      or (ends_next_day and end_time <= start_time)))
  )
);

create index if not exists hindrance_date_loc_idx on public.hindrance_entries (entry_date, location);
create index if not exists hindrance_category_idx on public.hindrance_entries (category);
create index if not exists hindrance_equipment_idx on public.hindrance_entries (equipment_no);

alter table public.hindrance_entries enable row level security;

grant select, insert, update on public.hindrance_entries to authenticated;
revoke all on public.hindrance_entries from anon;

drop policy if exists "hind_login_select" on public.hindrance_entries;
drop policy if exists "hind_login_insert" on public.hindrance_entries;
drop policy if exists "hind_login_update" on public.hindrance_entries;

create policy "hind_login_select" on public.hindrance_entries for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('Fuel Manager','E&M Manager','Shift Supervisor','Viewer'));

create policy "hind_login_insert" on public.hindrance_entries for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('Fuel Manager','E&M Manager','Shift Supervisor'));

create policy "hind_login_update" on public.hindrance_entries for update to authenticated
  using      ((auth.jwt() -> 'app_metadata' ->> 'role') in ('Fuel Manager','E&M Manager'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('Fuel Manager','E&M Manager'));

-- Ask Supabase to refresh its settings now.
notify pgrst, 'reload schema';
