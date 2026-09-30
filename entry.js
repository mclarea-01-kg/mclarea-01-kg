/* entry.js - the "Add Record" form. Saves one row into the table diesel_exceptions. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(s) { var p = String(s).split("-"); return +p[2] + " " + MON[+p[1] - 1] + " " + p[0]; }

  function showError(where, e) {
    var msg = e && e.message ? e.message : String(e);
    var hint = "";
    if (/relation .* does not exist|schema cache|Could not find the table/i.test(msg)) hint = " The table may not exist yet. Ask the Data Keeper to run database/01-setup.sql in the Supabase SQL Editor.";
    else if (/permission denied|row-level security/i.test(msg)) hint = " The database is refusing access. Ask the Data Keeper to check that 01-setup.sql ran fully (policies and grant).";
    else if (/Failed to fetch|NetworkError|network/i.test(msg)) hint = " This looks like an internet problem. Please try again.";
    $("error-area").innerHTML = '<div class="error-box"><strong>Sorry, something went wrong while ' + esc(where) + ".</strong>" + esc(hint) +
      " Please send this message to the team:<code>" + esc(msg) + "</code></div>";
  }

  /* ---- database client (rule: variable is called db, never supabase) ---- */
  var db = null;
  var url = window.SUPABASE_URL || "", key = window.SUPABASE_PUBLISHABLE_KEY || "";
  if (!window.supabase) showError("loading the database library", "The Supabase library could not be loaded from cdn.jsdelivr.net. Check the internet connection.");
  else if (url.indexOf("PASTE") !== -1 || key.indexOf("PASTE") !== -1) showError("reading the database settings", "config.js still has the placeholder Project URL or key.");
  else db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);

  /* ---- live preview ---- */
  var userTouchedAction = false, userTouchedStatus = false;
  function updatePreview() {
    var n = parseFloat($("e-norm").value), a = parseFloat($("e-actual").value), p = $("preview");
    if (isNaN(n) || isNaN(a)) { p.className = "preview"; p.textContent = "Enter norm and actual litres to see the result."; return; }
    var x = a - n;
    if (x > 0) {
      p.className = "preview bad";
      p.textContent = "▲ Exception: " + Math.round(x * 10) / 10 + " litres above norm.";
      if (!userTouchedStatus && $("e-status").value === "Closed") $("e-status").value = "Pending";
      if (!userTouchedAction && $("e-action").value === "No Action") $("e-action").value = "Inspect Machine";
    } else {
      p.className = "preview good";
      p.textContent = "✔ Within norm. Litres above norm = 0.";
      if (!userTouchedStatus) $("e-status").value = "Closed";
      if (!userTouchedAction) $("e-action").value = "No Action";
    }
  }
  ["e-norm", "e-actual"].forEach(function (id) { $(id).addEventListener("input", updatePreview); });
  $("e-status").addEventListener("change", function () { userTouchedStatus = true; });
  $("e-action").addEventListener("change", function () { userTouchedAction = true; });

  /* ---- suggestions for equipment / operator (from saved records) ---- */
  function fillList(id, values) {
    var seen = {}, h = "";
    values.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; h += '<option value="' + esc(v) + '">'; } });
    $(id).innerHTML = h;
  }

  /* ---- recent records ---- */
  function loadRecent() {
    if (!db) { $("t-recent").innerHTML = '<div class="empty-msg">Not connected to the database.</div>'; return; }
    db.from("diesel_exceptions").select("*").order("created_at", { ascending: false }).limit(60).then(function (res) {
      if (res.error) { showError("reading saved records", res.error); $("t-recent").innerHTML = '<div class="empty-msg">Could not read records.</div>'; return; }
      var rows = res.data || [];
      fillList("eq-list", rows.map(function (r) { return r.equipment_no; }).sort());
      fillList("op-list", rows.map(function (r) { return r.operator_id; }).sort());
      if (!rows.length) { $("t-recent").innerHTML = '<div class="empty-msg">No records saved yet. Save the first one above.</div>'; return; }
      var cols = ["Date", "Equipment", "Shift", "Norm (L)", "Actual (L)", "Above norm (L)", "Operator", "Status"];
      var h = '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + cols.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>";
      rows.slice(0, 8).forEach(function (r) {
        var x = Math.max(0, r.actual_litres - r.norm_litres);
        var cells = [fmtDate(r.record_date), esc(r.equipment_no) + " (" + esc(r.equipment_type) + ")", esc(r.shift), r.norm_litres, r.actual_litres, x ? "<strong>" + Math.round(x * 10) / 10 + "</strong>" : "0", esc(r.operator_id), esc(r.inspection_status)];
        h += "<tr>" + cells.map(function (c, i) { return '<td data-label="' + cols[i] + '">' + c + "</td>"; }).join("") + "</tr>";
      });
      $("t-recent").innerHTML = h + "</tbody></table></div>";
    }, function (e) { showError("reading saved records", e); });
  }

  /* ---- save ---- */
  function formMsg(text, bad) { $("form-msg").innerHTML = text ? '<p class="msg' + (bad ? " bad" : "") + '">' + esc(text) + "</p>" : ""; }
  $("entry-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    $("error-area").innerHTML = ""; formMsg("");
    if (!db) { formMsg("Cannot save: the database is not connected. See the red message at the top.", true); return; }
    var v = {
      record_date: $("e-date").value, equipment_type: $("e-type").value, equipment_no: $("e-eq").value.trim(), operator_id: $("e-op").value.trim(),
      shift: $("e-shift").value, norm_litres: parseFloat($("e-norm").value), actual_litres: parseFloat($("e-actual").value), fuel_point: $("e-fp").value.trim(),
      inspection_status: $("e-status").value, action_required: $("e-action").value, remarks: $("e-remarks").value.trim() || null
    };
    var missing = [];
    if (!v.record_date) missing.push("Date"); if (!v.shift) missing.push("Shift"); if (!v.equipment_type) missing.push("Equipment type");
    if (!v.equipment_no) missing.push("Equipment number"); if (!v.operator_id) missing.push("Operator ID"); if (!v.fuel_point) missing.push("Fuel issue point");
    if (isNaN(v.norm_litres) || v.norm_litres < 0) missing.push("Norm diesel (0 or more)");
    if (isNaN(v.actual_litres) || v.actual_litres < 0) missing.push("Actual diesel (0 or more)");
    if (missing.length) { formMsg("Please fill in: " + missing.join(", ") + ".", true); return; }

    var btn = $("save-btn"); btn.disabled = true; btn.textContent = "Saving...";
    db.from("diesel_exceptions").insert(v).then(function (res) {
      btn.disabled = false; btn.textContent = "Save record";
      if (res.error) { showError("saving the record", res.error); formMsg("The record was NOT saved.", true); return; }
      var x = v.actual_litres - v.norm_litres;
      formMsg("Saved: " + v.equipment_no + ", " + v.shift + ", " + fmtDate(v.record_date) + (x > 0 ? " (" + Math.round(x * 10) / 10 + " L above norm)." : " (within norm)."));
      ["e-eq", "e-op", "e-norm", "e-actual", "e-remarks"].forEach(function (id) { $(id).value = ""; });
      userTouchedAction = userTouchedStatus = false; updatePreview(); loadRecent();
    }, function (e) { btn.disabled = false; btn.textContent = "Save record"; showError("saving the record", e); formMsg("The record was NOT saved.", true); });
  });

  var d = new Date(); $("e-date").value = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  loadRecent();
})();
