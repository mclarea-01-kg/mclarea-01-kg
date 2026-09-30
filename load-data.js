/* load-data.js - reads all rows of the table diesel_exceptions from Supabase,
   turns them into the record shape the dashboard already uses (window.DIESEL_DATA),
   and only then starts dashboard.js and forecast.js. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function fail(where, e) {
    var msg = e && e.message ? e.message : String(e), hint = "";
    if (/relation .* does not exist|schema cache|Could not find the table/i.test(msg)) hint = " The table may not exist yet. Ask the Data Keeper to run database/01-setup.sql in the Supabase SQL Editor.";
    else if (/permission denied|row-level security/i.test(msg)) hint = " The database is refusing access. Ask the Data Keeper to check that 01-setup.sql ran fully (policies and grant).";
    else if (/Failed to fetch|NetworkError|network/i.test(msg)) hint = " This looks like an internet problem. Please try again.";
    var l = $("loading"); if (l) l.remove();
    $("error-area").innerHTML = '<div class="error-box"><strong>Sorry, something went wrong while ' + esc(where) + ".</strong>" + esc(hint) +
      " Please send this message to the team:<code>" + esc(msg) + "</code></div>";
  }

  function loadScript(src, next) {
    var s = document.createElement("script");
    s.src = src; s.onload = next;
    s.onerror = function () { fail("loading " + src, "The file " + src + " could not be loaded."); };
    document.body.appendChild(s);
  }
  function startApp() {
    var l = $("loading"); if (l) l.remove();
    loadScript("dashboard.js", function () { loadScript("forecast.js", function () {}); });
  }

  if (!window.supabase) { fail("loading the database library", "The Supabase library could not be loaded from cdn.jsdelivr.net. Check the internet connection."); return; }
  var url = window.SUPABASE_URL || "", key = window.SUPABASE_PUBLISHABLE_KEY || "";
  if (url.indexOf("PASTE") !== -1 || key.indexOf("PASTE") !== -1) { fail("reading the database settings", "config.js still has the placeholder Project URL or key."); return; }
  var db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);

  var PAGE = 1000, rows = [];
  function fetchPage(from) {
    return db.from("diesel_exceptions").select("*").order("record_date", { ascending: true }).order("created_at", { ascending: true }).range(from, from + PAGE - 1)
      .then(function (res) {
        if (res.error) throw res.error;
        rows = rows.concat(res.data || []);
        if ((res.data || []).length === PAGE) return fetchPage(from + PAGE);
      });
  }
  fetchPage(0).then(function () {
    window.DIESEL_DATA = rows.map(function (r) {
      return {
        date: String(r.record_date).slice(0, 10), type: r.equipment_type, eq: r.equipment_no, operator: r.operator_id, shift: r.shift,
        norm: Number(r.norm_litres), actual: Number(r.actual_litres), fuelPoint: r.fuel_point, status: r.inspection_status,
        action: r.action_required, remarks: r.remarks || "", createdAt: r.created_at || ""
      };
    });
    window.DIESEL_SOURCE_NOTE = "Loaded " + rows.length + " records from the database.";
    startApp();
  }).catch(function (e) { fail("reading records from the database", e); });
})();
