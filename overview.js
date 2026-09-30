/* overview.js - Fuel Dashboard (dashboard.html).
   Reads the table fuel_readings from Supabase. New readings reach every open dashboard live
   (Supabase Realtime, plus a check every few seconds as a back-up) and raise alerts.
   If the database cannot be read, it falls back to DEMO MODE: built-in made-up data from
   overview-data.js and simulated readings. Every number is worked out here, none is typed in. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var FONT = '"Inter Variable", Inter, "Segoe UI", Arial, sans-serif';
  var EXC_TYPES = ["High Consumption", "Low Consumption", "Refueling Irregularity", "Mileage Mismatch", "Other"];
  var EXC_COLORS = { "High Consumption": "#c62828", "Low Consumption": "#0b57c7", "Refueling Irregularity": "#c98a00", "Mileage Mismatch": "#0a1f44", "Other": "#8a96a8" };
  var STATUSES = ["Open", "Under Review", "In Progress", "Closed"];
  var WIDGETS = [["trend", "Diesel consumption trend"], ["type", "Exceptions by type"], ["mine", "Exceptions by mine"], ["eff", "Fuel efficiency by vehicle type"], ["equip", "Fuel consumption by equipment"], ["locations", "Top 5 exception vehicles"], ["details", "Exception details table"], ["insights", "Key insights"], ["actions", "Recommended actions"]];
  var DEFAULTS = { alertTypes: EXC_TYPES.slice(), critTypes: ["High Consumption"], price: 92, group: "auto", live: true, interval: 30, toasts: true, sound: false, rows: 8, widgets: {} };
  WIDGETS.forEach(function (w) { DEFAULTS.widgets[w[0]] = true; });

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { return Math.round(n).toLocaleString("en-IN"); }
  function num1(n) { return (Math.round(n * 10) / 10).toLocaleString("en-IN"); }
  function rs(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
  function sum(a, f) { var t = 0; a.forEach(function (x) { t += f(x); }); return t; }
  function uniq(a) { var o = {}; a.forEach(function (x) { o[x] = 1; }); return Object.keys(o); }
  function dayNum(s) { var p = s.split("-"); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function numToDate(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
  function fmtDate(s) { var d = new Date(dayNum(s) * 86400000); return String(d.getUTCDate()).padStart(2, "0") + "-" + MON[d.getUTCMonth()] + "-" + d.getUTCFullYear(); }
  function fmtShort(s) { var d = new Date(dayNum(s) * 86400000); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; }
  function joinList(a) { return a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
  function showError(where, e, hint) {
    var msg = e && e.message ? e.message : String(e);
    $("error-area").innerHTML = '<div class="error-box"><strong>Sorry, something went wrong while ' + esc(where) + ".</strong>" + esc(hint || "") + " Please send this message to the team:<code>" + esc(msg) + "</code></div>";
  }
  function load(key, fallback) { try { var v = JSON.parse(localStorage.getItem(key) || "null"); return v == null ? fallback : v; } catch (e) { return fallback; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode: fine */ } }

  var META = window.OVERVIEW_META, ROWS = window.OVERVIEW_ROWS;   // built-in sample data (demo mode only)
  if (typeof Chart === "undefined") showError("loading the chart library", "Chart.js could not be loaded from cdn.jsdelivr.net. Numbers and tables still work; charts are hidden. Check the internet connection.");
  else { Chart.defaults.font.family = FONT; Chart.defaults.color = "#33425c"; }

  var SHIFTS = ["A Shift", "B Shift", "C Shift"];
  var TYPE_ORDER = ["H.E. Dumpers", "Tippers", "Excavators", "Dozers", "Graders", "Others"];
  var FIXED = {};   // fixed litres and distance per vehicle (fixed-values.js)
  (window.FIXED_VEHICLES || []).forEach(function (v) { FIXED[v.no] = v; });

  /* ================= settings, records, state ================= */
  var S = load("mclOverviewSettings", {});
  Object.keys(DEFAULTS).forEach(function (k) { if (S[k] === undefined) S[k] = JSON.parse(JSON.stringify(DEFAULTS[k])); });
  WIDGETS.forEach(function (w) { if (S.widgets[w[0]] === undefined) S.widgets[w[0]] = true; });
  if (!Array.isArray(S.alertTypes)) S.alertTypes = EXC_TYPES.slice();
  if (!Array.isArray(S.critTypes)) S.critTypes = ["High Consumption"];
  var overrides = load("mclOverviewStatus", {});   // demo mode only; real statuses live in the database
  var views = load("mclOverviewViews", []);

  var USER = window.MCLUser || { can: function () { return true; }, label: function () { return "Guest"; }, roleDesc: function () { return ""; }, onChange: function () {}, get: function () { return { name: "Guest", role: "Viewer" }; } };
  function who() { return USER.label(); }
  var hasAudit = null;   // null = unknown, true/false once we know whether the audit columns (03 SQL file) exist
  var hasType = null;    // same for the exception_type column (04 SQL file)
  var MODE = "demo", db = null, channel = null, pollTimer = null, lastCreated = "", connState = "demo", dbIds = {};
  var records = [], machines = [], mineList = [], typeList = TYPE_ORDER.slice();
  var DATA_MIN = 0, DATA_MAX = 0;
  function todayLocal() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  // Old rows (before 04-fixed-readings.sql) have no exception_type: work it out once from the old numbers.
  function legacyType(flag, act, exp) {
    if (flag) return flag;
    if (act !== null && act !== undefined && exp > 0) { if (act > exp * 1.10) return "High Consumption"; if (act < exp * 0.90) return "Low Consumption"; }
    return "";
  }
  // litres, distance, vehicle type and mine always come from the fixed list when the vehicle is known
  function withFixed(o) { var fx = FIXED[o.no]; if (fx) { o.vtype = fx.vtype; o.mine = fx.mine; o.lit = fx.litres; o.km = fx.km; } return o; }
  function makeRec(o) {
    return { id: records.length, date: o.date, day: dayNum(o.date), no: o.no, vtype: o.vtype, mine: o.mine, shift: o.shift, lit: o.lit, km: o.km,
      type: o.type || "", status: o.status, dbId: o.dbId || null, live: !!o.live, enteredBy: o.enteredBy || "", updatedBy: o.updatedBy || "", updatedAt: o.updatedAt || "" };
  }
  function recFromDb(row) {
    var typ = (row.exception_type !== undefined && row.exception_type !== null) ? row.exception_type : legacyType(row.exception_flag, row.actual_litres === null || row.actual_litres === undefined ? null : Number(row.actual_litres), Number(row.expected_litres));
    return makeRec(withFixed({ date: String(row.reading_date).slice(0, 10), vtype: row.vehicle_type, no: row.vehicle_no, mine: row.mine, shift: row.shift,
      lit: Number(row.expected_litres), km: Number(row.km), type: typ, status: row.status, dbId: row.id, enteredBy: row.entered_by, updatedBy: row.updated_by, updatedAt: row.updated_at }));
  }
  function loadDemo() {
    records = [];
    ROWS.forEach(function (r) {
      var m = META.machines[r[1]];
      records.push(makeRec(withFixed({ date: r[0], vtype: META.types[m.type], no: m.no, mine: META.mines[m.mine], shift: META.shifts[r[2]], lit: r[4], km: r[6], type: legacyType(META.flags[r[7]], r[5], r[4]), status: META.statuses[r[8]] })));
    });
  }
  function deriveMachines() {
    var out = {};
    (window.FIXED_VEHICLES || []).forEach(function (v) { out[v.no] = { no: v.no, vtype: v.vtype, mine: v.mine, litres: v.litres, km: v.km }; });
    records.forEach(function (r) { if (!out[r.no]) out[r.no] = { no: r.no, vtype: r.vtype, mine: r.mine, litres: r.lit, km: r.km }; });
    return Object.keys(out).sort().map(function (k) { return out[k]; });
  }
  function refreshLists() {
    machines = deriveMachines();
    mineList = uniq(records.map(function (r) { return r.mine; }).concat(machines.map(function (m) { return m.mine; }))).sort();
    var extra = uniq(records.map(function (r) { return r.vtype; })).filter(function (t) { return TYPE_ORDER.indexOf(t) === -1; }).sort();
    typeList = TYPE_ORDER.concat(extra);
    if (records.length) { DATA_MIN = Math.min.apply(null, records.map(function (r) { return r.day; })); DATA_MAX = Math.max.apply(null, records.map(function (r) { return r.day; })); }
    else { DATA_MIN = DATA_MAX = dayNum(todayLocal()); }
    var cur = $("a-no").value;
    $("a-no").innerHTML = machines.map(function (m) { return '<option value="' + esc(m.no) + '"' + (m.no === cur ? " selected" : "") + ">" + esc(m.no + " · " + m.vtype + " · " + m.mine) + "</option>"; }).join("");
  }
  var F = { preset: "30", from: "", to: "", mine: "", vtype: "", eq: "", shift: "", etype: "", status: "" };
  var UI = { sortKey: "date", sortDir: "desc", page: 1, search: "" };
  var charts = {}, view = {}, alerts = [], alertSeq = 1, liveCount = 0, timer = null, audio = null;

  function excType(r) { return r.type || null; }
  function severity(r) { return S.critTypes.indexOf(r._t || r.type) !== -1 ? "crit" : "warn"; }
  function alertable(r) { return !!r._t && S.alertTypes.indexOf(r._t) !== -1; }
  function keyOf(r) { return r.live ? "L" + r.id : r.date + "|" + r.no + "|" + r.shift; }
  function statusOf(r) { return MODE === "db" ? r.status : (overrides[keyOf(r)] || r.status); }

  /* ================= filters ================= */
  function fillSelect(id, allLabel, values, current) {
    var h = '<option value="">' + esc(allLabel) + "</option>";
    values.forEach(function (v) { h += '<option value="' + esc(v) + '"' + (v === current ? " selected" : "") + ">" + esc(v) + "</option>"; });
    $(id).innerHTML = h;
  }
  function eqOptions() {
    return machines.filter(function (m) { return (!F.vtype || m.vtype === F.vtype) && (!F.mine || m.mine === F.mine); }).map(function (m) { return m.no; });
  }
  function setPreset() {
    var to = DATA_MAX, from;
    if (F.preset === "7") from = to - 6; else if (F.preset === "30") from = to - 29; else if (F.preset === "90") from = to - 89;
    else if (F.preset === "all") from = DATA_MIN;
    else if (F.preset === "month") { var d = new Date(to * 86400000); from = Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 86400000); }
    else return;
    F.from = numToDate(Math.max(from, DATA_MIN)); F.to = numToDate(to);
    $("f-from").value = F.from; $("f-to").value = F.to;
  }
  function rebuildFilterOptions() {
    fillSelect("f-mine", "All", mineList, F.mine); fillSelect("f-vtype", "All", typeList, F.vtype);
    fillSelect("f-eq", "All", eqOptions(), F.eq); fillSelect("f-shift", "All", SHIFTS, F.shift); fillSelect("f-etype", "All", EXC_TYPES, F.etype); fillSelect("f-status", "All", STATUSES, F.status);
  }
  function refreshBounds() {
    $("f-from").min = $("f-to").min = numToDate(DATA_MIN); $("f-from").max = $("f-to").max = numToDate(DATA_MAX);
    if (F.preset !== "custom") setPreset();
    $("asof").textContent = "Data as on " + fmtDate(numToDate(DATA_MAX)) + " · " + (MODE === "db" ? records.length + " readings from the database." : "built-in sample data (demo mode).");
  }
  function initFilters() { rebuildFilterOptions(); refreshBounds(); }
  function readFilters() {
    F.preset = $("f-preset").value;
    if (F.preset !== "custom") setPreset();
    else {
      F.from = $("f-from").value || numToDate(DATA_MIN); F.to = $("f-to").value || numToDate(DATA_MAX);
      if (F.from > F.to) { var t = F.from; F.from = F.to; F.to = t; $("f-from").value = F.from; $("f-to").value = F.to; }
    }
    F.mine = $("f-mine").value; F.vtype = $("f-vtype").value;
    var want = $("f-eq").value; fillSelect("f-eq", "All", eqOptions(), want); F.eq = $("f-eq").value;
    F.shift = $("f-shift").value; F.etype = $("f-etype").value; F.status = $("f-status").value;
  }
  function pushFilters() {
    $("f-preset").value = F.preset; $("f-from").value = F.from; $("f-to").value = F.to;
    $("f-mine").value = F.mine; $("f-vtype").value = F.vtype;
    fillSelect("f-eq", "All", eqOptions(), F.eq); $("f-shift").value = F.shift; $("f-etype").value = F.etype; $("f-status").value = F.status;
  }

  /* ================= calculations ================= */
  function base(r, fr, to) {
    return r.day >= fr && r.day <= to && (!F.mine || r.mine === F.mine) &&
      (!F.vtype || r.vtype === F.vtype) && (!F.eq || r.no === F.eq) && (!F.shift || r.shift === F.shift);
  }
  function excOf(list) {
    return list.filter(function (r) { return r._t && (!F.etype || r._t === F.etype) && (!F.status || statusOf(r) === F.status); });
  }
  function compute() {
    records.forEach(function (r) { r._t = excType(r); });
    var from = dayNum(F.from), to = dayNum(F.to), span = to - from + 1;
    var pool = records.filter(function (r) { return base(r, from, to); });
    var prev = records.filter(function (r) { return base(r, from - span, from - 1); });
    view = { from: from, to: to, span: span, pool: pool, prev: prev, exc: excOf(pool), prevExc: excOf(prev) };
  }
  function delta(cur, prev) { return prev > 0 ? (cur - prev) / prev * 100 : null; }
  function effOf(list) { var l = sum(list, function (r) { return r.lit; }); return l ? sum(list, function (r) { return r.km; }) / l : 0; }

  /* ================= icons ================= */
  var ICON = {
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    pump: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M7 8h5"/></svg>',
    drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3z"/></svg>',
    rupee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12M6 9h12M6 4c6 0 8 2 8 5s-2 5-8 5l8 6"/></svg>'
  };

  /* ================= renderers ================= */
  function renderKpis() {
    var exc = view.exc, pool = view.pool;
    var cons = sum(pool, function (r) { return r.lit; }), pcons = sum(view.prev, function (r) { return r.lit; });
    var eff = effOf(pool), peff = effOf(view.prev);
    function dl(d, upBad, unit) {
      if (d === null) return '<span>No previous period to compare</span>';
      var up = d > 0.05, flat = Math.abs(d) < 0.05;
      var cls = flat ? "d-flat" : (up === upBad ? "d-bad" : "d-good");
      return '<b class="' + cls + '">' + (flat ? "▬" : up ? "▲" : "▼") + " " + num1(Math.abs(d)) + "%</b> <span>vs previous period</span>";
    }
    var k = [
      { ico: "red", svg: ICON.warn, t: "Total Diesel Exceptions", v: num(exc.length), d: dl(delta(exc.length, view.prevExc.length), true) },
      { ico: "", svg: ICON.pump, t: "Total Diesel Consumed", v: num(cons) + " <small>L</small>", d: dl(delta(cons, pcons), true) },
      { ico: "dark", svg: ICON.drop, t: "Average Fuel Efficiency", v: (eff ? eff.toFixed(2) : "–") + " <small>km/l</small>", d: dl(delta(eff, peff), false) },
      { ico: "green", svg: ICON.rupee, t: "Estimated Fuel Cost", v: rs(cons * S.price), d: dl(delta(cons, pcons), true) + " <span>· at " + rs(S.price) + "/L</span>" }
    ];
    $("ov-kpis").innerHTML = k.map(function (x) {
      return '<div class="ov-kpi"><div class="ico ' + x.ico + '" aria-hidden="true">' + x.svg + '</div><div><div class="k-t">' + esc(x.t) + '</div><div class="k-v">' + x.v + '</div><div class="k-d">' + x.d + "</div></div></div>";
    }).join("");
  }

  var labelPlugin = {
    id: "valueLabels",
    afterDatasetsDraw: function (chart) {
      var ctx = chart.ctx, horiz = chart.options.indexAxis === "y";
      chart.data.datasets.forEach(function (ds, di) {
        if (!ds.showLabels || !chart.isDatasetVisible(di)) return;
        var meta = chart.getDatasetMeta(di); if (meta.data.length > 14) return;
        meta.data.forEach(function (el, i) {
          var v = ds.data[i]; if (v === null || v === undefined || (ds.hideZero && !v)) return;
          var t = ds.labelFmt ? ds.labelFmt(v) : num(v);
          ctx.save(); ctx.fillStyle = "#0b1220"; ctx.font = "600 11.5px " + FONT;
          if (horiz) { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(t, el.x + 6, el.y); }
          else { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(t, el.x, el.y - 5); }
          ctx.restore();
        });
      });
    }
  };
  var donutPlugin = {
    id: "donutText",
    afterDatasetsDraw: function (chart) {
      var meta = chart.getDatasetMeta(0), ds = chart.data.datasets[0], total = sum(ds.data, function (x) { return x; }), ctx = chart.ctx;
      if (!total) return;
      meta.data.forEach(function (arc, i) {
        var v = ds.data[i], ang = arc.endAngle - arc.startAngle; if (!v || ang < 0.4) return;
        var mid = (arc.startAngle + arc.endAngle) / 2, r = (arc.innerRadius + arc.outerRadius) / 2;
        ctx.save(); ctx.fillStyle = "#fff"; ctx.font = "700 12px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(v + " (" + Math.round(v / total * 100) + "%)", arc.x + Math.cos(mid) * r, arc.y + Math.sin(mid) * r); ctx.restore();
      });
      var m0 = meta.data[0]; if (!m0) return;
      ctx.save(); ctx.textAlign = "center"; ctx.fillStyle = "#0b1220";
      ctx.font = "800 24px " + FONT; ctx.fillText(total, m0.x, m0.y - 4);
      ctx.font = "600 12px " + FONT; ctx.textBaseline = "top"; ctx.fillText("Exceptions", m0.x, m0.y + 8); ctx.restore();
    }
  };
  function toggleEmpty(id, show) { $(id).hidden = !show; }
  function upsert(key, cfg) {
    if (typeof Chart === "undefined") return;
    if (!charts[key]) { charts[key] = new Chart($("ch-" + key), cfg); return; }
    var c = charts[key]; c.data.labels = cfg.data.labels; c.data.datasets = cfg.data.datasets; c.update();
  }
  function hbarCfg(labels, data, color) {
    return { type: "bar", data: { labels: labels, datasets: [{ data: data, backgroundColor: color, borderRadius: 3, showLabels: true }] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 44 } }, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } }, plugins: [labelPlugin] };
  }

  function renderTrend() {
    var from = view.from, to = view.to, span = view.span, g = S.group === "auto" ? (span <= 31 ? "day" : span <= 120 ? "week" : "month") : S.group;
    function key(d) {
      if (g === "day") return d;
      if (g === "week") return d - ((d + 3) % 7);
      var dt = new Date(d * 86400000); return dt.getUTCFullYear() * 12 + dt.getUTCMonth();
    }
    var order = [], lit = {}, km = {}, label = {};
    for (var d = from; d <= to; d++) {
      var k = key(d);
      if (lit[k] === undefined) {
        lit[k] = 0; km[k] = 0; order.push(k);
        label[k] = g === "day" ? fmtShort(numToDate(d)) : g === "week" ? "Wk " + fmtShort(numToDate(k)) : MON[k % 12] + " " + Math.floor(k / 12);
      }
    }
    view.pool.forEach(function (r) { var k = key(r.day); lit[k] += r.lit; km[k] += r.km; });
    var labels = order.map(function (k) { return label[k]; });
    var cons = order.map(function (k) { return lit[k]; });
    var eff = order.map(function (k) { return lit[k] ? Math.round(km[k] / lit[k] * 100) / 100 : null; });
    toggleEmpty("empty-trend", !sum(cons, function (x) { return x; }));
    upsert("trend", { type: "bar", data: { labels: labels, datasets: [
      { type: "bar", label: "Diesel Consumed (L)", data: cons, backgroundColor: "#0b57c7", borderRadius: 3, yAxisID: "y", showLabels: true, order: 2 },
      { type: "line", label: "Fuel Efficiency (km/l)", data: eff, borderColor: "#0b1220", backgroundColor: "#0b1220", yAxisID: "y1", tension: 0, pointRadius: 3, showLabels: true, labelFmt: function (v) { return v.toFixed(2); }, order: 1 }
    ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, layout: { padding: { top: 18 } },
      plugins: { legend: { position: "top", labels: { boxWidth: 12 } } },
      scales: { x: { ticks: { maxRotation: 60, autoSkip: true, maxTicksLimit: 14 } }, y: { beginAtZero: true, position: "left", title: { display: true, text: "Diesel consumed (L)" } },
        y1: { position: "right", title: { display: true, text: "Fuel efficiency (km/l)" }, grid: { drawOnChartArea: false }, suggestedMin: 0 } } }, plugins: [labelPlugin] });
  }

  function renderType() {
    var exc = view.exc, counts = EXC_TYPES.map(function (t) { return exc.filter(function (r) { return r._t === t; }).length; }), total = sum(counts, function (x) { return x; });
    toggleEmpty("empty-type", !total);
    var defs = { "High Consumption": "(too much fuel used)", "Low Consumption": "(too little fuel recorded)", "Refueling Irregularity": "", "Mileage Mismatch": "(km does not match fuel)", "Other": "" };
    $("type-legend").innerHTML = EXC_TYPES.map(function (t, i) {
      return '<li><span class="sw" style="background:' + EXC_COLORS[t] + '"></span><span><b>' + esc(t) + "</b> " + esc(defs[t]) + "<small>" + counts[i] + " (" + (total ? Math.round(counts[i] / total * 100) : 0) + "%)</small></span></li>";
    }).join("");
    upsert("type", { type: "doughnut", data: { labels: EXC_TYPES, datasets: [{ data: counts, backgroundColor: EXC_TYPES.map(function (t) { return EXC_COLORS[t]; }), borderColor: "#fff", borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "52%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return c.label + ": " + c.parsed; } } } } }, plugins: [donutPlugin] });
  }

  function renderMine() {
    var rows = mineList.map(function (m) { return [m, view.exc.filter(function (r) { return r.mine === m; }).length]; }).sort(function (a, b) { return b[1] - a[1]; });
    toggleEmpty("empty-mine", !sum(rows, function (r) { return r[1]; }));
    upsert("mine", hbarCfg(rows.map(function (r) { return r[0]; }), rows.map(function (r) { return r[1]; }), "#0b57c7"));
  }

  function renderEff() {
    var rows = typeList.map(function (t) { var l = view.pool.filter(function (r) { return r.vtype === t; }); return [t, effOf(l), l.length]; }).filter(function (r) { return r[2]; }).sort(function (a, b) { return b[1] - a[1]; });
    toggleEmpty("empty-eff", !rows.length);
    upsert("eff", { type: "bar", data: { labels: rows.map(function (r) { return r[0]; }), datasets: [{ label: "km/l", data: rows.map(function (r) { return Math.round(r[1] * 100) / 100; }), backgroundColor: "#0b57c7", borderRadius: 3, showLabels: true, labelFmt: function (v) { return v.toFixed(2); } }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 18 } }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: "km/l" } }, x: { grid: { display: false } } } }, plugins: [labelPlugin] });
  }

  function renderEquip() {
    var rows = typeList.map(function (t) { return [t, sum(view.pool.filter(function (r) { return r.vtype === t; }), function (r) { return r.lit; })]; }).filter(function (r) { return r[1]; }).sort(function (a, b) { return b[1] - a[1]; });
    toggleEmpty("empty-equip", !rows.length);
    var cfg = hbarCfg(rows.map(function (r) { return r[0]; }), rows.map(function (r) { return r[1]; }), "#0b57c7");
    cfg.options.layout.padding.right = 60;
    upsert("equip", cfg);
  }

  function renderLocations() {
    var by = {}, ty = {}; view.exc.forEach(function (r) { by[r.no] = (by[r.no] || 0) + 1; ty[r.no] = r.vtype; });
    var rows = Object.keys(by).map(function (k) { return [k + " \u00B7 " + ty[k], by[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
    if (!rows.length) { $("top-locations").innerHTML = '<div class="empty-msg">No exceptions match the selected filters.</div>'; return; }
    var max = rows[0][1];
    $("top-locations").innerHTML = '<div class="loc-head"><span>Vehicle</span><span>No. of exceptions</span></div>' + rows.map(function (r) {
      return '<div class="loc"><span>' + esc(r[0]) + '</span><span class="bar"><i style="width:' + Math.round(r[1] / max * 100) + '%"></i></span><b>' + r[1] + "</b></div>";
    }).join("");
  }


  /* ---- exception details table ---- */
  var COLS = [
    { key: "date", label: "Date", val: function (r) { return r.day; }, html: function (r) { return fmtDate(r.date); } },
    { key: "mine", label: "Mine", val: function (r) { return r.mine; }, html: function (r) { return esc(r.mine); } },
    { key: "no", label: "Vehicle No.", val: function (r) { return r.no; }, html: function (r) { return esc(r.no); } },
    { key: "vtype", label: "Equipment", val: function (r) { return r.vtype; }, html: function (r) { return esc(r.vtype); } },
    { key: "shift", label: "Shift", val: function (r) { return r.shift; }, html: function (r) { return esc(r.shift); } },
    { key: "lit", label: "Fuel (L)", num: 1, val: function (r) { return r.lit; }, html: function (r) { return num(r.lit); } },
    { key: "type", label: "Exception Type", val: function (r) { return r._t || ""; }, html: function (r) { return esc(r._t || ""); } },
    { key: "status", label: "Status", val: function (r) { return STATUSES.indexOf(statusOf(r)); }, html: function (r) { var s = statusOf(r); return '<span class="status-pill st-' + s.replace(/ /g, "-") + '">' + esc(s) + "</span>"; } }
  ];
  function detailRows() {
    var q = UI.search.trim().toLowerCase();
    return view.exc.filter(function (r) { return !q || [r.date, fmtDate(r.date), r.mine, r.no, r.vtype, r._t, statusOf(r), r.shift].join(" ").toLowerCase().indexOf(q) !== -1; });
  }
  function renderDetails() {
    var rows = detailRows(), host = $("t-details");
    if (!rows.length) { host.innerHTML = '<div class="empty-msg">' + (UI.search ? "No exceptions match your search." : "No exceptions match the selected filters.") + "</div>"; return; }
    var col = COLS.filter(function (c) { return c.key === UI.sortKey; })[0], dir = UI.sortDir === "asc" ? 1 : -1;
    rows = rows.slice().sort(function (a, b) { var x = col.val(a), y = col.val(b); return x < y ? -dir : x > y ? dir : b.id - a.id; });
    var ps = +S.rows, pages = Math.max(1, Math.ceil(rows.length / ps)); if (UI.page > pages) UI.page = pages;
    var slice = rows.slice((UI.page - 1) * ps, UI.page * ps);
    var h = '<div class="tbl-sortbar"><label for="ss-d">Sort by</label><select id="ss-d" data-sortsel="1">';
    COLS.forEach(function (c) { ["desc", "asc"].forEach(function (d) { h += '<option value="' + c.key + "|" + d + '"' + (c.key === UI.sortKey && d === UI.sortDir ? " selected" : "") + ">" + esc(c.label) + (d === "asc" ? " (low to high)" : " (high to low)") + "</option>"; }); });
    h += '</select></div><div class="tbl-wrap"><table class="tbl"><thead><tr>';
    COLS.forEach(function (c) { var s = c.key === UI.sortKey ? (UI.sortDir === "asc" ? "ascending" : "descending") : "none"; h += '<th class="' + (c.num ? "num" : "") + '" aria-sort="' + s + '"><button type="button" data-sort="' + c.key + '">' + esc(c.label) + "</button></th>"; });
    h += "</tr></thead><tbody>";
    slice.forEach(function (r) {
      h += '<tr class="rowlink" tabindex="0" data-rec="' + r.id + '" title="Open record">';
      COLS.forEach(function (c) { h += '<td class="' + (c.num ? "num" : "") + '" data-label="' + esc(c.label) + '"><span class="cell">' + c.html(r) + "</span></td>"; });
      h += "</tr>";
    });
    h += "</tbody></table></div>";
    h += '<div class="pager"><span>Showing ' + ((UI.page - 1) * ps + 1) + "–" + Math.min(UI.page * ps, rows.length) + " of " + rows.length + '</span><span><button class="btn" type="button" data-page="prev"' + (UI.page <= 1 ? " disabled" : "") + '>Previous</button> Page ' + UI.page + " of " + pages + ' <button class="btn" type="button" data-page="next"' + (UI.page >= pages ? " disabled" : "") + ">Next</button></span></div>";
    host.innerHTML = h;
  }

  /* ---- insights + actions ---- */
  function renderInsights() {
    var exc = view.exc, items = [], cons = sum(view.pool, function (r) { return r.lit; });
    var dE = delta(exc.length, view.prevExc.length);
    if (dE !== null) items.push("Total diesel exceptions " + (dE > 0 ? "increased" : dE < 0 ? "decreased" : "are unchanged") + (dE ? " by " + num1(Math.abs(dE)) + "%" : "") + " compared with the previous period (" + exc.length + " vs " + view.prevExc.length + ").");
    else items.push(exc.length + " exception" + (exc.length === 1 ? "" : "s") + " in this period. There is no earlier period to compare.");
    if (exc.length) {
      var ct = EXC_TYPES.map(function (t) { return [t, exc.filter(function (r) { return r._t === t; }).length]; }).sort(function (a, b) { return b[1] - a[1]; });
      items.push(ct[0][0] + " cases (" + Math.round(ct[0][1] / exc.length * 100) + "%) are the major concern.");
      var cm = mineList.map(function (m) { return [m, exc.filter(function (r) { return r.mine === m; }).length]; }).sort(function (a, b) { return b[1] - a[1]; }).filter(function (x) { return x[1]; });
      if (cm.length >= 2) items.push(cm[0][0] + " and " + cm[1][0] + " have the highest number of exceptions (" + cm[0][1] + " and " + cm[1][1] + ").");
      else if (cm.length) items.push(cm[0][0] + " has all the exceptions (" + cm[0][1] + ").");
      var flagged = sum(exc, function (r) { return r.lit; });
      if (cons) items.push("Fuel on flagged readings: " + num(flagged) + " L (" + Math.round(flagged / cons * 100) + "% of total), about " + rs(flagged * S.price) + ".");
    }
    var eff = effOf(view.pool), dEf = delta(eff, effOf(view.prev));
    if (eff) items.push("Overall fuel efficiency " + (dEf === null ? "is " : dEf >= 0 ? "improved to " : "declined to ") + eff.toFixed(2) + " km/l" + (dEf === null ? "." : " (" + (dEf >= 0 ? "▲ " : "▼ ") + num1(Math.abs(dEf)) + "%)."));
    var bt = typeList.map(function (t) { return [t, sum(view.pool.filter(function (r) { return r.vtype === t; }), function (r) { return r.lit; })]; }).sort(function (a, b) { return b[1] - a[1]; });
    if (cons && bt[0][1]) items.push(bt[0][0] + " are the highest fuel consumers (" + Math.round(bt[0][1] / cons * 100) + "% of total).");
    $("insights").innerHTML = items.map(function (t, i) { return '<li><span class="ic" aria-hidden="true">' + (i + 1) + "</span><span>" + esc(t) + "</span></li>"; }).join("");
  }

  function renderActions() {
    var exc = view.exc, g = { "Fuel Management Team": [], "Fleet & Workshop": [], "Management": [] };
    function top(list, keyf, n) {
      var by = {}; list.forEach(function (r) { var k = keyf(r); by[k] = (by[k] || 0) + 1; });
      return Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).slice(0, n);
    }
    var high = exc.filter(function (r) { return r._t === "High Consumption"; });
    if (high.length) g["Fuel Management Team"].push("Investigate high consumption vehicles: " + joinList(top(high, function (r) { return r.no; }, 3)) + ".");
    if (exc.length) g["Fuel Management Team"].push("Check refuelling discipline at the mines with most exceptions: " + joinList(top(exc, function (r) { return r.mine; }, 2)) + ".");
    var mm = exc.filter(function (r) { return r._t === "Mileage Mismatch"; });
    if (mm.length) g["Fuel Management Team"].push("Verify odometer / GPS data for mileage mismatch cases: " + joinList(top(mm, function (r) { return r.no; }, 3)) + ".");
    var open = exc.filter(function (r) { return statusOf(r) === "Open"; });
    if (open.length) g["Fuel Management Team"].push(open.length + " exception" + (open.length === 1 ? " is" : "s are") + " still Open. Assign an owner.");
    if (high.length) g["Fleet & Workshop"].push("Ensure timely maintenance of high fuel consuming equipment: " + joinList(top(high, function (r) { return r.vtype; }, 2)) + ".");
    var lowRef = exc.filter(function (r) { return r._t === "Low Consumption" || r._t === "Refueling Irregularity"; });
    if (lowRef.length) g["Fleet & Workshop"].push("Calibrate fuel sensors and meter systems (" + lowRef.length + " low-consumption / refuelling cases).");
    if (exc.length) g["Management"].push("Review fixed fuel norms and set corrective targets for the vehicle types with most exceptions: " + joinList(top(exc, function (r) { return r.vtype; }, 2)) + ".");
    var crit = exc.filter(function (r) { return severity(r) === "crit"; });
    if (crit.length) g["Management"].push(crit.length + " critical case" + (crit.length === 1 ? "" : "s") + " (" + joinList(S.critTypes) + "). Review these first.");
    var h = "";
    Object.keys(g).forEach(function (k) { if (g[k].length) h += '<div class="act-group"><h3>' + esc(k) + "</h3><ul>" + g[k].map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>"; });
    $("actions").innerHTML = h || '<div class="empty-msg">No exceptions, so no actions are needed.</div>';
  }

  function applyWidgets() {
    document.querySelectorAll("[data-widget]").forEach(function (el) { el.hidden = !S.widgets[el.getAttribute("data-widget")]; });
  }

  function renderAll() {
    try {
      $("error-area").innerHTML = ""; applyWidgets(); compute();
      renderKpis(); renderTrend(); renderType(); renderMine(); renderEff(); renderEquip(); renderLocations();
      renderDetails(); renderInsights(); renderActions(); updateBadge();
    } catch (e) { showError("drawing the dashboard", e); if (window.console) console.error(e); }
  }

  /* ================= record dialog ================= */
  var recOpener = null;
  function openRecord(id) {
    var r = records[id]; if (!r) return;
    var t = r._t || excType(r), eff = r.lit ? r.km / r.lit : 0;
    $("rec-title").textContent = r.no + " – " + r.vtype + " · " + fmtDate(r.date);
    var rows = [["Mine", r.mine], ["Shift", r.shift], ["Fixed fuel", num(r.lit) + " L"], ["Fixed distance", num(r.km) + " km"], ["Fixed efficiency", eff.toFixed(2) + " km/l"],
      ["Exception type", t || "None (normal reading)"], ["Fuel cost of this reading", rs(r.lit * S.price)], ["Record", MODE === "db" ? "Saved in the database" : (r.live ? "Simulated live reading" : "Sample record")]];
    var h = '<dl class="rec-grid">' + rows.map(function (x) { return "<div><dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd></div>"; }).join("") + "</dl>";
    var hist = "";
    if (r.enteredBy) hist += "Entered by " + esc(r.enteredBy) + ". ";
    if (r.updatedBy) hist += "Status last changed by " + esc(r.updatedBy) + (r.updatedAt ? " on " + esc(new Date(r.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })) : "") + ".";
    if (hist) h += '<p class="note" style="margin:0 0 10px">' + hist + "</p>";
    var canSt = USER.can("status");
    if (!canSt) h += '<p class="perm-note">Your role (' + esc(USER.get().role) + ') cannot change the status. Switch role with your name at the top right.</p>';
    h += '<div class="fld"><label for="rec-status">Status</label><select id="rec-status"' + (canSt ? "" : " disabled") + '>' + STATUSES.map(function (s) { return '<option' + (s === statusOf(r) ? " selected" : "") + ">" + s + "</option>"; }).join("") + '</select></div>';
    if (canSt) h += '<button class="btn primary" id="rec-save" type="button" data-id="' + id + '">Save status</button>';
    h += '<p class="note">' + (MODE === "db" ? "Saved in the database for everyone." : "Demo mode: saved in this browser only.") + "</p>";
    $("rec-body").innerHTML = h;
    if (!$("rec-modal").classList.contains("open")) recOpener = document.activeElement;
    $("rec-modal").classList.add("open"); $("rec-close").focus();
  }
  function closeRecord() { $("rec-modal").classList.remove("open"); if (recOpener && document.contains(recOpener)) recOpener.focus(); }

  /* ================= drawers ================= */
  var drawerOpener = null;
  function openDrawer(id) {
    closeDrawers(true); drawerOpener = document.activeElement;
    $("backdrop").hidden = false; $(id).hidden = false;
    if (id === "drawer-alerts") renderAlerts();
    var b = $(id).querySelector("button"); if (b) b.focus();
  }
  function closeDrawers(keepFocus) {
    ["drawer-alerts", "drawer-custom", "drawer-add"].forEach(function (i) { $(i).hidden = true; });
    $("backdrop").hidden = true;
    if (!keepFocus && drawerOpener && document.contains(drawerOpener)) drawerOpener.focus();
  }

  /* ================= alerts ================= */
  function alertText(r) {
    return r.no + " (" + r.vtype + ") at " + r.mine + ": " + r._t + " on " + r.shift + ", " + fmtShort(r.date) + ".";
  }

  function addAlert(r, fresh) {
    var a = { id: alertSeq++, rec: r.id, sev: severity(r), text: alertText(r), when: fresh ? new Date() : null, label: fresh ? "" : "Recorded " + fmtShort(r.date), acked: false, ackBy: "", by: r.enteredBy || "" };
    alerts.unshift(a); if (alerts.length > 60) alerts.pop();
    return a;
  }
  function seedAlerts() {
    records.forEach(function (r) { r._t = excType(r); });
    var recent = records.filter(function (r) { return alertable(r) && r.day >= DATA_MAX - 2 && statusOf(r) === "Open"; }).slice(-4);
    recent.forEach(function (r) { addAlert(r, false); });
  }
  function unacked() { return alerts.filter(function (a) { return !a.acked; }).length; }
  function updateBadge() {
    var n = unacked(), c = $("alert-count"); c.textContent = n; c.className = "count" + (n ? " on" : "");
    document.title = (n ? "(" + n + ") " : "") + "Fuel Dashboard";
  }
  function renderAlerts() {
    var host = $("alert-list");
    if (!alerts.length) { host.innerHTML = '<div class="empty-msg">No alerts yet. Waiting for readings...</div>'; return; }
    host.innerHTML = alerts.map(function (a) {
      var when = a.when ? a.when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : a.label;
      return '<div class="al ' + a.sev + (a.acked ? " acked" : "") + '"><div class="al-top"><span class="badge ' + (a.sev === "crit" ? "b-solid" : "b-warn") + '">' + (a.sev === "crit" ? "■ Critical" : "▲ Warning") + "</span><span class=\"al-meta\">" + esc(when) + (a.acked ? " · acknowledged" + (a.ackBy ? " by " + esc(a.ackBy) : "") : "") + "</span></div><div>" + esc(a.text) + (a.by ? '<div class="al-meta">Entered by ' + esc(a.by) + '</div>' : '') + '</div><div class="al-btns"><button class="btn" type="button" data-alrec="' + a.rec + '">View record</button>' + (a.acked ? "" : '<button class="btn" type="button" data-alack="' + a.id + '">Acknowledge</button>') + "</div></div>";
    }).join("");
  }
  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), g = audio.createGain(); o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.08;
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.25);
    } catch (e) { /* no sound: fine */ }
  }
  function toast(a) {
    if (!S.toasts || ["drawer-alerts", "drawer-custom", "drawer-add"].some(function (i) { return !$(i).hidden; })) return;   // a side panel is open: the pop-up would cover its buttons; the alert is still counted and listed
    var box = $("toasts"), el = document.createElement("div");
    el.className = "toast " + a.sev; el.setAttribute("role", a.sev === "crit" ? "alert" : "status");
    el.innerHTML = "<b>" + (a.sev === "crit" ? "■ Critical alert" : "▲ Fuel alert") + "</b>" + esc(a.text) + (a.by ? '<div class="al-meta">Entered by ' + esc(a.by) + "</div>" : "") + '<div class="t-actions"><button class="btn" type="button" data-toast-view>View alerts</button><button class="btn" type="button" data-toast-x>Dismiss</button></div>';
    box.insertBefore(el, box.firstChild);
    while (box.children.length > 3) box.removeChild(box.lastChild);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 9000);
  }

  /* ---- new readings: real (database) or simulated (demo mode) ---- */
  function hintFor(msg) {
    if (/exception_type|null value in column/i.test(msg)) return " The database needs one more small update. Ask the Data Keeper to run database/04-fixed-readings.sql in the Supabase SQL Editor.";
    if (/relation .* does not exist|schema cache|Could not find the table/i.test(msg)) return " The table may not exist yet. Ask the Data Keeper to run database/02-fuel-readings.sql in the Supabase SQL Editor.";
    if (/permission denied|row-level security/i.test(msg)) return " The database is refusing access. Ask the Data Keeper to check that 02-fuel-readings.sql ran fully (policies and grant).";
    if (/Failed to fetch|NetworkError|network|timed out/i.test(msg)) return " This looks like an internet problem. Please try again.";
    return "";
  }
  function renderPill() {
    var pill = $("live-pill"), n = liveCount ? " · " + liveCount + " new" : "";
    var map = { connected: ["live-pill on", "Live: connected" + n], polling: ["live-pill warn", "Live: checking every " + (S.interval >= 60 ? S.interval / 60 + " min" : S.interval + " s") + n],
      paused: ["live-pill", "Live: paused"], demo: ["live-pill on", "Demo: simulated feed" + n] };
    var m = map[S.live ? connState : "paused"];
    pill.className = m[0]; $("live-text").textContent = m[1];
  }
  function flashPill() { var pill = $("live-pill"); pill.classList.add("flash"); setTimeout(function () { pill.classList.remove("flash"); }, 1200); }

  // new records (already pushed into `records`) have arrived: refresh lists, raise alerts, redraw
  function afterNew(list) {
    refreshLists(); rebuildFilterOptions(); refreshBounds();
    list.forEach(function (r) {
      liveCount++; r._t = excType(r);
      if (alertable(r)) { var a = addAlert(r, true); toast(a); if (a.sev === "crit" && S.sound) beep(); }
    });
    if (!$("drawer-alerts").hidden) renderAlerts();
    flashPill(); renderPill(); renderAll();
  }
  function addFromDb(row) {
    if (!row || !row.id || dbIds[row.id]) return null;
    dbIds[row.id] = 1;
    var r = recFromDb(row); records.push(r);
    if (String(row.created_at || "") > lastCreated) lastCreated = String(row.created_at);
    return r;
  }
  function onUpdate(row) {
    var r = records.filter(function (x) { return x.dbId === row.id; })[0]; if (!r) return;
    r.status = row.status; r.updatedBy = row.updated_by || r.updatedBy; r.updatedAt = row.updated_at || r.updatedAt;
    if (row.exception_type !== undefined && row.exception_type !== null) r.type = row.exception_type;
    renderAll();
  }
  function poll() {
    if (MODE !== "db" || !db) return;
    var q = db.from("fuel_readings").select("*").order("created_at", { ascending: true }).limit(200);
    if (lastCreated) q = q.gt("created_at", lastCreated);
    q.then(function (res) {
      if (res.error) { connState = "polling"; renderPill(); return; }
      var fresh = []; (res.data || []).forEach(function (row) { var r = addFromDb(row); if (r) fresh.push(r); });
      if (fresh.length) afterNew(fresh);
    }, function () { connState = "polling"; renderPill(); });
  }
  function stopLive() {
    if (timer) { clearInterval(timer); timer = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (channel && db) { try { db.removeChannel(channel); } catch (e) { /* ignore */ } channel = null; }
  }
  function startLive() {
    stopLive();
    if (!S.live) { renderPill(); return; }
    if (MODE === "db") {
      connState = "polling"; renderPill();
      try {
        channel = db.channel("fuel-readings-live")
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "fuel_readings" }, function (p) { var r = addFromDb(p.new); if (r) afterNew([r]); })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "fuel_readings" }, function (p) { onUpdate(p.new); })
          .subscribe(function (status) { connState = status === "SUBSCRIBED" ? "connected" : "polling"; renderPill(); });
      } catch (e) { connState = "polling"; renderPill(); }
      pollTimer = setInterval(poll, S.interval * 1000);   // back-up: also works if live updates are switched off in Supabase
    } else {
      connState = "demo"; renderPill();
      timer = setInterval(function () { tick(false); }, S.interval * 1000);
    }
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function makeDemoReading(forceExc) {
    var m = machines[Math.floor(Math.random() * machines.length)], h = new Date().getHours();
    var shift = SHIFTS[h >= 6 && h < 14 ? 0 : h >= 14 && h < 22 ? 1 : 2], type = "";
    if (forceExc || Math.random() < 0.3) {
      var p = Math.random();
      type = p < 0.6 ? EXC_TYPES[0] : p < 0.75 ? EXC_TYPES[1] : p < 0.9 ? EXC_TYPES[2] : EXC_TYPES[3];
    }
    return { date: MODE === "db" ? todayLocal() : numToDate(DATA_MAX), shift: shift, no: m.no, type: type, system: true };
  }
  function tick(forceExc) { saveReading(makeDemoReading(forceExc), function () {}); }

  function isAuditError(msg) { return /entered_by|updated_by|updated_at/i.test(String(msg || "")); }
  function noteType() {
    var el = $("source-banner"); if (!el || el.querySelector(".type-note")) return;
    var d = document.createElement("div"); d.className = "banner demo type-note";
    d.innerHTML = "<strong>One more database update is needed.</strong> Ask the Data Keeper to run database/04-fixed-readings.sql. Until then the dashboard works out exception types from the old numbers, and new readings cannot be saved.";
    el.appendChild(d);
  }
  function noteAudit() {
    var el = $("source-banner"); if (!el || el.querySelector(".audit-note")) return;
    var d = document.createElement("div"); d.className = "banner demo audit-note";
    d.innerHTML = "<strong>Names are not being saved yet.</strong> Ask the Data Keeper to run database/03-audit-columns.sql. Until then readings and status changes still save, but without who did it.";
    el.appendChild(d);
  }
  // save one reading: to the database (real) or to this browser only (demo)
  function saveReading(v, done) {
    if (!USER.can("add") && !v.system) { done(new Error("Your role cannot add readings.")); return; }
    var m = machines.filter(function (x) { return x.no === v.no; })[0];
    if (!m) { done(new Error("Unknown vehicle " + v.no)); return; }
    var type = v.type || "", status = type ? "Open" : "Closed", by = v.system ? "Demo feed" : who();
    if (MODE === "db") {
      if (hasType === false) { var e0 = new Error("The database has no exception_type column yet."); showError("saving the reading", e0, hintFor(e0.message)); done(e0); return; }
      var payload = { reading_date: v.date, mine: m.mine, vehicle_type: m.vtype, vehicle_no: m.no, shift: v.shift, expected_litres: m.litres, km: m.km, exception_type: type, status: status };
      var send = function (withAudit) {
        var p = Object.assign({}, payload); if (withAudit) p.entered_by = by;
        return db.from("fuel_readings").insert(p).select();
      };
      var ok = function (res) {
        var r = addFromDb(res.data && res.data[0]); if (r) { if (!r.enteredBy && hasAudit !== false) r.enteredBy = by; afterNew([r]); }
        done(null, r);
      };
      send(hasAudit !== false).then(function (res) {
        if (res.error && hasAudit !== false && isAuditError(res.error.message)) {
          hasAudit = false; noteAudit();
          return send(false).then(function (r2) { if (r2.error) { showError("saving the reading", r2.error, hintFor(r2.error.message || "")); done(r2.error); } else ok(r2); });
        }
        if (res.error) { showError("saving the reading", res.error, hintFor(res.error.message || "")); done(res.error); return; }
        if (hasAudit === null) hasAudit = true;
        ok(res);
      }, function (e) { showError("saving the reading", e, hintFor(String(e && e.message))); done(e); });
    } else {
      var r = makeRec({ date: v.date, vtype: m.vtype, no: m.no, mine: m.mine, shift: v.shift, lit: m.litres, km: m.km, type: type, status: status, live: true, enteredBy: by });
      records.push(r); afterNew([r]); done(null, r);
    }
  }
  function setStatus(r, s) {
    if (!USER.can("status")) return;
    var stamp = new Date().toISOString();
    if (MODE === "db" && r.dbId) {
      var send = function (withAudit) {
        var p = { status: s }; if (withAudit) { p.updated_by = who(); p.updated_at = stamp; }
        return db.from("fuel_readings").update(p).eq("id", r.dbId).select();
      };
      var ok = function (audited) { r.status = s; if (audited) { r.updatedBy = who(); r.updatedAt = stamp; } closeRecord(); renderAll(); };
      send(hasAudit !== false).then(function (res) {
        if (res.error && hasAudit !== false && isAuditError(res.error.message)) {
          hasAudit = false; noteAudit();
          return send(false).then(function (r2) { if (r2.error) showError("saving the status", r2.error, hintFor(r2.error.message || "")); else ok(false); });
        }
        if (res.error) { showError("saving the status", res.error, hintFor(res.error.message || "")); return; }
        if (hasAudit === null) hasAudit = true;
        ok(hasAudit !== false);
      }, function (e) { showError("saving the status", e, hintFor(String(e && e.message))); });
    } else { overrides[keyOf(r)] = s; r.updatedBy = who(); r.updatedAt = stamp; save("mclOverviewStatus", overrides); closeRecord(); renderAll(); }
  }

  /* ================= add-reading form ================= */
  function machineOf(no) { return machines.filter(function (x) { return x.no === no; })[0]; }
  function showFixed() {
    var m = machineOf($("a-no").value), box = $("a-fixed");
    if (!m) { box.innerHTML = ""; return; }
    box.innerHTML = [["Type", m.vtype], ["Mine", m.mine], ["Fixed fuel", num(m.litres) + " L / shift"], ["Fixed distance", num(m.km) + " km / shift"]].map(function (x) { return "<div><dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd></div>"; }).join("");
  }
  function previewAdd() {
    var t = $("a-type").value, p = $("a-preview"); showFixed();
    if (!machineOf($("a-no").value)) { p.className = "preview"; p.textContent = "Choose a vehicle."; return; }
    if (!t) { p.className = "preview good"; p.textContent = "\u2714 Normal reading. No alert."; return; }
    var r = { _t: t, type: t }, a = S.alertTypes.indexOf(t) !== -1;
    p.className = "preview bad"; p.textContent = "\u25B2 " + t + (a ? ": raises a " + (severity(r) === "crit" ? "Critical" : "Warning") + " alert for everyone." : ": saved, but no alert (switched off in Customize).");
  }
  function openAdd() {
    if (!USER.can("add")) return;
    var h = new Date().getHours();
    $("a-date").value = todayLocal(); $("a-shift").value = SHIFTS[h >= 6 && h < 14 ? 0 : h >= 14 && h < 22 ? 1 : 2];
    $("a-msg").innerHTML = ""; previewAdd();
    $("add-note").textContent = MODE === "db" ? "Litres and distance are fixed for each vehicle. Choose the vehicle, date, shift and exception type. It is saved in the database and every open dashboard gets the alert. Use made-up values only." : "Demo mode: the database is not connected, so this reading is kept in this browser only.";
    openDrawer("drawer-add");
  }
  function bindAdd() {
    $("a-no").addEventListener("change", previewAdd); $("a-type").addEventListener("change", previewAdd);
    $("add-form").addEventListener("submit", function (ev) {
      ev.preventDefault(); $("error-area").innerHTML = ""; $("a-msg").innerHTML = "";
      if (!USER.can("add")) { $("a-msg").innerHTML = '<p class="msg bad">Your role cannot add readings.</p>'; return; }
      var v = { date: $("a-date").value, shift: $("a-shift").value, no: $("a-no").value, type: $("a-type").value };
      var miss = []; if (!v.date) miss.push("Date"); if (!v.no) miss.push("Vehicle");
      if (miss.length) { $("a-msg").innerHTML = '<p class="msg bad">Please fill in: ' + esc(miss.join(", ")) + ".</p>"; return; }
      var btn = $("a-save"); btn.disabled = true; btn.textContent = "Saving...";
      saveReading(v, function (err) {
        btn.disabled = false; btn.textContent = "Save reading";
        if (err) { $("a-msg").innerHTML = '<p class="msg bad">The reading was NOT saved. See the red message at the top of the page.</p>'; return; }
        $("a-msg").innerHTML = '<p class="msg">Saved: ' + esc(v.no) + ", " + esc(v.shift) + ", " + esc(fmtDate(v.date)) + (v.type ? ", " + esc(v.type) : ", normal") + ".</p>";
        $("a-type").value = ""; previewAdd();
      });
    });
  }

  /* ================= customize panel ================= */
  function persist() { save("mclOverviewSettings", S); }
  function initCustomize() {
    $("c-price").value = S.price;
    $("c-alertTypes").innerHTML = EXC_TYPES.map(function (t) { return '<label class="check"><input type="checkbox" data-at="' + esc(t) + '"' + (S.alertTypes.indexOf(t) !== -1 ? " checked" : "") + "> " + esc(t) + "</label>"; }).join("");
    $("c-critTypes").innerHTML = EXC_TYPES.map(function (t) { return '<label class="check"><input type="checkbox" data-ct="' + esc(t) + '"' + (S.critTypes.indexOf(t) !== -1 ? " checked" : "") + "> " + esc(t) + "</label>"; }).join("");
    $("c-live").checked = S.live; $("c-interval").value = String(S.interval); $("c-toasts").checked = S.toasts; $("c-sound").checked = S.sound;
    $("c-group").value = S.group; $("c-rows").value = String(S.rows);
    $("c-widgets").innerHTML = WIDGETS.map(function (w) { return '<label class="check"><input type="checkbox" data-w="' + w[0] + '"' + (S.widgets[w[0]] ? " checked" : "") + "> " + esc(w[1]) + "</label>"; }).join("");
    renderViews();
  }
  function renderViews() {
    $("v-list").innerHTML = views.length ? views.map(function (v, i) { return "<li><span>" + esc(v.name) + '</span><span><button class="btn" type="button" data-vapply="' + i + '">Apply</button> <button class="btn" type="button" data-vdel="' + i + '">Delete</button></span></li>'; }).join("") : '<li class="note">No saved views yet.</li>';
  }
  function bindCustomize() {
    function numField(id, key) { $(id).addEventListener("input", function () { if (!USER.can("rules")) return; var v = parseFloat(this.value); if (!(v > 0)) return; S[key] = v; persist(); renderAll(); }); }
    numField("c-price", "price");
    function listField(boxId, attr, key) {
      $(boxId).addEventListener("change", function (e) {
        var t = e.target.getAttribute(attr); if (t === null || !USER.can("rules")) return;
        var l = S[key].filter(function (x) { return x !== t; }); if (e.target.checked) l.push(t);
        S[key] = EXC_TYPES.filter(function (x) { return l.indexOf(x) !== -1; }); persist(); previewAdd(); renderAll();
      });
    }
    listField("c-alertTypes", "data-at", "alertTypes"); listField("c-critTypes", "data-ct", "critTypes");
    $("c-live").addEventListener("change", function () { S.live = this.checked; persist(); startLive(); });
    $("c-interval").addEventListener("change", function () { S.interval = +this.value; persist(); startLive(); });
    $("c-toasts").addEventListener("change", function () { S.toasts = this.checked; persist(); });
    $("c-sound").addEventListener("change", function () { S.sound = this.checked; persist(); if (S.sound) beep(); });
    $("c-group").addEventListener("change", function () { S.group = this.value; persist(); renderAll(); });
    $("c-rows").addEventListener("change", function () { S.rows = +this.value; UI.page = 1; persist(); renderAll(); });
    $("c-widgets").addEventListener("change", function (e) { var w = e.target.getAttribute("data-w"); if (!w) return; S.widgets[w] = e.target.checked; persist(); renderAll(); });
    $("v-save").addEventListener("click", function () {
      var name = $("v-name").value.trim(); if (!name) { $("v-name").focus(); return; }
      views = views.filter(function (v) { return v.name !== name; });
      views.push({ name: name, F: JSON.parse(JSON.stringify(F)) }); save("mclOverviewViews", views); $("v-name").value = ""; renderViews();
    });
    $("v-list").addEventListener("click", function (e) {
      var a = e.target.getAttribute("data-vapply"), d = e.target.getAttribute("data-vdel");
      if (a !== null) { F = JSON.parse(JSON.stringify(views[+a].F)); pushFilters(); if (F.preset !== "custom") setPreset(); UI.page = 1; closeDrawers(); renderAll(); }
      if (d !== null) { views.splice(+d, 1); save("mclOverviewViews", views); renderViews(); }
    });
    $("c-reset").addEventListener("click", function () {
      S = JSON.parse(JSON.stringify(DEFAULTS)); persist(); initCustomize(); startLive(); renderAll();
    });
  }

  /* ================= CSV ================= */
  function downloadCsv() {
    try {
      var head = ["Date", "Mine", "Vehicle No", "Equipment", "Shift", "Fuel (L)", "Exception Type", "Status"];
      var lines = [head.join(",")];
      detailRows().forEach(function (r) { lines.push([r.date, r.mine, r.no, r.vtype, r.shift, r.lit, r._t, statusOf(r)].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(",")); });
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "fuel-exceptions-sample.csv";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { showError("downloading the CSV file", e); }
  }

  /* ================= events ================= */
  function bind() {
    ["f-preset", "f-from", "f-to", "f-mine", "f-vtype", "f-eq", "f-shift", "f-etype", "f-status"].forEach(function (id) {
      $(id).addEventListener("change", function () { if (id === "f-from" || id === "f-to") $("f-preset").value = "custom"; readFilters(); UI.page = 1; renderAll(); });
    });
    $("f-reset").addEventListener("click", function () {
      F = { preset: "30", from: "", to: "", mine: "", vtype: "", eq: "", shift: "", etype: "", status: "" }; UI.search = ""; $("d-search").value = ""; UI.page = 1;
      setPreset(); pushFilters(); renderAll();
    });
    $("filter-toggle").addEventListener("click", function () { var o = $("sidebar").classList.toggle("open"); this.setAttribute("aria-expanded", o ? "true" : "false"); });
    $("d-search").addEventListener("input", function () { UI.search = this.value; UI.page = 1; renderDetails(); });
    $("d-csv").addEventListener("click", downloadCsv);
    $("btn-add").addEventListener("click", openAdd);
    $("btn-alerts").addEventListener("click", function () { openDrawer("drawer-alerts"); });
    $("btn-custom").addEventListener("click", function () { openDrawer("drawer-custom"); });
    $("backdrop").addEventListener("click", function () { closeDrawers(); });
    document.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { closeDrawers(); }); });
    $("rec-close").addEventListener("click", closeRecord);
    $("rec-modal").addEventListener("click", function (e) { if (e.target === this) closeRecord(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeRecord(); closeDrawers(); } if ((e.key === "Enter") && e.target.getAttribute && e.target.getAttribute("data-rec")) openRecord(+e.target.getAttribute("data-rec")); });
    $("al-ack").addEventListener("click", function () { alerts.forEach(function (a) { if (!a.acked) { a.acked = true; a.ackBy = who(); } }); renderAlerts(); updateBadge(); });
    $("al-clear").addEventListener("click", function () { alerts = []; renderAlerts(); updateBadge(); });
    $("al-test").addEventListener("click", function () {
      if (!USER.can("test")) return;
      if (MODE === "db" && !window.confirm("Save one made-up exception reading to the database?\n\nEvery open dashboard will get the alert.")) return;
      tick(true);
    });
    $("alert-list").addEventListener("click", function (e) {
      var ack = e.target.getAttribute("data-alack"), rec = e.target.getAttribute("data-alrec");
      if (ack) { alerts.forEach(function (a) { if (a.id === +ack) { a.acked = true; a.ackBy = who(); } }); renderAlerts(); updateBadge(); }
      if (rec) { closeDrawers(true); openRecord(+rec); }
    });
    $("toasts").addEventListener("click", function (e) {
      if (e.target.hasAttribute("data-toast-x")) { var t = e.target.closest(".toast"); if (t) t.remove(); }
      if (e.target.hasAttribute("data-toast-view")) { $("toasts").innerHTML = ""; openDrawer("drawer-alerts"); }
    });
    $("rec-body").addEventListener("click", function (e) {
      if (e.target.id !== "rec-save") return;
      setStatus(records[+e.target.getAttribute("data-id")], $("rec-status").value);
    });
    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-sort],[data-page],tr[data-rec]") : null; if (!t) return;
      if (t.hasAttribute("data-sort")) { var k = t.getAttribute("data-sort"); if (UI.sortKey === k) UI.sortDir = UI.sortDir === "asc" ? "desc" : "asc"; else { UI.sortKey = k; UI.sortDir = "desc"; } renderDetails(); }
      else if (t.hasAttribute("data-page")) { UI.page += t.getAttribute("data-page") === "next" ? 1 : -1; renderDetails(); }
      else openRecord(+t.getAttribute("data-rec"));
    });
    document.addEventListener("change", function (e) { if (e.target.getAttribute && e.target.getAttribute("data-sortsel")) { var v = e.target.value.split("|"); UI.sortKey = v[0]; UI.sortDir = v[1]; renderDetails(); } });
  }

  /* ================= roles (no password; guides the screen only) ================= */
  function applyRole() {
    var role = USER.get().role, add = USER.can("add"), test = USER.can("test"), rules = USER.can("rules");
    $("btn-add").disabled = !add; $("btn-add").title = add ? "" : "Your role (" + role + ") cannot add readings. Switch role with your name at the top right.";
    var ap = $("add-perm"); ap.hidden = add; ap.textContent = "Your role (" + role + ") cannot add readings.";
    $("al-test").disabled = !test; var tn = $("test-note"); tn.hidden = test; tn.textContent = "Test readings can be sent by the Fuel Manager only. Your role: " + role + ".";
    $("c-price").disabled = !rules;
    document.querySelectorAll("#c-alertTypes input, #c-critTypes input").forEach(function (el) { el.disabled = !rules; });
    var rn = $("rules-note"); rn.hidden = rules; rn.textContent = "Your role (" + role + ") cannot change alert rules or the price. Fuel Manager and E&M Manager can.";
    if ($("rec-modal").classList.contains("open")) closeRecord();
  }
  USER.onChange(applyRole);

  /* ================= start ================= */
  function setBanner(html, cls) { $("source-banner").innerHTML = html ? '<div class="banner ' + cls + '">' + html + "</div>" : ""; }
  function setModeTexts() {
    $("al-note").textContent = MODE === "db"
      ? "Real alerts: any new reading saved in the database, from this or any other device, that breaks your alert rules appears here at once. Rules come from Customize."
      : "Demo mode: the database is not connected. Readings are simulated in this browser.";
    $("al-test").textContent = MODE === "db" ? "Send test reading" : "Send test alert";
    $("al-test").title = MODE === "db" ? "Saves one made-up exception reading to the database, so you can watch the alert arrive" : "";
  }
  function finish(bannerHtml, bannerCls) {
    refreshLists(); initFilters(); seedAlerts(); setModeTexts(); setBanner(bannerHtml, bannerCls);
    renderAll(); startLive(); applyRole();
    if (MODE === "db" && hasAudit === false) noteAudit();
    if (MODE === "db" && hasType === false) noteType();
  }
  function useDemo(err) {
    MODE = "demo"; loadDemo();
    var msg = err && err.message ? err.message : String(err);
    finish("<strong>Demo mode: showing built-in sample data.</strong> The database could not be read, so alerts are simulated." + esc(hintFor(msg)) + " Please send this message to the team:<code>" + esc(msg) + "</code>", "demo");
  }
  function fetchAll(from, acc) {
    return db.from("fuel_readings").select("*").order("reading_date", { ascending: true }).order("created_at", { ascending: true }).range(from, from + 999).then(function (res) {
      if (res.error) throw res.error;
      acc = acc.concat(res.data || []);
      return (res.data || []).length === 1000 ? fetchAll(from + 1000, acc) : acc;
    });
  }
  function boot() {
    var url = window.SUPABASE_URL || "", key = window.SUPABASE_PUBLISHABLE_KEY || "";
    if (!window.supabase) { useDemo("The Supabase library could not be loaded from cdn.jsdelivr.net. Check the internet connection."); return; }
    if (url.indexOf("PASTE") !== -1 || key.indexOf("PASTE") !== -1) { useDemo("config.js still has the placeholder Project URL or key."); return; }
    db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);
    setBanner("Loading readings from the database...", "ok");
    var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error("The database did not answer within 15 seconds (timed out).")); }, 15000); });
    Promise.race([fetchAll(0, []), timeout]).then(function (rows) {
      MODE = "db"; records = []; dbIds = {}; lastCreated = "";
      if (rows.length) { hasAudit = ("entered_by" in rows[0]); hasType = ("exception_type" in rows[0]); }
      rows.forEach(function (row) { addFromDb(row); });
      var note = rows.length
        ? "<strong>Connected to the database</strong> · " + rows.length + " readings. New readings raise alerts live."
        : "<strong>Connected to the database, but it has no readings yet.</strong> Use “Add reading”, or ask the Data Keeper to run database/02-fuel-readings.sql (it also adds sample rows).";
      finish(note, "ok");
    }).catch(function (e) { if (window.console) console.error(e); useDemo(e); });
  }
  try {
    initCustomize(); bindCustomize(); bind(); bindAdd(); refreshLists();
    boot();
  } catch (e) { showError("starting the page", e); }
})();
