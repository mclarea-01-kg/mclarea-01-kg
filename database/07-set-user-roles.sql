-- 07-set-user-roles.sql - gives each login account its ROLE and NAME. Run in the Supabase SQL Editor.
-- STEP 1 (in the Supabase website, not SQL): Authentication > Users > "Add user" > "Create new user".
--         Type the e-mail and a password, and tick "Auto Confirm User". Do this for every person.
-- STEP 2: change the e-mails below to the real ones, then Run this block (safe to run again any time).
-- Use MADE-UP names or IDs only. Allowed roles: Fuel Manager, E&M Manager, Shift Supervisor, Viewer.
-- After a role changes, the person must sign out and sign in again.

update auth.users set
  raw_app_meta_data  = coalesce(raw_app_meta_data,  '{}'::jsonb) || jsonb_build_object('role', 'Fuel Manager'),
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('name', 'FM-Demo-01')
where email = 'fuel.manager@example.com';

update auth.users set
  raw_app_meta_data  = coalesce(raw_app_meta_data,  '{}'::jsonb) || jsonb_build_object('role', 'E&M Manager'),
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('name', 'EM-Demo-01')
where email = 'em.manager@example.com';

update auth.users set
  raw_app_meta_data  = coalesce(raw_app_meta_data,  '{}'::jsonb) || jsonb_build_object('role', 'Shift Supervisor'),
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('name', 'SS-Demo-01')
where email = 'shift.supervisor@example.com';

update auth.users set
  raw_app_meta_data  = coalesce(raw_app_meta_data,  '{}'::jsonb) || jsonb_build_object('role', 'Viewer'),
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('name', 'VW-Demo-01')
where email = 'viewer@example.com';

-- Check the result (shows e-mail, role and name for every account):
select email, raw_app_meta_data ->> 'role' as role, raw_user_meta_data ->> 'name' as name from auth.users order by email;
