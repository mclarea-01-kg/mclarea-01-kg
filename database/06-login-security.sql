-- 06-login-security.sql - REAL LOGIN: only signed-in people with a role can use the data.
-- Paste this WHOLE block into the Supabase SQL Editor and press Run. Safe to run twice.
-- RUN IT ONLY AFTER the users have been created and given roles (see database/07-set-user-roles.sql)
-- and after the new website is live. It never drops a table and never deletes rows.
--
-- What it does, in plain English:
--  1) Removes open access for "anon" (anyone with the link and no login).
--  2) Lets a signed-in person READ if their account has a role: Fuel Manager, E&M Manager, Shift Supervisor or Viewer.
--  3) Lets Fuel Manager, E&M Manager and Shift Supervisor ADD readings.
--  4) Lets only Fuel Manager and E&M Manager CHANGE a reading (status).
--  5) Nobody can delete.
-- The role is read from the account's app_metadata. People cannot edit that themselves.

-- 1) no more open access
revoke select, insert, update on public.fuel_readings from anon;
grant  select, insert, update on public.fuel_readings to authenticated;

-- 2) replace the old open policies with role-based ones (only policies are replaced, no data is touched)
drop policy if exists "fuel_select" on public.fuel_readings;
drop policy if exists "fuel_insert" on public.fuel_readings;
drop policy if exists "fuel_update" on public.fuel_readings;
drop policy if exists "fuel_login_select" on public.fuel_readings;
drop policy if exists "fuel_login_insert" on public.fuel_readings;
drop policy if exists "fuel_login_update" on public.fuel_readings;

create policy "fuel_login_select" on public.fuel_readings for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('Fuel Manager','E&M Manager','Shift Supervisor','Viewer'));

create policy "fuel_login_insert" on public.fuel_readings for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('Fuel Manager','E&M Manager','Shift Supervisor'));

create policy "fuel_login_update" on public.fuel_readings for update to authenticated
  using      ((auth.jwt() -> 'app_metadata' ->> 'role') in ('Fuel Manager','E&M Manager'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('Fuel Manager','E&M Manager'));

-- Ask Supabase to refresh its settings now.
notify pgrst, 'reload schema';
