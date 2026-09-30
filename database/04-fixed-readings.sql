-- 04-fixed-readings.sql - readings now record only date, shift, vehicle and EXCEPTION TYPE.
-- Litres and distance are FIXED per vehicle (the website keeps that list). Siding and actual litres are no longer used.
-- Paste this small block into the Supabase SQL Editor and press Run. Safe to run twice.
-- It drops nothing and deletes nothing: old columns stay, they are just no longer required.

-- 1) The new column: what kind of exception this reading is ('' = normal reading).
alter table public.fuel_readings add column if not exists exception_type text not null default ''
  check (exception_type in ('','High Consumption','Low Consumption','Refueling Irregularity','Mileage Mismatch','Other'));

-- 2) One-time fill for the rows that already exist (uses the old numbers once, then they are ignored).
update public.fuel_readings
   set exception_type = case
         when exception_flag <> '' then exception_flag
         when actual_litres is not null and actual_litres > expected_litres * 1.10 then 'High Consumption'
         when actual_litres is not null and actual_litres < expected_litres * 0.90 then 'Low Consumption'
         else '' end
 where exception_type = '';

-- 3) Siding and actual litres are no longer typed in, so they may be empty.
alter table public.fuel_readings alter column siding drop not null;
alter table public.fuel_readings alter column actual_litres drop not null;

-- Ask Supabase to refresh its list of columns now, so the website can see the new one.
notify pgrst, 'reload schema';
