-- 05-consumed-litres.sql - lets a reading store the DIESEL CONSUMED (litres) typed in the Add reading form.
-- Paste this small block into the Supabase SQL Editor and press Run. Safe to run twice. Deletes nothing.
-- (One sentence: it adds one empty, optional column to the existing table fuel_readings.
--  Readings without it keep using the vehicle's fixed litres.)

alter table public.fuel_readings add column if not exists consumed_litres numeric
  check (consumed_litres is null or consumed_litres >= 0);

-- Ask Supabase to refresh its list of columns now, so the website can see the new one.
notify pgrst, 'reload schema';
