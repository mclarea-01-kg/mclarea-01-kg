-- 01-setup.sql - Phase 3: the diesel exceptions table.
-- Paste this WHOLE block into the Supabase SQL Editor and press Run.
-- It is safe to run twice: it never drops a table and never deletes rows.
-- All rows are MADE-UP sample data (Illustrative / Sample Data).

create table if not exists public.diesel_exceptions (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  record_date       date not null,
  equipment_type    text not null check (equipment_type in ('Dumper', 'Shovel', 'Dozer', 'Loader', 'Other')),
  equipment_no      text not null,
  operator_id       text not null,
  shift             text not null check (shift in ('A Shift', 'B Shift', 'C Shift')),
  norm_litres       numeric not null check (norm_litres >= 0),
  actual_litres     numeric not null check (actual_litres >= 0),
  fuel_point        text not null,
  inspection_status text not null check (inspection_status in ('Pending', 'Under Inspection', 'Closed')),
  action_required   text not null check (action_required in ('Inspect Machine', 'Retrain Operator', 'Check Fuel Issue', 'Maintenance Check', 'No Action')),
  remarks           text
);
-- Litres above norm is NOT stored. The website works it out: actual - norm.

alter table public.diesel_exceptions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'diesel_exceptions' and policyname = 'diesel_select') then
    create policy "diesel_select" on public.diesel_exceptions for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'diesel_exceptions' and policyname = 'diesel_insert') then
    create policy "diesel_insert" on public.diesel_exceptions for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'diesel_exceptions' and policyname = 'diesel_update') then
    create policy "diesel_update" on public.diesel_exceptions for update to anon, authenticated using (true) with check (true);
  end if;
end $$;

grant select, insert, update on public.diesel_exceptions to anon, authenticated;

-- Sample rows: added only when the table is empty.
insert into public.diesel_exceptions
  (record_date, equipment_type, equipment_no, operator_id, shift, norm_litres, actual_litres, fuel_point, inspection_status, action_required, remarks)
select * from (values
    ('2026-09-01', 'Dumper', 'DT-03', 'OP-107', 'B Shift', 240, 224, 'Fuel Point-03', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-01', 'Dumper', 'DT-07', 'OP-115', 'A Shift', 260, 249, 'Fuel Point-02', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-01', 'Other', 'GR-01', 'OP-117', 'A Shift', 110, 93, 'Fuel Point-04', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-01', 'Loader', 'LD-02', 'OP-113', 'B Shift', 190, 164, 'Fuel Point-04', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-02', 'Dumper', 'DT-02', 'OP-102', 'A Shift', 240, 232, 'Fuel Point-03', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-03', 'Dumper', 'DT-01', 'OP-101', 'C Shift', 240, 231, 'Fuel Point-01', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-03', 'Dumper', 'DT-02', 'OP-101', 'C Shift', 240, 233, 'Fuel Point-03', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-03', 'Dumper', 'DT-04', 'OP-103', 'B Shift', 240, 218, 'Fuel Point-02', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-04', 'Shovel', 'SH-02', 'OP-104', 'A Shift', 420, 448, 'Fuel Point-01', 'Closed', 'No Action', 'Minor; long loading cycle'),
    ('2026-09-04', 'Shovel', 'SH-02', 'OP-104', 'B Shift', 420, 416, 'Fuel Point-01', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-05', 'Dumper', 'DT-07', 'OP-115', 'B Shift', 260, 235, 'Fuel Point-02', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-06', 'Dumper', 'DT-01', 'OP-101', 'B Shift', 240, 266, 'Fuel Point-01', 'Closed', 'No Action', 'Minor variation'),
    ('2026-09-07', 'Shovel', 'SH-01', 'OP-105', 'C Shift', 420, 455, 'Fuel Point-01', 'Closed', 'No Action', 'Waiting time with engine running'),
    ('2026-09-08', 'Dumper', 'DT-03', 'OP-107', 'C Shift', 240, 312, 'Fuel Point-03', 'Closed', 'Retrain Operator', 'Long idling at loading point'),
    ('2026-09-08', 'Shovel', 'SH-02', 'OP-108', 'B Shift', 420, 414, 'Fuel Point-01', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-09', 'Dumper', 'DT-05', 'OP-109', 'A Shift', 240, 270, 'Fuel Point-01', 'Closed', 'No Action', 'Minor variation'),
    ('2026-09-09', 'Shovel', 'SH-03', 'OP-106', 'A Shift', 420, 417, 'Fuel Point-03', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-11', 'Dozer', 'DZ-01', 'OP-118', 'A Shift', 260, 315, 'Fuel Point-04', 'Closed', 'Maintenance Check', 'Air filter cleaned'),
    ('2026-09-12', 'Loader', 'LD-02', 'OP-113', 'A Shift', 190, 220, 'Fuel Point-04', 'Closed', 'No Action', 'Minor variation'),
    ('2026-09-12', 'Shovel', 'SH-02', 'OP-104', 'B Shift', 420, 460, 'Fuel Point-01', 'Closed', 'Check Fuel Issue', 'Fuel issue records verified'),
    ('2026-09-13', 'Loader', 'LD-02', 'OP-113', 'C Shift', 190, 165, 'Fuel Point-04', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-14', 'Dumper', 'DT-07', 'OP-112', 'A Shift', 260, 294, 'Fuel Point-02', 'Closed', 'No Action', 'Within tolerance after review'),
    ('2026-09-15', 'Dumper', 'DT-02', 'OP-101', 'B Shift', 240, 325, 'Fuel Point-03', 'Pending', 'Check Fuel Issue', 'Fuel issued above usual quantity'),
    ('2026-09-15', 'Dumper', 'DT-07', 'OP-112', 'C Shift', 260, 244, 'Fuel Point-02', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-15', 'Loader', 'LD-02', 'OP-113', 'B Shift', 190, 163, 'Fuel Point-04', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-15', 'Shovel', 'SH-02', 'OP-108', 'A Shift', 420, 393, 'Fuel Point-01', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-16', 'Dozer', 'DZ-01', 'OP-118', 'B Shift', 260, 308, 'Fuel Point-04', 'Closed', 'No Action', 'Heavy ripping in hard strata'),
    ('2026-09-17', 'Dumper', 'DT-03', 'OP-107', 'A Shift', 240, 335, 'Fuel Point-03', 'Closed', 'Retrain Operator', 'Idling noted by shift supervisor'),
    ('2026-09-17', 'Dumper', 'DT-07', 'OP-115', 'A Shift', 260, 247, 'Fuel Point-02', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-17', 'Shovel', 'SH-02', 'OP-104', 'A Shift', 420, 412, 'Fuel Point-01', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-18', 'Dumper', 'DT-03', 'OP-107', 'C Shift', 240, 212, 'Fuel Point-03', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-18', 'Dumper', 'DT-07', 'OP-115', 'C Shift', 260, 244, 'Fuel Point-02', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-18', 'Dozer', 'DZ-01', 'OP-118', 'B Shift', 260, 330, 'Fuel Point-04', 'Closed', 'Maintenance Check', 'Checked for leaks; none found'),
    ('2026-09-18', 'Shovel', 'SH-03', 'OP-106', 'B Shift', 420, 442, 'Fuel Point-03', 'Closed', 'No Action', 'Minor variation'),
    ('2026-09-19', 'Loader', 'LD-01', 'OP-116', 'A Shift', 190, 228, 'Fuel Point-02', 'Closed', 'No Action', 'Extra rehandling of overburden'),
    ('2026-09-19', 'Shovel', 'SH-02', 'OP-108', 'A Shift', 420, 472, 'Fuel Point-01', 'Closed', 'Maintenance Check', 'Hydraulic filter replaced'),
    ('2026-09-20', 'Dumper', 'DT-05', 'OP-110', 'C Shift', 240, 285, 'Fuel Point-01', 'Closed', 'Check Fuel Issue', 'Fuel slip re-checked'),
    ('2026-09-21', 'Dumper', 'DT-06', 'OP-111', 'A Shift', 260, 257, 'Fuel Point-03', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-21', 'Dumper', 'DT-06', 'OP-111', 'B Shift', 260, 352, 'Fuel Point-03', 'Closed', 'Check Fuel Issue', 'Meter calibration difference found'),
    ('2026-09-21', 'Shovel', 'SH-01', 'OP-105', 'B Shift', 420, 417, 'Fuel Point-01', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-22', 'Dumper', 'DT-07', 'OP-112', 'B Shift', 260, 318, 'Fuel Point-02', 'Closed', 'Check Fuel Issue', 'Fuel issue slip checked; hour-meter matched'),
    ('2026-09-23', 'Shovel', 'SH-02', 'OP-104', 'B Shift', 420, 486, 'Fuel Point-01', 'Under Inspection', 'Inspect Machine', 'Engine load check under way'),
    ('2026-09-23', 'Other', 'WT-01', 'OP-117', 'C Shift', 95, 113, 'Fuel Point-04', 'Closed', 'No Action', 'Extra water trips'),
    ('2026-09-24', 'Dumper', 'DT-06', 'OP-111', 'C Shift', 260, 257, 'Fuel Point-03', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-24', 'Dumper', 'DT-07', 'OP-112', 'A Shift', 260, 239, 'Fuel Point-02', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-24', 'Dumper', 'DT-08', 'OP-114', 'C Shift', 260, 324, 'Fuel Point-02', 'Closed', 'Check Fuel Issue', 'Fuel issue slip verified'),
    ('2026-09-25', 'Dumper', 'DT-03', 'OP-107', 'B Shift', 240, 358, 'Fuel Point-03', 'Pending', 'Retrain Operator', 'Idling above 2 hours reported'),
    ('2026-09-25', 'Other', 'GR-01', 'OP-117', 'A Shift', 110, 134, 'Fuel Point-04', 'Pending', 'Check Fuel Issue', 'Awaiting supervisor sign-off'),
    ('2026-09-26', 'Other', 'GR-01', 'OP-117', 'B Shift', 110, 98, 'Fuel Point-04', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-26', 'Shovel', 'SH-01', 'OP-105', 'A Shift', 420, 460, 'Fuel Point-01', 'Under Inspection', 'Inspect Machine', 'Under review by E&M'),
    ('2026-09-27', 'Dumper', 'DT-07', 'OP-112', 'B Shift', 260, 356, 'Fuel Point-02', 'Under Inspection', 'Inspect Machine', 'Repeat excess; E&M inspection started'),
    ('2026-09-27', 'Dumper', 'DT-07', 'OP-115', 'C Shift', 260, 372, 'Fuel Point-02', 'Pending', 'Inspect Machine', 'High consumption continued on next shift'),
    ('2026-09-27', 'Shovel', 'SH-02', 'OP-104', 'A Shift', 420, 508, 'Fuel Point-01', 'Pending', 'Inspect Machine', 'Excess rising week on week'),
    ('2026-09-28', 'Dumper', 'DT-07', 'OP-112', 'A Shift', 260, 428, 'Fuel Point-02', 'Pending', 'Maintenance Check', 'Possible fuel-line leak; check injectors'),
    ('2026-09-28', 'Loader', 'LD-01', 'OP-116', 'B Shift', 190, 245, 'Fuel Point-02', 'Pending', 'Inspect Machine', 'Higher than last exception'),
    ('2026-09-29', 'Dumper', 'DT-02', 'OP-102', 'C Shift', 240, 280, 'Fuel Point-03', 'Under Inspection', 'Inspect Machine', 'Repeat exception on this machine'),
    ('2026-09-29', 'Dumper', 'DT-07', 'OP-115', 'B Shift', 260, 391, 'Fuel Point-02', 'Pending', 'Inspect Machine', 'Second operator also above norm'),
    ('2026-09-29', 'Dumper', 'DT-08', 'OP-114', 'B Shift', 260, 307, 'Fuel Point-02', 'Pending', 'Check Fuel Issue', 'Awaiting hour-meter check'),
    ('2026-09-29', 'Dumper', 'DT-08', 'OP-114', 'C Shift', 260, 243, 'Fuel Point-02', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-29', 'Dozer', 'DZ-01', 'OP-118', 'A Shift', 260, 324, 'Fuel Point-04', 'Pending', 'Maintenance Check', 'Repeat pattern; check engine'),
    ('2026-09-30', 'Dumper', 'DT-02', 'OP-101', 'B Shift', 240, 213, 'Fuel Point-03', 'Closed', 'No Action', 'Within norm'),
    ('2026-09-30', 'Dumper', 'DT-04', 'OP-103', 'A Shift', 240, 362, 'Fuel Point-02', 'Pending', 'Check Fuel Issue', 'Single very high fuel issue; verify hour-meter')
) as v(record_date, equipment_type, equipment_no, operator_id, shift, norm_litres, actual_litres, fuel_point, inspection_status, action_required, remarks)
where not exists (select 1 from public.diesel_exceptions);

-- Ask Supabase to refresh its list of tables now, so the website can see the new table.
notify pgrst, 'reload schema';
