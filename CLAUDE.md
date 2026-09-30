# CLAUDE.md - read this first, in every session

## About us
- We are a team of 4-5 people from Mahanadi Coalfields Limited (MCL) at an
  IIM Sambalpur MDP. We are NOT programmers.
- Explain everything in plain English, in short sentences. If you must use a
  technical word, explain it in one line.
- We build ONE small web tool in phases. Only one Claude session works at a
  time. The Progress Log at the end of this file is our handover logbook.

## What we are building
- A tool with at most 3 pages: index.html (entry page), dashboard.html
  (dashboard) and at most one more page.
- Every record has location, urgency (Low / Medium / High) and status
  (Open / In progress / Resolved), plus the columns in "Our tool" below.
- All data is MADE UP. Never add real names, phone numbers, employee IDs or
  real MCL figures.

## Technical rules
1. Plain HTML, CSS and JavaScript only. Pages stay in the top folder; SQL
   files go in the database folder. No frameworks, no npm, no package.json,
   no build step.
2. Vercel publishes the site from the main branch. Use relative links only,
   e.g. href="dashboard.html".
3. Load Supabase from the jsDelivr CDN, then our settings, in this order:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="config.js"></script>
   Then create the client like this (do not call the variable "supabase"):
     const db = window.supabase.createClient(window.SUPABASE_URL,
                                              window.SUPABASE_PUBLISHABLE_KEY);
4. The Project URL and the publishable key live only in config.js. Never use
   or ask for a secret key, a service_role key or the database password.
5. For charts, load Chart.js from the jsDelivr CDN.
6. No login or sign-up. Anyone with the link can use the tool.
7. You may not be able to reach our database. Do NOT try to test the database
   connection. Write the code; we test it on the live website.
8. If anything fails, show a friendly message on the page that also includes
   the actual error text, so we can pass it on.
9. Every page must work well on a mobile phone: large buttons, readable text,
   no sideways scrolling. Use the same header and menu on every page.
10. Never delete config.js or CLAUDE.md.

## Database rules
- Our Data Keeper runs all SQL by pasting it into the Supabase SQL Editor.
  You cannot run SQL yourself.
- Give SQL as ONE block that runs in one go. Also save it in the database
  folder: 01-setup.sql, then 02-..., 03-... for later changes.
- One table. It must have: id uuid primary key default gen_random_uuid()
  and created_at timestamptz not null default now().
- Enable Row Level Security. Add policies that let the roles anon and
  authenticated SELECT, INSERT and UPDATE. No delete.
- Always include: grant select, insert, update on the table to anon,
  authenticated; (new Supabase projects need it, or the website gets
  "permission denied").
- Never drop a table or delete rows.
- Avoid changing the table after Phase 1. If a change is really needed, give
  one small block and explain it in one sentence.

## How to work with us
- Make one change at a time. Do not change parts that already work unless we
  ask.
- After each change, reply in 3 short bullets: what you changed and what we
  should test on the live website.
- Commit and push your work at every stopping point.

## Takeover and handover
- At the START of every session: read the Progress Log below and summarize it
  in 3 bullets (what exists, what works, what is next).
- At a "save point": add a new entry at the end of the Progress Log (phase,
  builder, what was built, what works, known problems, next step). Then
  commit and push.

## Our tool (filled in during Phase 1)
- Team: MCL team, IIM Sambalpur MDP
- Tool name: Diesel Exception & Fuel Consumption Monitoring Dashboard
- Problem: Diesel used above norm by dumpers, shovels and other HEMM is noticed too late (excess fuel, possible misuse, machine faults, poor operator practice).
- Who records / who decides: Fuel issue / shift staff record; Fuel Manager and E&M Manager decide; Project Officer reviews.
- Table name and columns: fuel_readings (database/02, 03, 04 files): id, created_at, reading_date, mine, vehicle_type, vehicle_no, shift, expected_litres (= the vehicle's FIXED litres per shift), km (= FIXED distance per shift), exception_type ('' = normal, or High Consumption / Low Consumption / Refueling Irregularity / Mileage Mismatch / Other), status, entered_by, updated_by, updated_at. OLD columns siding, actual_litres, exception_flag still exist but are optional and unused. The older table diesel_exceptions (01-setup.sql) is NOT used any more.
- Pages: index.html = home; dashboard.html = dashboard (code in overview.js; fixed litres/km per vehicle in fixed-values.js; built-in sample data in overview-data.js; user.js = who-are-you picker; styles in style.css + overview.css).

## Progress Log (newest entry at the bottom)
- Phase 0 (starter): placeholder index.html, config.js without settings and
  this CLAUDE.md. Next: Phase 1 - the table and the entry page.
- Phase 2 (Claude): built index.html, dashboard.html, dashboard.js, style.css, sample-data.js.
  Works: filters, 5 KPI cards, charts (Chart.js), repeat machines, inspection priority
  with a written points rule, operator retraining, fuel point analysis, fuel control
  actions, management action box, action panel (demo only, saved in the browser),
  drill-down, sortable/searchable detail table, CSV download. Tested in a local browser
  only, with sample data. The database is NOT connected; no SQL written yet.
  Known: charts need the jsDelivr CDN (a friendly error shows if blocked). The plain
  HTML/JS rule was followed, so no React/Tailwind. Next: test on the live site, then
  decide whether to store records in Supabase (would need database/01-setup.sql).
- Phase 3 (Claude): wrote database/01-setup.sql (table, security rules, grant, 62 made-up
  sample rows added only if the table is empty) and the Add Record page (entry.html,
  entry.js) with live "litres above norm" preview and a "recently saved" list. Menu on
  all pages now has Add Record. Tested only with a stand-in database, NOT the real one.
  Known: the dashboard still reads sample-data.js, not the database. Next: Data Keeper
  runs 01-setup.sql; test saving on the live site; then Phase 4 = dashboard reads the
  database.
- Rollback (Claude, on the team's request): the last 4 commits (forecast, dashboard reads database,
  cost/safety checks, schema-cache line) were undone with git revert. The site is back to the Phase 3
  state: dashboard.html uses sample-data.js; Add Record page and database/01-setup.sql are kept.
  The undone work is still in git history (commits 8d79ffc, 77cbf2c, e570dae, 9b674a3) and can be
  brought back by reverting this rollback commit.
- Removed Add Record (Claude, on request): deleted entry.html and entry.js and the menu/home links to them. Dashboard unchanged. database/01-setup.sql kept. Next: decide whether to bring back data entry.
- Restyle (Claude, on request): theme changed to blue / white / black (black header, blue accents and
  buttons, blue charts); status labels keep green / amber / red on purpose. Font changed to Inter
  (from jsDelivr, falls back to the system font). Header now has two logo slots. NEW folder images/:
  put mcl-logo.png (Mahanadi Coalfields) and coal-india-logo.png (Coal India) there; until then the
  header shows the company names as text. Official logo files must be supplied by the team.
- Logo (Claude, on request): the team's combined Coal India + MCL picture is saved as images/logo.jpg and shown in the header of index.html and dashboard.html (text fallback if missing). Replaces the two separate logo slots.
- Overview page (Claude, on request): NEW third page overview.html (files overview.css, overview.js,
  overview-data.js) built from the team's picture: filters sidebar, 4 KPI cards, trend, exceptions by
  type / mine, efficiency and consumption by vehicle type, top 5 locations, exception details, key
  insights and recommended actions. No fuel-point / fuel-station part. Customize panel (alert
  thresholds, fuel price, live feed on/off and interval, sound, pop-ups, chart grouping, hide/show
  sections, saved filter views) and an Alerts panel. Everything is saved in the browser only.
  Data is separate made-up sample data (mines A-E, sidings, vehicles, km) - NOT the database.
  "Live" alerts are SIMULATED in the page (new made-up readings on a timer); real live alerts need
  the database (later phase). The older dashboard.html is unchanged (it still has fuel-point analysis).
  Tested in a local browser only. Next: decide whether Overview replaces Dashboard, and whether
  to connect it to Supabase for real alerts (needs new columns: mine, siding, vehicle type, km).
- Old dashboard removed (Claude, on request): deleted the old dashboard.html and dashboard.js (forecast/fuel-point version is still in git history, last at commit e51f4a4^). The Overview page was renamed to dashboard.html, so links to dashboard.html now open it; overview.html no longer exists. Home page questions rewritten. sample-data.js is unused by pages (only the source of the SQL sample rows).
- Phase 6 (Claude): dashboard.html is connected to the database for real alerts. NEW database/02-fuel-readings.sql
  (table fuel_readings, security rules, grant, live-update switch, ~3,200 made-up sample rows created by the
  database itself, only if the table is empty; safe to run twice). Tested on a throwaway local Postgres only, NOT on
  our Supabase. The dashboard reads all rows, listens for new rows (Supabase Realtime) and also checks every 10 s to
  5 min as a back-up; a new reading that breaks the alert rules (Customize) raises a pop-up, the Alerts count and the
  Alerts list on EVERY open dashboard. New "Add reading" button (form in a side panel) saves a reading; status
  changes made in the record window are saved to the database. If the database cannot be read (e.g. SQL not run yet)
  the page falls back to DEMO MODE (built-in sample data, simulated feed) with an amber banner showing the real
  error text. Alert rules, price, layout choices and saved views are still per browser (localStorage).
  Known: needs 02-fuel-readings.sql run by the Data Keeper; anyone with the link can add/update readings (no
  login, by design); alerts are not sent to phones when the page is closed (that needs a server, later).
  Next: Data Keeper runs 02 file; test with two devices; decide about SMS/e-mail alerts.
- Phase 7 (Claude): user roles and names, NO password. New user.js (shared by index.html and dashboard.html): a
  "Who are you?" picker (name/ID + role) opens on the first visit; the name chip in the header switches it. Roles:
  Fuel Manager (add, change status, test reading, alert rules), E&M Manager (add, change status, alert rules),
  Shift Supervisor (add), Viewer (view + acknowledge). Buttons the role cannot use are switched off with a short
  explanation. The role only guides the screen; it is NOT security (anyone with the link can pick any role; database
  rules are still open, by our no-login rule). Names are saved in the database when database/03-audit-columns.sql has
  been run (3 optional columns on fuel_readings: entered_by, updated_by, updated_at); if not run, everything still
  works and a small yellow note says names are not being saved. Alerts show "Entered by ..." and "acknowledged by ...";
  the record window shows who last changed the status. Tested with a stand-in database and a local throwaway
  Postgres (03 file), not on our Supabase. Next: Data Keeper runs 03 file; decide if roles should also filter alerts.
- Phase 8 (Claude, on request): (1) Title everywhere is now "Fuel Consumption Monitoring". (2) Siding removed completely
  (filter, form, charts, table, database no longer needs it). "Top 5 Exception Locations" became "Top 5 Exception
  Vehicles". (3) Actual litres removed completely from the screens and the logic. Every vehicle has FIXED litres and
  distance per shift (new file fixed-values.js: to add or change a vehicle, edit that file). A reading records only
  date, shift, vehicle and EXCEPTION TYPE (chosen from a list); the Add Reading form shows the vehicle's fixed values
  read-only. Consumption, cost and km/l now come from the fixed values. The old "% above / below norm" alert rules
  were replaced in Customize by "raise an alert for these exception types" and "show these as Critical". Details
  table columns now: Date, Mine, Vehicle, Equipment, Shift, Fuel (L), Exception Type, Status. NEW
  database/04-fixed-readings.sql (adds exception_type, fills it once from the old numbers for existing rows, makes
  siding and actual_litres optional; drops and deletes nothing; safe to run twice; checked on a throwaway local
  Postgres, NOT on our Supabase). Before 04 is run the dashboard still opens (it works out the type from the old
  numbers) but new readings cannot be saved and a yellow note says so. Pop-up alerts are hidden while a side panel is
  open (they covered the Close button). Built-in demo data (overview-data.js) still holds the old numbers only as
  the source for the one-time type; the screens ignore them.
  Next: Data Keeper runs 04 file; test adding readings; decide if vehicle fixed values should move into the database.

