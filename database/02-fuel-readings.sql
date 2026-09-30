-- 02-fuel-readings.sql - the table for the new dashboard (fuel readings and alerts).
-- Paste this WHOLE block into the Supabase SQL Editor and press Run.
-- Safe to run twice. It never drops a table and never deletes rows.
-- All rows are MADE-UP sample data (Illustrative / Sample Data).
-- NOTE: the older table "diesel_exceptions" (from 01-setup.sql) is no longer used by the
-- website. It is left untouched. This is now the only table the website uses.

create table if not exists public.fuel_readings (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  reading_date     date not null,
  mine             text not null,
  siding           text not null,
  vehicle_type     text not null check (vehicle_type in ('H.E. Dumpers','Tippers','Excavators','Dozers','Graders','Others')),
  vehicle_no       text not null,
  shift            text not null check (shift in ('A Shift','B Shift','C Shift')),
  expected_litres  numeric not null check (expected_litres > 0),
  actual_litres    numeric not null check (actual_litres >= 0),
  km               numeric not null default 0 check (km >= 0),
  exception_flag   text not null default '' check (exception_flag in ('','Refueling Irregularity','Mileage Mismatch','Other')),
  status           text not null default 'Open' check (status in ('Open','Under Review','In Progress','Closed'))
);
-- Litres above/below expected is NOT stored. The website works it out: actual - expected.

alter table public.fuel_readings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fuel_readings' and policyname='fuel_select') then
    create policy "fuel_select" on public.fuel_readings for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fuel_readings' and policyname='fuel_insert') then
    create policy "fuel_insert" on public.fuel_readings for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fuel_readings' and policyname='fuel_update') then
    create policy "fuel_update" on public.fuel_readings for update to anon, authenticated using (true) with check (true);
  end if;
end $$;

grant select, insert, update on public.fuel_readings to anon, authenticated;

-- Turn on live updates, so open dashboards get new readings (and alerts) at once.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fuel_readings') then
    alter publication supabase_realtime add table public.fuel_readings;
  end if;
exception when others then
  raise notice 'Live updates could not be switched on here (%). The dashboard will still check every 30 seconds.', sqlerrm;
end $$;

-- Made-up sample readings (Apr-Sep 2026). Added only when the table is empty.
with machines(no, vtype, mine, norm, eff, risk) as (values
  ('HD-01','H.E. Dumpers','Mine A',360,4.5,1), ('HD-02','H.E. Dumpers','Mine A',360,4.5,2), ('HD-03','H.E. Dumpers','Mine A',360,4.5,1),
  ('HD-04','H.E. Dumpers','Mine A',360,4.5,1), ('HD-05','H.E. Dumpers','Mine A',360,4.5,4), ('HD-06','H.E. Dumpers','Mine A',360,4.5,1),
  ('HD-07','H.E. Dumpers','Mine A',360,4.5,1), ('HD-08','H.E. Dumpers','Mine A',360,4.5,1),
  ('TP-01','Tippers','Mine B',210,4.2,1), ('TP-02','Tippers','Mine B',210,4.2,1), ('TP-03','Tippers','Mine B',210,4.2,2),
  ('TP-04','Tippers','Mine B',210,4.2,1), ('TP-05','Tippers','Mine B',210,4.2,1),
  ('EX-01','Excavators','Mine C',320,3.8,1), ('EX-02','Excavators','Mine C',320,3.8,3), ('EX-03','Excavators','Mine C',320,3.8,1), ('EX-04','Excavators','Mine C',320,3.8,1),
  ('DZ-01','Dozers','Mine D',450,3.2,3), ('DZ-02','Dozers','Mine D',450,3.2,1), ('DZ-03','Dozers','Mine D',450,3.2,1),
  ('GR-01','Graders','Mine E',175,3.0,1), ('GR-02','Graders','Mine E',175,3.0,1),
  ('OT-01','Others','Mine E',120,3.6,1), ('OT-02','Others','Mine E',120,3.6,1)
),
base as (
  select m.*, d::date as rd, random() as r_keep, random() as r_sid, random() as r_shift, random() as r_p,
         random() as r_kind, random() as r_a, random() as r_n, random() as r_st
  from machines m cross join generate_series(date '2026-04-01', date '2026-09-30', interval '1 day') d
),
calc as (
  select *, (r_p < 0.04 * risk * (case extract(month from rd)::int when 4 then 0.7 when 5 then 0.8 when 6 then 0.9 when 7 then 1.0 when 8 then 1.15 else 1.4 end)) as is_exc
  from base where r_keep < 0.72
),
calc2 as (
  select *,
    case when not is_exc then (r_a * 2 - 1) * 0.06
         when r_kind < 0.62 then 0.12 + r_a * 0.30
         when r_kind < 0.77 then -(0.12 + r_a * 0.14)
         when r_kind < 0.87 then 0.06 + r_a * 0.08
         when r_kind < 0.95 then 0.04 + r_a * 0.08
         else (case when r_n < 0.5 then -1 else 1 end) * (0.08 + r_a * 0.07) end as dev,
    case when not is_exc then '' when r_kind < 0.77 then '' when r_kind < 0.87 then 'Refueling Irregularity'
         when r_kind < 0.95 then 'Mileage Mismatch' else 'Other' end as flag,
    (date '2026-09-30' - rd) as age
  from calc
)
insert into public.fuel_readings (reading_date, mine, siding, vehicle_type, vehicle_no, shift, expected_litres, actual_litres, km, exception_flag, status)
select rd, mine, 'Siding ' || (1 + floor(r_sid * 3))::int, vtype, no,
       (array['A Shift','B Shift','C Shift'])[1 + floor(r_shift * 3)::int],
       norm, round(norm * (1 + dev)),
       round(norm * eff * (case when flag = 'Mileage Mismatch' then 0.72 else 1 end) * (0.98 + r_n * 0.04)),
       flag,
       case when not is_exc then 'Closed'
            when age > 45 then (case when r_st < 0.95 then 'Closed' else 'Under Review' end)
            when age >= 15 then (case when r_st < 0.70 then 'Closed' when r_st < 0.85 then 'Under Review' else 'In Progress' end)
            else (case when r_st < 0.45 then 'Open' when r_st < 0.70 then 'Under Review' when r_st < 0.90 then 'In Progress' else 'Closed' end) end
from calc2
where not exists (select 1 from public.fuel_readings);

-- Ask Supabase to refresh its list of tables now, so the website can see the new table.
notify pgrst, 'reload schema';
