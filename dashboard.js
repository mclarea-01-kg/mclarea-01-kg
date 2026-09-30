/* dashboard.js - Diesel Exception Dashboard.
   Every number on the page is worked out from window.DIESEL_DATA (loaded from the database by load-data.js).
   Nothing is hard-coded. Plain JavaScript, no framework. */
(function () {
  "use strict";

  /* ================= small helpers ================= */
  var $ = function (id) { return document.getElementById(id); };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var TYPES = ["Dumper", "Shovel", "Dozer", "Loader", "Other"];
  var SHIFTS = ["A Shift", "B Shift", "C Shift"];
  var STATUSES = ["Pending", "Under Inspection", "Closed"];
  var LEVELS = ["Critical", "High", "Medium", "Low"];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function dayNum(s) { var p = s.split("-"); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function numToDate(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
  function fmtDate(s) { var d = new Date(dayNum(s) * 86400000); return d.getUTCDate() + " " + MON[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function fmtShort(s) { var d = new Date(dayNum(s) * 86400000); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; }
  function sum(a, f) { var t = 0; a.forEach(function (x) { t += f ? f(x) : x; }); return t; }
  function num(n) { return Math.round(n).toLocaleString("en-IN"); }
  function uniq(a) { var o = {}; a.forEach(function (x) { o[x] = 1; }); return Object.keys(o); }
  function joinList(a) {
    if (a.length <= 1) return a.join("");
    return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  }
  function pct(n) { return Math.round(n * 100) + "%"; }

  function showError(where, e) {
    var box = $("error-area");
    if (!box) return;
    box.innerHTML = '<div class="error-box"><strong>Sorry, something went wrong while ' + esc(where) +
      '.</strong> Please send this message to the team:<code>' + esc(e && e.message ? e.message : e) + "</code></div>";
  }

  /* ================= data preparation ================= */
  var RAW = window.DIESEL_DATA || [];
  var SHIFT_ORDER = { "A Shift": 0, "B Shift": 1, "C Shift": 2 };
  var records = RAW.map(function (r, i) {
    var d = dayNum(r.date);
    var ex = Math.max(0, r.actual - r.norm);            // only positive differences count
    return {
      id: i + 1, date: r.date, day: d, type: r.type, eq: r.eq, operator: r.operator, shift: r.shift,
      shiftSeq: d * 3 + (SHIFT_ORDER[r.shift] || 0), norm: r.norm, actual: r.actual, fuel: r.fuelPoint,
      status: r.status, action: r.action, remarks: r.remarks, excess: ex, isExc: ex > 0
    };
  });
  var DATA_MIN = records.length ? Math.min.apply(null, records.map(function (r) { return r.day; })) : 0;
  var DATA_MAX = records.length ? Math.max.apply(null, records.map(function (r) { return r.day; })) : 0;
  function isOpen(r) { return r.status === "Pending" || r.status === "Under Inspection"; }

  /* ================= state ================= */
  var F = { preset: "30", from: "", to: "", type: "", eq: "", op: "", shift: "", fp: "", status: "", priority: "" };
  var UI = { showLow: false, search: "", includeNormal: false };
  var store = { inspect: {}, flag: {}, locked: {}, log: [] };
  try { var saved = JSON.parse(localStorage.getItem("mclDieselActions") || "null"); if (saved) store = saved; } catch (e) { /* private mode: fine */ }
  function saveStore() { try { localStorage.setItem("mclDieselActions", JSON.stringify(store)); } catch (e) { /* ignore */ } }

  var charts = {};
  var view = {};   // results of the latest calculation

  /* ================= filters ================= */
  function setPreset() {
    var to = DATA_MAX, from;
    if (F.preset === "7") from = to - 6;
    else if (F.preset === "30") from = to - 29;
    else if (F.preset === "month") { var d = new Date(to * 86400000); from = Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 86400000); }
    else return;
    F.from = numToDate(from); F.to = numToDate(to);
    $("f-from").value = F.from; $("f-to").value = F.to;
  }
  function matchOther(r) {
    return (!F.type || r.type === F.type) && (!F.eq || r.eq === F.eq) && (!F.op || r.operator === F.op) &&
      (!F.shift || r.shift === F.shift) && (!F.fp || r.fuel === F.fp) && (!F.status || r.status === F.status);
  }
  function inRange(r) { return r.day >= dayNum(F.from) && r.day <= dayNum(F.to); }

  function fillSelect(id, allLabel, values, current) {
    var el = $(id), h = '<option value="">' + esc(allLabel) + "</option>";
    values.forEach(function (v) { h += '<option value="' + esc(v) + '"' + (v === current ? " selected" : "") + ">" + esc(v) + "</option>"; });
    el.innerHTML = h;
  }
  function eqOptions() {
    var list = records.filter(function (r) { return !F.type || r.type === F.type; }).map(function (r) { return r.eq; });
    return uniq(list).sort();
  }
  function initFilters() {
    fillSelect("f-type", "All types", TYPES.filter(function (t) { return records.some(function (r) { return r.type === t; }); }), "");
    fillSelect("f-eq", "All equipment", eqOptions(), "");
    fillSelect("f-op", "All operators", uniq(records.map(function (r) { return r.operator; })).sort(), "");
    fillSelect("f-shift", "All shifts", SHIFTS, "");
    fillSelect("f-fp", "All fuel points", uniq(records.map(function (r) { return r.fuel; })).sort(), "");
    fillSelect("f-status", "All statuses", STATUSES, "");
    fillSelect("f-priority", "All priorities", LEVELS, "");
    $("f-from").min = $("f-to").min = numToDate(DATA_MIN);
    $("f-from").max = $("f-to").max = numToDate(DATA_MAX);
    setPreset();
    $("asof").textContent = "Data as on " + fmtDate(numToDate(DATA_MAX)) + ". " + (window.DIESEL_SOURCE_NOTE || "");
  }
  function readFilters() {
    F.preset = $("f-preset").value;
    if (F.preset !== "custom") setPreset();
    else {
      F.from = $("f-from").value || numToDate(DATA_MIN);
      F.to = $("f-to").value || numToDate(DATA_MAX);
      if (F.from > F.to) { var t = F.from; F.from = F.to; F.to = t; $("f-from").value = F.from; $("f-to").value = F.to; }
    }
    F.type = $("f-type").value;
    var wantedEq = $("f-eq").value;
    fillSelect("f-eq", "All equipment", eqOptions(), wantedEq);   // list depends on the chosen type
    F.eq = $("f-eq").value;
    F.op = $("f-op").value; F.shift = $("f-shift").value; F.fp = $("f-fp").value;
    F.status = $("f-status").value; F.priority = $("f-priority").value;
  }

  /* ================= calculations ================= */
  function priorityLevel(score) { return score >= 6 ? "Critical" : score >= 4 ? "High" : score >= 2 ? "Medium" : "Low"; }

  function machineStats(exc, ageRef) {
    var by = {};
    exc.forEach(function (r) { (by[r.eq] = by[r.eq] || []).push(r); });
    return Object.keys(by).map(function (eq) {
      var list = by[eq].slice().sort(function (a, b) { return a.shiftSeq - b.shiftSeq; });
      var total = sum(list, function (r) { return r.excess; });
      var count = list.length, last = list[count - 1];
      var maxSingle = Math.max.apply(null, list.map(function (r) { return r.excess; }));
      var open = list.filter(isOpen);
      var oldestOpenAge = open.length ? ageRef - Math.min.apply(null, open.map(function (r) { return r.day; })) : 0;
      var prev = list.slice(0, -1);
      var sudden = prev.length > 0 && last.excess >= 1.3 * (sum(prev, function (r) { return r.excess; }) / prev.length);
      var consecutive = false;
      for (var i = 1; i < list.length; i++) if (list[i].shiftSeq - list[i - 1].shiftSeq === 1) consecutive = true;
      var pts = {
        litres: (total >= 300 || maxSingle >= 150) ? 2 : (total >= 150 ? 1 : 0),
        repeat: count >= 3 ? 2 : (count === 2 ? 1 : 0),
        sudden: sudden ? 1 : 0,
        consecutive: consecutive ? 1 : 0,
        open: oldestOpenAge >= 3 ? 1 : 0
      };
      var score = pts.litres + pts.repeat + pts.sudden + pts.consecutive + pts.open;
      var ops = uniq(list.map(function (r) { return r.operator; }));
      var fps = {};
      list.forEach(function (r) { fps[r.fuel] = (fps[r.fuel] || 0) + 1; });
      var topFp = Object.keys(fps).sort(function (a, b) { return fps[b] - fps[a]; })[0];
      return {
        eq: eq, type: list[0].type, list: list, total: total, count: count, last: last, lastDate: last.date,
        maxSingle: maxSingle, open: open.length, oldestOpenAge: oldestOpenAge, days: uniq(list.map(function (r) { return r.day; })).length,
        pts: pts, score: score, level: priorityLevel(score), ops: ops, topFp: topFp, topFpShare: fps[topFp] / count,
        consecutive: consecutive
      };
    });
  }

  function recommendMachine(m) {
    var base = { Critical: "Inspect before next shift", High: "Schedule inspection within 48 hours", Medium: "Check at next planned service", Low: "Keep monitoring" }[m.level];
    var extra = [];
    if (m.count >= 3 && m.ops.length === 1) extra.push("retrain operator");
    if (m.count >= 3 && m.ops.length >= 2) extra.push("rule out mechanical cause");
    if (m.count >= 2 && m.topFpShare >= 0.75) extra.push("check " + m.topFp);
    return base + (extra.length ? " + " + extra.join(", ") : "");
  }

  function operatorStats(exc, ms) {
    var by = {};
    exc.forEach(function (r) { (by[r.operator] = by[r.operator] || []).push(r); });
    var opsOnMachine = {};
    ms.forEach(function (m) { opsOnMachine[m.eq] = m.ops.length; });
    return Object.keys(by).map(function (op) {
      var list = by[op], total = sum(list, function (r) { return r.excess; }), count = list.length;
      var machines = uniq(list.map(function (r) { return r.eq; })).sort();
      var shared = machines.filter(function (e) { return opsOnMachine[e] >= 2; });
      var rec = (count >= 3 || total >= 300) ? "Retrain" : (count >= 2 || total >= 150) ? "Counsel" : "Monitor";
      return { op: op, list: list, count: count, total: total, avg: total / count, machines: machines, shared: shared, rec: rec };
    });
  }

  function fuelStats(exc) {
    var by = {};
    exc.forEach(function (r) { (by[r.fuel] = by[r.fuel] || []).push(r); });
    var grand = sum(exc, function (r) { return r.excess; });
    var arr = Object.keys(by).map(function (fp) {
      var list = by[fp], total = sum(list, function (r) { return r.excess; });
      return { fp: fp, list: list, count: list.length, total: total, machines: uniq(list.map(function (r) { return r.eq; })).length, avg: total / list.length, share: grand ? total / grand : 0 };
    });
    arr.forEach(function (f) {
      f.flag = arr.length < 2 ? "n/a" : f.share >= 0.35 ? "Tighten control" : f.share >= 0.25 ? "Watch" : "Normal";
    });
    return arr;
  }

  function compute() {
    var pool = records.filter(function (r) { return inRange(r) && matchOther(r); });
    var exc = pool.filter(function (r) { return r.isExc; });
    var ageRef = dayNum(F.to);
    var msAll = machineStats(exc, ageRef);
    var levelOf = {};
    msAll.forEach(function (m) { levelOf[m.eq] = m.level; });
    if (F.priority) {
      pool = pool.filter(function (r) { return levelOf[r.eq] === F.priority; });
      exc = pool.filter(function (r) { return r.isExc; });
    }
    var ms = F.priority ? msAll.filter(function (m) { return m.level === F.priority; }) : msAll;
    var ops = operatorStats(exc, ms);
    var fps = fuelStats(exc);
    view = { pool: pool, exc: exc, ms: ms, ops: ops, fps: fps, ageRef: ageRef };
  }

  /* ================= badges / tags ================= */
  function badge(cls, text) { return '<span class="badge ' + cls + '">' + esc(text) + "</span>"; }
  function sevBadge(s) {
    return s === "crit" ? badge("b-crit", "■ Critical") : s === "warn" ? badge("b-warn", "▲ Warning") : badge("b-ok", "✔ Normal");
  }
  function levelBadge(l, score) {
    var cls = { Critical: "b-solid", High: "b-crit", Medium: "b-warn", Low: "b-info" }[l];
    var sym = { Critical: "■ ", High: "▲ ", Medium: "● ", Low: "○ " }[l];
    return badge(cls, sym + l) + (score !== undefined ? ' <span class="chip">' + score + " pts</span>" : "");
  }
  function statusBadge(s) { return badge(s === "Pending" ? "b-warn" : s === "Under Inspection" ? "b-info" : "b-ok", s); }
  function sev(v, warn, crit) { return v >= crit ? "crit" : v >= warn ? "warn" : "ok"; }
  function drillBtn(kind, val, label) {
    return '<button type="button" class="link" data-drill="' + esc(kind) + "|" + esc(val) + '" title="Show records for ' + esc(val) + '">' + esc(label || val) + "</button>";
  }
  function machineTags(eq) {
    var t = "";
    if (store.inspect[eq]) t += ' <span class="chip">Inspection ' + esc(fmtShort(store.inspect[eq])) + "</span>";
    if (store.locked[eq]) t += ' <span class="chip">Dispenser locked</span>';
    return t;
  }

  /* ================= generic sortable table ================= */
  var tables = {};
  function renderTable(id, cfg, rows, resetPage) {
    var t = tables[id] || (tables[id] = { sortKey: cfg.sortKey, sortDir: cfg.sortDir || "desc", page: 1 });
    t.cfg = cfg; t.rows = rows;
    if (resetPage) t.page = 1;
    drawTable(id);
  }
  function drawTable(id) {
    var t = tables[id], cfg = t.cfg, host = $(id);
    if (!t.rows.length) { host.innerHTML = '<div class="empty-msg">' + cfg.empty + "</div>"; return; }
    var rows = t.rows.slice();
    var col = null;
    cfg.cols.forEach(function (c) { if (c.key === t.sortKey) col = c; });
    if (col) {
      var dir = t.sortDir === "asc" ? 1 : -1;
      rows.sort(function (a, b) { var x = col.val(a), y = col.val(b); return x < y ? -dir : x > y ? dir : 0; });
    }
    var pages = 1;
    if (cfg.pageSize) {
      pages = Math.max(1, Math.ceil(rows.length / cfg.pageSize));
      if (t.page > pages) t.page = pages;
      rows = rows.slice((t.page - 1) * cfg.pageSize, t.page * cfg.pageSize);
    }
    var h = '<div class="tbl-sortbar"><label for="ss-' + id + '">Sort by</label><select id="ss-' + id + '" data-sortsel="' + id + '">';
    cfg.cols.forEach(function (c) {
      ["desc", "asc"].forEach(function (d) {
        h += '<option value="' + c.key + "|" + d + '"' + (c.key === t.sortKey && d === t.sortDir ? " selected" : "") + ">" + esc(c.label) + (d === "asc" ? " (low to high)" : " (high to low)") + "</option>";
      });
    });
    h += '</select></div><div class="tbl-wrap"><table class="tbl"><thead><tr>';
    cfg.cols.forEach(function (c) {
      var s = c.key === t.sortKey ? (t.sortDir === "asc" ? "ascending" : "descending") : "none";
      h += '<th class="' + (c.num ? "num" : "") + '" aria-sort="' + s + '"><button type="button" data-sort="' + id + "|" + c.key + '">' + esc(c.label) + "</button></th>";
    });
    h += "</tr></thead><tbody>";
    rows.forEach(function (r) {
      h += "<tr>";
      cfg.cols.forEach(function (c) { h += '<td class="' + (c.num ? "num" : "") + '" data-label="' + esc(c.label) + '">' + c.html(r) + "</td>"; });
      h += "</tr>";
    });
    h += "</tbody></table></div>";
    if (cfg.pageSize && t.rows.length > cfg.pageSize) {
      h += '<div class="pager"><span>Showing ' + ((t.page - 1) * cfg.pageSize + 1) + "–" + Math.min(t.page * cfg.pageSize, t.rows.length) + " of " + t.rows.length +
        '</span><span><button class="btn" type="button" data-page="' + id + '|prev"' + (t.page <= 1 ? " disabled" : "") + '>Previous</button> Page ' + t.page + " of " + pages +
        ' <button class="btn" type="button" data-page="' + id + '|next"' + (t.page >= pages ? " disabled" : "") + ">Next</button></span></div>";
    }
    host.innerHTML = h;
  }

  /* ================= renderers ================= */
  function renderScope() {
    var parts = [];
    ["type", "eq", "op", "shift", "fp", "status", "priority"].forEach(function (k) { if (F[k]) parts.push(F[k]); });
    $("scope").textContent = "Showing " + fmtDate(F.from) + " to " + fmtDate(F.to) + " · " + view.exc.length + " exception record" + (view.exc.length === 1 ? "" : "s") +
      " of " + view.pool.length + " records" + (parts.length ? " · Filters: " + parts.join(", ") : "");
  }

  function renderKpis() {
    var exc = view.exc, total = sum(exc, function (r) { return r.excess; });
    var open = exc.filter(isOpen), openMachines = uniq(open.map(function (r) { return r.eq; })).length;
    var pend = open.filter(function (r) { return r.status === "Pending"; }).length;
    var repeat = view.ms.filter(function (m) { return m.count >= 2; });
    var top = null; exc.forEach(function (r) { if (!top || r.excess > top.excess) top = r; });
    var avg = exc.length ? total / exc.length : 0;
    var days = dayNum(F.to) - dayNum(F.from) + 1;
    var perWeek = total / days * 7;
    // early-warning comparison: last 7 days against the 7 days before (ignores the period filter)
    var end = dayNum(F.to);
    var poolAll = records.filter(function (r) { return r.isExc && matchOther(r); });
    var l7 = sum(poolAll.filter(function (r) { return r.day > end - 7 && r.day <= end; }), function (r) { return r.excess; });
    var p7 = sum(poolAll.filter(function (r) { return r.day > end - 14 && r.day <= end - 7; }), function (r) { return r.excess; });
    var cmp = l7 > p7 ? "▲ up from " + num(p7) + " L" : l7 < p7 ? "▼ down from " + num(p7) + " L" : "same as the 7 days before";
    var period = F.preset === "7" ? "Last 7 days" : F.preset === "30" ? "Last 30 days" : F.preset === "month" ? "Current month" : "Custom range";

    var k = [
      { t: "Open Exceptions", v: num(open.length), s: sev(open.length, 3, 8), n: open.length ? openMachines + " machine" + (openMachines === 1 ? "" : "s") + " · " + pend + " pending, " + (open.length - pend) + " under inspection" : "Nothing waiting for action" },
      { t: "Litres Above Norm – " + period, v: num(total) + " <small>L</small>", s: sev(perWeek, 250, 500), n: "Last 7 days: " + num(l7) + " L (" + cmp + ")" },
      { t: "Machines with Repeat Exceptions", v: num(repeat.length), s: sev(repeat.length, 1, 5), n: repeat.length ? "2 or more exceptions each" : "No machine has repeated" },
      { t: "Highest Exception", v: top ? esc(top.eq) : "–", s: top ? sev(top.excess, 80, 150) : "ok", n: top ? num(top.excess) + " L above norm · " + fmtShort(top.date) + " · " + esc(top.operator) : "No exceptions in view" },
      { t: "Average Excess per Exception", v: exc.length ? num(avg) + " <small>L</small>" : "–", s: exc.length ? sev(avg, 50, 90) : "ok", n: exc.length ? num(total) + " L over " + exc.length + " exception" + (exc.length === 1 ? "" : "s") : "No exceptions in view" }
    ];
    $("kpis").innerHTML = k.map(function (x) {
      return '<div class="kpi s-' + x.s + '"><div class="k-title">' + x.t + '</div><div class="k-value">' + x.v + "</div><div>" + sevBadge(x.s) + '</div><div class="k-note">' + x.n + "</div></div>";
    }).join("");
  }

  var valueLabels = {
    id: "valueLabels",
    afterDatasetsDraw: function (chart) {
      var ctx = chart.ctx, horiz = chart.options.indexAxis === "y";
      chart.getDatasetMeta(0).data.forEach(function (bar, i) {
        var v = chart.data.datasets[0].data[i];
        ctx.save(); ctx.fillStyle = "#1c2530"; ctx.font = "600 12px Segoe UI, Arial, sans-serif";
        if (horiz) { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(num(v) + " L", bar.x + 6, bar.y); }
        else { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(num(v) + " L", bar.x, bar.y - 4); }
        ctx.restore();
      });
    }
  };
  function toggleEmpty(id, show, text) { var el = $(id); el.hidden = !show; if (text) el.textContent = text; }

  function renderTypeChart() {
    var exc = view.exc, vals = TYPES.map(function (t) { return sum(exc.filter(function (r) { return r.type === t; }), function (r) { return r.excess; }); });
    var total = sum(vals), max = Math.max.apply(null, vals);
    var topIdx = vals.indexOf(max);
    $("type-callout").innerHTML = total ? "<strong>" + esc(TYPES[topIdx]) + "</strong> contributes the most excess: " + num(max) + " L (" + pct(max / total) + " of " + num(total) + " L)." : "No excess consumption in the current view.";
    toggleEmpty("empty-type", !total, "No exceptions match the selected filters.");
    if (typeof Chart === "undefined") return;
    var colors = vals.map(function (v, i) { return total && i === topIdx ? "#c98a00" : "#4a6274"; });
    if (!charts.type) {
      charts.type = new Chart($("ch-type"), {
        type: "bar",
        data: { labels: TYPES, datasets: [{ label: "Litres above norm", data: vals, backgroundColor: colors, borderRadius: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 20 } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return num(c.parsed.y) + " L above norm"; } } } },
          scales: { x: { title: { display: true, text: "Equipment type" } }, y: { beginAtZero: true, title: { display: true, text: "Litres above norm" }, ticks: { precision: 0 } } },
          onClick: function (e, els) { if (els.length) openDrill("type", TYPES[els[0].index]); },
          onHover: function (e, els) { e.native.target.style.cursor = els.length ? "pointer" : "default"; }
        },
        plugins: [valueLabels]
      });
    } else {
      charts.type.data.datasets[0].data = vals; charts.type.data.datasets[0].backgroundColor = colors; charts.type.update();
    }
  }

  function renderTrendChart() {
    var from = dayNum(F.from), to = dayNum(F.to), span = to - from + 1, weekly = span > 45;
    var keys = [], labels = [], cnt = {}, lit = {};
    function key(d) { return weekly ? d - ((d + 3) % 7) : d; }
    for (var d = from; d <= to; d++) { var k = key(d); if (cnt[k] === undefined) { cnt[k] = 0; lit[k] = 0; keys.push(k); labels.push(weekly ? "Week of " + fmtShort(numToDate(k)) : fmtShort(numToDate(k))); } }
    view.exc.forEach(function (r) { var k = key(r.day); if (cnt[k] !== undefined) { cnt[k]++; lit[k] += r.excess; } });
    var counts = keys.map(function (k) { return cnt[k]; }), litres = keys.map(function (k) { return lit[k]; });
    var any = sum(counts) > 0;
    $("trend-sub").textContent = "Number of exceptions and litres above norm, per " + (weekly ? "week" : "day") + ", " + fmtShort(F.from) + " to " + fmtShort(F.to) + ".";
    var peak = litres.indexOf(Math.max.apply(null, litres));
    $("trend-callout").innerHTML = any ? "Peak " + (weekly ? "week" : "day") + ": <strong>" + esc(labels[peak]) + "</strong> – " + counts[peak] + " exception" + (counts[peak] === 1 ? "" : "s") + ", " + num(litres[peak]) + " L." : "No exceptions in this period.";
    toggleEmpty("empty-trend", !any, "No exceptions match the selected filters.");
    if (typeof Chart === "undefined") return;
    if (!charts.trend) {
      charts.trend = new Chart($("ch-trend"), {
        type: "line",
        data: { labels: labels, datasets: [
          { label: "Number of exceptions (left axis)", data: counts, borderColor: "#1b5a94", backgroundColor: "#1b5a94", yAxisID: "y", tension: 0, pointRadius: 3 },
          { label: "Litres above norm (right axis)", data: litres, borderColor: "#b06f00", backgroundColor: "#b06f00", borderDash: [6, 4], yAxisID: "y1", tension: 0, pointRadius: 3 }
        ] },
        options: {
          responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
          plugins: { legend: { position: "bottom" } },
          scales: {
            x: { ticks: { maxRotation: 60, autoSkip: true, maxTicksLimit: 12 } },
            y: { beginAtZero: true, position: "left", title: { display: true, text: "Exceptions" }, ticks: { precision: 0 } },
            y1: { beginAtZero: true, position: "right", title: { display: true, text: "Litres above norm" }, grid: { drawOnChartArea: false }, ticks: { precision: 0 } }
          }
        }
      });
    } else {
      var c = charts.trend; c.data.labels = labels; c.data.datasets[0].data = counts; c.data.datasets[1].data = litres; c.update();
    }
  }

  function renderRepeat() {
    var rows = view.ms.filter(function (m) { return m.count >= 2; });
    renderTable("t-repeat", {
      sortKey: "count", empty: "No machine has 2 or more exceptions in this view. Good news, or try a wider period.",
      cols: [
        { key: "eq", label: "Equipment No.", val: function (m) { return m.eq; }, html: function (m) { return drillBtn("eq", m.eq) + machineTags(m.eq); } },
        { key: "type", label: "Type", val: function (m) { return m.type; }, html: function (m) { return esc(m.type); } },
        { key: "count", label: "Exceptions", num: 1, val: function (m) { return m.count * 100000 + m.total; }, html: function (m) { return m.count; } },
        { key: "days", label: "Days affected", num: 1, val: function (m) { return m.days; }, html: function (m) { return m.days; } },
        { key: "total", label: "Total excess (L)", num: 1, val: function (m) { return m.total; }, html: function (m) { return num(m.total); } },
        { key: "last", label: "Last exception", val: function (m) { return m.lastDate; }, html: function (m) { return fmtShort(m.lastDate); } },
        { key: "open", label: "Still open", num: 1, val: function (m) { return m.open; }, html: function (m) { return m.open ? badge("b-warn", "▲ " + m.open + " open") : badge("b-ok", "✔ None"); } }
      ]
    }, rows, true);
  }

  function renderInspect() {
    var rows = view.ms.filter(function (m) { return UI.showLow || m.score >= 2; });
    var hidden = view.ms.length - rows.length;
    renderTable("t-inspect", {
      sortKey: "prio", empty: view.ms.length ? "No machine reaches Medium priority in this view. Tick “Also show Low priority machines” to see the rest." : "No exceptions in this view, so no machine needs inspection.",
      cols: [
        { key: "eq", label: "Equipment No.", val: function (m) { return m.eq; }, html: function (m) { return drillBtn("eq", m.eq) + machineTags(m.eq); } },
        { key: "type", label: "Type", val: function (m) { return m.type; }, html: function (m) { return esc(m.type); } },
        { key: "total", label: "Total excess (L)", num: 1, val: function (m) { return m.total; }, html: function (m) { return num(m.total); } },
        { key: "count", label: "Exceptions", num: 1, val: function (m) { return m.count; }, html: function (m) { return m.count; } },
        { key: "last", label: "Last exception", val: function (m) { return m.lastDate; }, html: function (m) { return fmtShort(m.lastDate); } },
        { key: "prio", label: "Priority", val: function (m) { return m.score * 100000 + m.total; }, html: function (m) { return levelBadge(m.level, m.score); } },
        { key: "why", label: "Why", val: function (m) { return m.score; }, html: function (m) {
          var c = []; if (m.pts.litres) c.push("High litres +" + m.pts.litres); if (m.pts.repeat) c.push("Repeat +" + m.pts.repeat);
          if (m.pts.sudden) c.push("Sudden rise +1"); if (m.pts.consecutive) c.push("Back-to-back shifts +1"); if (m.pts.open) c.push("Open " + m.oldestOpenAge + " days +1");
          return c.length ? c.map(function (x) { return '<span class="chip">' + esc(x) + "</span>"; }).join("") : '<span class="chip">No criteria met</span>'; } },
        { key: "rec", label: "Recommended action", val: function (m) { return m.score; }, html: function (m) { return esc(recommendMachine(m)); } }
      ]
    }, rows, true);
    if (hidden > 0 && !UI.showLow) $("t-inspect").insertAdjacentHTML("beforeend", '<p class="note">' + hidden + " Low priority machine" + (hidden === 1 ? " is" : "s are") + " hidden.</p>");
  }

  function renderOperators() {
    renderTable("t-operator", {
      sortKey: "total", empty: "No operator has an exception in this view.",
      cols: [
        { key: "op", label: "Operator", val: function (o) { return o.op; }, html: function (o) { return drillBtn("operator", o.op) + (store.flag[o.op] ? ' <span class="chip">Flagged</span>' : ""); } },
        { key: "count", label: "Exceptions", num: 1, val: function (o) { return o.count; }, html: function (o) { return o.count; } },
        { key: "total", label: "Total excess (L)", num: 1, val: function (o) { return o.total; }, html: function (o) { return num(o.total); } },
        { key: "avg", label: "Avg per exception (L)", num: 1, val: function (o) { return o.avg; }, html: function (o) { return num(o.avg); } },
        { key: "machines", label: "Machines", val: function (o) { return o.machines.join(); }, html: function (o) { return esc(o.machines.join(", ")); } },
        { key: "rec", label: "Recommendation", val: function (o) { return ({ Retrain: 3, Counsel: 2, Monitor: 1 })[o.rec] * 100000 + o.total; }, html: function (o) {
          var b = o.rec === "Retrain" ? badge("b-crit", "▲ Retrain") : o.rec === "Counsel" ? badge("b-warn", "● Counsel") : badge("b-info", "○ Monitor");
          return b + (o.shared.length && o.rec !== "Monitor" ? '<div class="note">Inspect ' + esc(o.shared.join(", ")) + " first: other operators also exceed norm on it.</div>" : ""); } }
      ]
    }, view.ops, true);
  }

  function renderFuelPoints() {
    var fps = view.fps;
    toggleEmpty("empty-fp", !fps.length, "No exceptions match the selected filters.");
    if (typeof Chart !== "undefined") {
      var sorted = fps.slice().sort(function (a, b) { return a.fp < b.fp ? -1 : 1; });
      var labels = sorted.map(function (f) { return f.fp; }), data = sorted.map(function (f) { return f.total; });
      var colors = sorted.map(function (f) { return f.flag === "Tighten control" ? "#a3231b" : f.flag === "Watch" ? "#c98a00" : "#4a6274"; });
      if (!charts.fp) {
        charts.fp = new Chart($("ch-fp"), {
          type: "bar",
          data: { labels: labels, datasets: [{ label: "Excess litres", data: data, backgroundColor: colors, borderRadius: 4 }] },
          options: {
            indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 50 } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return num(c.parsed.x) + " L above norm"; } } } },
            scales: { x: { beginAtZero: true, title: { display: true, text: "Litres above norm" }, ticks: { precision: 0 } } },
            onClick: function (e, els) { if (els.length) openDrill("fp", charts.fp.data.labels[els[0].index]); },
            onHover: function (e, els) { e.native.target.style.cursor = els.length ? "pointer" : "default"; }
          },
          plugins: [valueLabels]
        });
      } else {
        var c = charts.fp; c.data.labels = labels; c.data.datasets[0].data = data; c.data.datasets[0].backgroundColor = colors; c.update();
      }
    }
    renderTable("t-fp", {
      sortKey: "total", empty: "No fuel issue point has an exception in this view.",
      cols: [
        { key: "fp", label: "Fuel Issue Point", val: function (f) { return f.fp; }, html: function (f) { return drillBtn("fp", f.fp); } },
        { key: "count", label: "Exceptions", num: 1, val: function (f) { return f.count; }, html: function (f) { return f.count; } },
        { key: "total", label: "Total excess (L)", num: 1, val: function (f) { return f.total; }, html: function (f) { return num(f.total) + " (" + pct(f.share) + ")"; } },
        { key: "machines", label: "Machines affected", num: 1, val: function (f) { return f.machines; }, html: function (f) { return f.machines; } },
        { key: "avg", label: "Avg per exception (L)", num: 1, val: function (f) { return f.avg; }, html: function (f) { return num(f.avg); } },
        { key: "flag", label: "Control", val: function (f) { return f.total; }, html: function (f) {
          return f.flag === "Tighten control" ? badge("b-crit", "▲ Tighten control") : f.flag === "Watch" ? badge("b-warn", "● Watch") : f.flag === "Normal" ? badge("b-ok", "✔ Normal") : badge("b-mute", "n/a (one point in view)"); } }
      ]
    }, fps, true);
  }

  function renderControls() {
    var exc = view.exc, ms = view.ms, fps = view.fps;
    var open = exc.filter(isOpen);
    var openByFp = {}; open.forEach(function (r) { openByFp[r.fuel] = (openByFp[r.fuel] || 0) + 1; });
    var topOpenFp = Object.keys(openByFp).sort(function (a, b) { return openByFp[b] - openByFp[a]; })[0];
    var multi = fps.filter(function (f) { return f.machines >= 3; });
    var checks = exc.filter(function (r) { return r.action === "Check Fuel Issue" && isOpen(r); });
    var byTotal = ms.slice().sort(function (a, b) { return b.total - a.total; }).slice(0, 3);
    var high = exc.filter(function (r) { return r.excess >= 100; }).sort(function (a, b) { return b.excess - a.excess; });
    var sh = SHIFTS.map(function (s) { var l = exc.filter(function (r) { return r.shift === s; }); return { s: s, n: l.length, t: sum(l, function (r) { return r.excess; }) }; }).sort(function (a, b) { return b.n - a.n; });
    var shiftAct = exc.length >= 3 && sh[0].n / exc.length >= 0.4;
    var crit = ms.filter(function (m) { return m.level === "Critical" || m.level === "High"; }).map(function (m) { return m.eq; });
    var cards = [
      { t: "Verify fuel issue records", act: open.length > 0, why: open.length ? open.length + " exception" + (open.length === 1 ? " is" : "s are") + " still open. Start with " + topOpenFp + " (" + openByFp[topOpenFp] + " open)." : "No open exceptions. Continue routine sampling of issue slips." },
      { t: "Check meter calibration", act: multi.length > 0, why: multi.length ? joinList(multi.map(function (f) { return f.fp; })) + " affect" + (multi.length === 1 ? "s" : "") + " 3 or more machines. A shared cause such as the dispenser meter is possible." : "No fuel point is linked to 3 or more machines. Keep the routine calibration schedule." },
      { t: "Verify equipment hour-meter readings", act: checks.length > 0, why: checks.length ? checks.length + " open fuel-issue check" + (checks.length === 1 ? "" : "s") + " on " + joinList(uniq(checks.map(function (r) { return r.eq; })).sort()) + ". Compare hour-meter readings with the issue slips." : "No open fuel-issue checks." },
      { t: "Reconcile fuel issued vs. machine operating hours", act: byTotal.length > 0, why: byTotal.length ? "Start with the highest excess: " + joinList(byTotal.map(function (m) { return m.eq + " (" + num(m.total) + " L)"; })) + "." : "No excess to reconcile." },
      { t: "Review unusually high individual fuel issues", act: high.length > 0, why: high.length ? high.length + " exception" + (high.length === 1 ? " is" : "s are") + " 100 L or more above norm: " + joinList(high.slice(0, 4).map(function (r) { return r.eq + " " + fmtShort(r.date) + " (" + num(r.excess) + " L)"; })) + "." : "No single exception is 100 L or more above norm." },
      { t: "Strengthen shift-wise fuel recording", act: shiftAct, why: exc.length ? sh[0].s + " has the most exceptions (" + sh[0].n + " of " + exc.length + ", " + num(sh[0].t) + " L). " + (shiftAct ? "Tighten shift hand-over and slip recording there." : "Spread is fairly even. Keep recording each shift.") : "No exceptions to compare across shifts." },
      { t: "Require supervisor verification for exceptional fuel issues", act: crit.length > 0 || high.length > 0, why: crit.length ? "Apply first to Critical/High machines: " + joinList(crit) + "." : high.length ? "Apply to issues 100 L or more above norm." : "No Critical/High machines. Keep the standing rule." }
    ];
    $("controls").innerHTML = cards.map(function (c) {
      return '<div class="ctrl"><h3>' + esc(c.t) + "</h3>" + (c.act ? badge("b-warn", "▲ Act now") : badge("b-ok", "✔ Routine check")) + "<p>" + esc(c.why) + "</p></div>";
    }).join("");
  }

  function renderMgmt() {
    var ms = view.ms, ops = view.ops, fps = view.fps, ageRef = view.ageRef;
    var items = [];
    var insp = ms.filter(function (m) { return m.level === "Critical" || m.level === "High"; }).sort(function (a, b) { return b.score - a.score || b.total - a.total; });
    items.push(["INSPECT", insp.length ? "Inspect " + joinList(insp.map(function (m) { return m.eq; })) + " due to repeated or high fuel exceptions (Critical/High priority)." : "No machine currently meets the Critical or High inspection rule."]);
    var retrain = ops.filter(function (o) { return o.rec === "Retrain" && !o.shared.length; });
    var counsel = ops.filter(function (o) { return o.rec === "Counsel" && !o.shared.length; });
    var text = [];
    if (retrain.length) text.push("Retrain " + joinList(retrain.map(function (o) { return o.op + " (" + o.count + " exceptions, " + num(o.total) + " L)"; })) + ".");
    if (counsel.length) text.push("Counsel " + joinList(counsel.map(function (o) { return o.op; })) + ".");
    items.push(["RETRAIN", text.length ? text.join(" ") + " Repeated exceptions on machines that only they operate." : "No operator meets the retraining rule on a machine that only they operate."]);
    var tight = fps.filter(function (f) { return f.flag === "Tighten control"; });
    items.push(["FUEL CONTROL", tight.length ? tight.map(function (f) { return "Review fuel issue records and meter calibration at " + f.fp + " (" + pct(f.share) + " of excess litres, " + f.machines + " machine" + (f.machines === 1 ? "" : "s") + ")."; }).join(" ") : "No fuel issue point stands out. Keep routine checks."]);
    var em = ms.filter(function (m) { return m.count >= 3 && m.ops.length >= 2; });
    items.push(["E&M CHECK", em.length ? "Inspect " + joinList(em.map(function (m) { return m.eq; })) + " for a possible mechanical cause (leaks, injectors, engine load): excess appears under more than one operator." : "No machine has 3 or more exceptions under several operators."]);
    var inInsp = {}; insp.forEach(function (m) { inInsp[m.eq] = 1; });
    var mon = ms.filter(function (m) { return !inInsp[m.eq] && (m.consecutive || (m.level === "Medium" && ageRef - m.last.day <= 7)); });
    items.push(["MONITOR", mon.length ? "Closely monitor " + joinList(mon.map(function (m) { return m.eq; })) + " for the next 7 days (recent, back-to-back or repeated exceptions)." : "No extra monitoring needed beyond the machines listed above."]);
    $("mgmt-list").innerHTML = items.map(function (it, i) {
      return "<li>" + (i + 1) + '. <span class="act-tag">' + esc(it[0]) + "</span>" + esc(it[1]) + "</li>";
    }).join("");
  }

  var DETAIL_COLS = [
    { key: "date", label: "Date", val: function (r) { return r.day * 10 + (r.shiftSeq % 3); }, html: function (r) { return fmtDate(r.date); } },
    { key: "eq", label: "Equipment", val: function (r) { return r.eq; }, html: function (r) { return drillBtn("eq", r.eq); } },
    { key: "type", label: "Type", val: function (r) { return r.type; }, html: function (r) { return esc(r.type); } },
    { key: "operator", label: "Operator", val: function (r) { return r.operator; }, html: function (r) { return drillBtn("operator", r.operator); } },
    { key: "shift", label: "Shift", val: function (r) { return r.shift; }, html: function (r) { return esc(r.shift); } },
    { key: "fuel", label: "Fuel Point", val: function (r) { return r.fuel; }, html: function (r) { return drillBtn("fp", r.fuel); } },
    { key: "norm", label: "Norm (L)", num: 1, val: function (r) { return r.norm; }, html: function (r) { return num(r.norm); } },
    { key: "actual", label: "Actual (L)", num: 1, val: function (r) { return r.actual; }, html: function (r) { return num(r.actual); } },
    { key: "excess", label: "Above norm (L)", num: 1, val: function (r) { return r.excess; }, html: function (r) { return r.isExc ? "<strong>" + num(r.excess) + "</strong>" : "0"; } },
    { key: "status", label: "Status", val: function (r) { return r.status; }, html: function (r) { return r.isExc ? statusBadge(r.status) : badge("b-mute", "Within norm"); } },
    { key: "action", label: "Action required", val: function (r) { return r.action; }, html: function (r) { return esc(r.action); } },
    { key: "remarks", label: "Remarks", val: function (r) { return r.remarks; }, html: function (r) { return esc(r.remarks); } }
  ];
  function detailRows() {
    var q = UI.search.trim().toLowerCase();
    return view.pool.filter(function (r) { return UI.includeNormal || r.isExc; }).filter(function (r) {
      if (!q) return true;
      return [r.date, fmtDate(r.date), r.eq, r.type, r.operator, r.shift, r.fuel, r.status, r.action, r.remarks].join(" ").toLowerCase().indexOf(q) !== -1;
    });
  }
  function renderDetail(resetPage) {
    renderTable("t-detail", {
      sortKey: "date", pageSize: 15, cols: DETAIL_COLS,
      empty: UI.search ? "No records match your search. Clear the search box to see all records." : "No exception records match the selected filters. Try “Reset filters” or a wider period."
    }, detailRows(), resetPage);
  }

  /* ================= drill-down ================= */
  var drillOpener = null;
  function openDrill(kind, val) {
    var key = { type: "type", eq: "eq", operator: "operator", fp: "fuel" }[kind];
    var recs = records.filter(function (r) { return r.isExc && inRange(r) && r[key] === val; });
    var label = { type: "Equipment type", eq: "Equipment", operator: "Operator", fp: "Fuel issue point" }[kind];
    var extra = "";
    if (kind === "eq" && recs.length) extra = " · " + recs[0].type;
    $("drill-title").textContent = label + ": " + val + extra;
    $("drill-sub").textContent = "All exception records in the selected period (" + fmtShort(F.from) + " to " + fmtShort(F.to) + "). Other filters do not apply here.";
    var total = sum(recs, function (r) { return r.excess; });
    var openN = recs.filter(isOpen).length;
    $("drill-sum").innerHTML = "<span><strong>" + recs.length + "</strong> exception" + (recs.length === 1 ? "" : "s") + "</span><span><strong>" + num(total) + " L</strong> above norm</span>" +
      "<span>Average <strong>" + (recs.length ? num(total / recs.length) : 0) + " L</strong></span><span><strong>" + openN + "</strong> open</span>";
    var cols = ["date", "shift", "norm", "actual", "excess", "operator", "fuel", "status", "action"].map(function (k) { return DETAIL_COLS.filter(function (c) { return c.key === k; })[0]; });
    delete tables["t-drill"];
    renderTable("t-drill", { sortKey: "date", cols: cols, empty: "No exception records for " + esc(val) + " in this period." }, recs, true);
    var ov = $("drill");
    if (!ov.classList.contains("open")) drillOpener = document.activeElement;
    ov.classList.add("open");
    $("drill-close").focus();
  }
  function closeDrill() {
    $("drill").classList.remove("open");
    if (drillOpener && document.contains(drillOpener)) drillOpener.focus();
  }

  /* ================= action panel ================= */
  function logAction(text) {
    store.log.unshift({ t: Date.now(), text: text });
    store.log = store.log.slice(0, 30);
    saveStore();
  }
  function apMsg(text, bad) { $("ap-msg").innerHTML = text ? '<p class="msg' + (bad ? " bad" : "") + '">' + esc(text) + "</p>" : ""; }
  function renderPanel() {
    var eqSel = $("ap-eq"), cur = eqSel.value;
    var list = view.ms.slice().sort(function (a, b) { return b.score - a.score || b.total - a.total; });
    if (!list.length) { eqSel.innerHTML = '<option value="">No machines with exceptions in view</option>'; }
    else {
      eqSel.innerHTML = list.map(function (m) { return '<option value="' + esc(m.eq) + '">' + esc(m.eq + " – " + m.level + " priority (" + num(m.total) + " L)") + "</option>"; }).join("");
      eqSel.value = list.some(function (m) { return m.eq === cur; }) ? cur : list[0].eq;
    }
    if (!$("ap-date").value) $("ap-date").value = numToDate(DATA_MAX + 1);
    refreshPanelOps();
    ["ap-inspect", "ap-retrain"].forEach(function (id) { $(id).disabled = !list.length; });
    $("ap-lock").disabled = !list.length;
    $("ap-lock").checked = !!store.locked[eqSel.value];
    var lg = store.log.slice(0, 6);
    $("ap-log").innerHTML = lg.length ? lg.map(function (l) {
      var when = ""; try { when = new Date(l.t).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); } catch (e) { when = new Date(l.t).toISOString(); }
      return "<li><time>" + esc(when) + "</time> – " + esc(l.text) + "</li>";
    }).join("") : '<li class="note">No requests yet.</li>';
  }
  function refreshPanelOps() {
    var eq = $("ap-eq").value, cur = $("ap-op").value;
    var mine = [], m = view.ms.filter(function (x) { return x.eq === eq; })[0];
    if (m) mine = m.ops;
    var others = uniq(records.map(function (r) { return r.operator; })).sort().filter(function (o) { return mine.indexOf(o) === -1; });
    var h = "";
    mine.forEach(function (o) { h += '<option value="' + esc(o) + '">' + esc(o) + " (operated this machine)</option>"; });
    others.forEach(function (o) { h += '<option value="' + esc(o) + '">' + esc(o) + "</option>"; });
    $("ap-op").innerHTML = h;
    var opts = mine.concat(others);
    $("ap-op").value = opts.indexOf(cur) !== -1 && cur ? cur : (mine[0] || opts[0] || "");
  }

  /* ================= CSV ================= */
  function downloadCsv() {
    try {
      var rows = detailRows(), t = tables["t-detail"];
      var head = ["Date", "Equipment Type", "Equipment No", "Operator", "Shift", "Norm (L)", "Actual (L)", "Litres Above Norm", "Fuel Issue Point", "Inspection Status", "Action Required", "Remarks"];
      var lines = [head.join(",")];
      rows.forEach(function (r) {
        lines.push([r.date, r.type, r.eq, r.operator, r.shift, r.norm, r.actual, r.excess, r.fuel, r.status, r.action, r.remarks].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(","));
      });
      var blob = new Blob([lines.join("\n")], { type: "text/csv" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "diesel-exceptions-sample.csv";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { showError("downloading the CSV file", e); }
  }

  /* ================= main render ================= */
  function renderAll(resetPage) {
    try {
      $("error-area").innerHTML = "";
      compute();
      renderScope(); renderKpis(); renderTypeChart(); renderTrendChart();
      renderRepeat(); renderInspect(); renderOperators(); renderFuelPoints();
      renderControls(); renderMgmt(); renderPanel(); renderDetail(resetPage);
    } catch (e) { showError("drawing the dashboard", e); if (window.console) console.error(e); }
  }

  /* ================= events ================= */
  function bind() {
    ["f-preset", "f-from", "f-to", "f-type", "f-eq", "f-op", "f-shift", "f-fp", "f-status", "f-priority"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        if ((id === "f-from" || id === "f-to")) $("f-preset").value = "custom";
        readFilters(); renderAll(true);
      });
    });
    $("f-reset").addEventListener("click", function () {
      $("f-preset").value = "30"; ["f-type", "f-eq", "f-op", "f-shift", "f-fp", "f-status", "f-priority"].forEach(function (id) { $(id).value = ""; });
      readFilters(); UI.search = ""; $("d-search").value = ""; renderAll(true);
    });
    $("show-low").addEventListener("change", function () { UI.showLow = this.checked; renderInspect(); });
    $("d-search").addEventListener("input", function () { UI.search = this.value; renderDetail(true); });
    $("d-normal").addEventListener("change", function () { UI.includeNormal = this.checked; renderDetail(true); });
    $("d-csv").addEventListener("click", downloadCsv);
    $("drill-close").addEventListener("click", closeDrill);
    $("drill").addEventListener("click", function (e) { if (e.target === this) closeDrill(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrill(); });

    document.addEventListener("click", function (e) {
      var el = e.target.closest ? e.target.closest("[data-drill],[data-sort],[data-page]") : null;
      if (!el) return;
      if (el.hasAttribute("data-drill")) { var p = el.getAttribute("data-drill").split("|"); openDrill(p[0], p[1]); }
      else if (el.hasAttribute("data-sort")) {
        var s = el.getAttribute("data-sort").split("|"), t = tables[s[0]];
        if (t.sortKey === s[1]) t.sortDir = t.sortDir === "asc" ? "desc" : "asc"; else { t.sortKey = s[1]; t.sortDir = "desc"; }
        drawTable(s[0]);
      } else {
        var g = el.getAttribute("data-page").split("|"), tt = tables[g[0]];
        tt.page += g[1] === "next" ? 1 : -1; drawTable(g[0]);
      }
    });
    document.addEventListener("change", function (e) {
      var id = e.target.getAttribute && e.target.getAttribute("data-sortsel");
      if (!id) return;
      var v = e.target.value.split("|"); tables[id].sortKey = v[0]; tables[id].sortDir = v[1]; drawTable(id);
    });

    $("ap-eq").addEventListener("change", function () { refreshPanelOps(); $("ap-lock").checked = !!store.locked[this.value]; apMsg(""); });
    $("ap-inspect").addEventListener("click", function () {
      var eq = $("ap-eq").value, d = $("ap-date").value;
      if (!eq) return; if (!d) { apMsg("Please choose an inspection date first.", true); return; }
      store.inspect[eq] = d; logAction("Mechanical inspection scheduled for " + eq + " on " + fmtDate(d) + " (check engine and leaks).");
      apMsg("Inspection of " + eq + " scheduled for " + fmtDate(d) + ". (Demo: saved in this browser only.)"); renderInspect(); renderRepeat(); renderPanel();
    });
    $("ap-retrain").addEventListener("click", function () {
      var op = $("ap-op").value; if (!op) return;
      store.flag[op] = true; logAction("Operator " + op + " flagged for retraining (excessive idling).");
      apMsg(op + " flagged for retraining. (Demo: saved in this browser only.)"); renderOperators(); renderPanel();
    });
    $("ap-lock").addEventListener("change", function () {
      var eq = $("ap-eq").value, box = this;
      if (box.checked) {
        var m = view.ms.filter(function (x) { return x.eq === eq; })[0];
        if (!m || m.count < 2) { box.checked = false; apMsg("Locking is meant for repeat exceptions (2 or more). " + eq + " does not have that in the current view.", true); return; }
        if (!window.confirm("Lock the fuel dispenser for " + eq + "?\n\nThis blocks refuelling until a supervisor approves. (Demo only: no real dispenser is changed.)")) { box.checked = false; return; }
        store.locked[eq] = true; logAction("Fuel dispenser LOCKED for " + eq + " (repeat exceptions).");
        apMsg("Dispenser lock requested for " + eq + ". Supervisor approval is needed to release it.");
      } else {
        delete store.locked[eq]; logAction("Fuel dispenser lock RELEASED for " + eq + ".");
        apMsg("Lock released for " + eq + ".");
      }
      renderInspect(); renderRepeat(); renderPanel();
    });
  }

  /* ================= start ================= */
  function start() {
    if (typeof Chart === "undefined") {
      showError("loading the chart library", "Chart.js could not be loaded from cdn.jsdelivr.net. Tables and numbers still work; charts are hidden. Check the internet connection.");
    }
    if (!records.length) { showError("loading the records", "The database has no records yet. Add one on the Add Record page (or ask the Data Keeper to run database/01-setup.sql)."); return; }
    try { initFilters(); bind(); } catch (e) { showError("setting up the filters", e); return; }
    var err = $("error-area").innerHTML;
    renderAll(true);
    if (err && !$("error-area").innerHTML) $("error-area").innerHTML = err;
  }
  start();
})();
