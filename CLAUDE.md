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
- Table name and columns: diesel_exceptions (database/01-setup.sql): id, created_at, record_date, equipment_type, equipment_no, operator_id, shift, norm_litres, actual_litres, fuel_point, inspection_status, action_required, remarks. Litres above norm = actual - norm (worked out, not stored).
- Pages: index.html = home; dashboard.html = dashboard (dashboard.js). Look for all pages in style.css. (The Add Record page was removed; database/01-setup.sql is kept for later.)

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
