-- 08-working-hours.sql - lets a reading store the WORKING HOURS of the machine (typed in the Add reading form).
-- Ltrs/hr is then worked out as litres / the hours that were typed (no fixed 8-hour shift any more).
-- Paste this small block into the Supabase SQL Editor and press Run. Safe to run twice. Deletes nothing.
-- (One sentence: it adds one empty, optional column to the existing table fuel_readings.
--  Older readings have no hours, so they are left out of the Ltrs/hr figures.)

alter table public.fuel_readings add column if not exists working_hours numeric
  check (working_hours is null or (working_hours > 0 and working_hours <= 24));

-- Ask Supabase to refresh its list of columns now, so the website can see the new one.
notify pgrst, 'reload schema';
