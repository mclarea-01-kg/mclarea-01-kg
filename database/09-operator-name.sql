-- 09-operator-name.sql - lets a reading store the OPERATOR NAME typed in the Add reading form.
-- Paste this small block into the Supabase SQL Editor and press Run. Safe to run twice. Deletes nothing.
-- (One sentence: it adds one empty, optional column to the existing table fuel_readings.
--  Older readings have no operator, so they are left out of the operator analysis.)
-- Please type MADE-UP names or IDs only (for example OP-101), never real names.

alter table public.fuel_readings add column if not exists operator_name text
  check (operator_name is null or char_length(operator_name) between 1 and 40);

-- Ask Supabase to refresh its list of columns now, so the website can see the new one.
notify pgrst, 'reload schema';
