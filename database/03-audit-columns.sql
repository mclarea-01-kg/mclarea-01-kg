-- 03-audit-columns.sql - lets the dashboard remember WHO entered a reading and WHO last changed its status.
-- Paste this small block into the Supabase SQL Editor and press Run. Safe to run twice. Deletes nothing.
-- (One sentence: it adds three empty, optional columns to the existing table fuel_readings.)

alter table public.fuel_readings add column if not exists entered_by text;
alter table public.fuel_readings add column if not exists updated_by text;
alter table public.fuel_readings add column if not exists updated_at timestamptz;

-- Ask Supabase to refresh its list of columns now, so the website can see them.
notify pgrst, 'reload schema';
