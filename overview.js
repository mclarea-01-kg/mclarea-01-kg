/* overview.js - Fuel Overview Dashboard (overview.html).
   Reads made-up data from overview-data.js. Every number is worked out here, none is typed in.
   "Live" readings are SIMULATED in the browser (real-time needs the database: a later phase). */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var FONT = '"Inter Variable", Inter, "Segoe UI", Arial, sans-serif';
  var EXC_TYPES = ["High Consumption", "Low Consumption", "Refueling Irregularity", "Mileage Mismatch", "Other"];
  var EXC_COLORS = { "High Consumption": "#c62828", "Low Consumption": "#0b57c7", "Refueling Irregularity": "#c98a00", "Mileage Mismatch": "#0a1f44", "Other": "#8a96a8" };
  var STATUSES = ["Open", "Under Review", "In Progress", "Closed"];
  var WIDGETS = [["trend", "Diesel consumption trend"], ["type", "Exceptions by type"], ["mine", "Exceptions by mine"], ["eff", "Fuel efficiency by vehicle type"], ["equip", "Fuel consumption by equipment"], ["locations", "Top 5 exception locations"], ["details", "Exception details table"], ["insights", "Key insights"], ["actions", "Recommended actions"]];
  var DEFAULTS = { high: 10, low: 10, crit: 25, price: 92, group: "auto", live: true, interval: 30, toasts: true, sound: false, rows: 8, widgets: {} };
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
  function showError(where, e) {
    var msg = e && e.message ? e.message : String(e);
    $("error-area").innerHTML = '<div class="error-box"><strong>Sorry, something went wrong while ' + esc(where) + '.</strong> Please send this message to the team:<code>' + esc(msg) + "</code></div>";
  }
  function load(key, fallback) { try { var v = JSON.parse(localStorage.getItem(key) || "null"); return v == null ? fallback : v; } catch (e) { return fallback; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode: fine */ } }

  var META = window.OVERVIEW_META, ROWS = window.OVERVIEW_ROWS;
  if (!META || !ROWS || !ROWS.length) { showError("loading the sample data", "overview-data.js is missing or empty."); return; }
  if (typeof Chart === "undefined") showError("loading the chart library", "Chart.js could not be loaded from cdn.jsdelivr.net. Numbers and tables still work; charts are hidden. Check the internet connection.");
  else { Chart.defaults.font.family = FONT; Chart.defaults.color = "#33425c"; }

  /* ================= settings, records, state ================= */
  var S = load("mclOverviewSettings", {});
  Object.keys(DEFAULTS).forEach(function (k) { if (S[k] === undefined) S[k] = JSON.parse(JSON.stringify(DEFAULTS[k])); });
  WIDGETS.forEach(function (w) { if (S.widgets[w[0]] === undefined) S.widgets[w[0]] = true; });
  var overrides = load("mclOverviewStatus", {});
  var views = load("mclOverviewViews", []);

  var machines = META.machines;
  var records = ROWS.map(function (r, i) {
    var m = machines[r[1]];
    return { id: i, date: r[0], day: dayNum(r[0]), no: m.no, vtype: META.types[m.type], mine: META.mines[m.mine], siding: META.sidings[r[3]], shift: META.shifts[r[2]], exp: r[4], act: r[5], km: r[6], flag: r[7], status: META.statuses[r[8]], live: false };
  });
  var DATA_MIN = records[0].day, DATA_MAX = records[records.length - 1].day;
  var F = { preset: "30", from: "", to: "", mine: "", siding: "", vtype: "", eq: "", shift: "", etype: "", status: "" };
  var UI = { sortKey: "date", sortDir: "desc", page: 1, search: "" };
  var charts = {}, view = {}, alerts = [], alertSeq = 1, liveCount = 0, timer = null, audio = null;

  function devPct(r) { return (r.act - r.exp) / r.exp * 100; }
  function excType(r) {
    if (r.flag) return META.flags[r.flag];
    var d = devPct(r);
    if (d > S.high) return "High Consumption";
    if (d < -S.low) return "Low Consumption";
    return null;
  }
  function keyOf(r) { return r.live ? "L" + r.id : r.date + "|" + r.no + "|" + r.shift; }
  function statusOf(r) { return overrides[keyOf(r)] || r.status; }
  function severity(r) { return Math.abs(devPct(r)) >= S.crit ? "crit" : "warn"; }

  /* ================= filters ================= */
  function fillSelect(id, allLabel, values, current) {
    var h = '<option value="">' + esc(allLabel) + "</option>";
    values.forEach(function (v) { h += '<option value="' + esc(v) + '"' + (v === current ? " selected" : "") + ">" + esc(v) + "</option>"; });
    $(id).innerHTML = h;
  }
  function eqOptions() {
    return machines.filter(function (m) { return (!F.vtype || META.types[m.type] === F.vtype) && (!F.mine || META.mines[m.mine] === F.mine); }).map(function (m) { return m.no; });
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
  function initFilters() {
    fillSelect("f-mine", "All", META.mines, ""); fillSelect("f-siding", "All", META.sidings, "");
    fillSelect("f-vtype", "All", META.types, ""); fillSelect("f-eq", "All", eqOptions(), "");
    fillSelect("f-shift", "All", META.shifts, ""); fillSelect("f-etype", "All", EXC_TYPES, ""); fillSelect("f-status", "All", STATUSES, "");
    $("f-from").min = $("f-to").min = numToDate(DATA_MIN); $("f-from").max = $("f-to").max = numToDate(DATA_MAX);
    setPreset();
    $("asof").textContent = "Data as on " + fmtDate(numToDate(DATA_MAX)) + ".";
  }
  function readFilters() {
    F.preset = $("f-preset").value;
    if (F.preset !== "custom") setPreset();
    else {
      F.from = $("f-from").value || numToDate(DATA_MIN); F.to = $("f-to").value || numToDate(DATA_MAX);
      if (F.from > F.to) { var t = F.from; F.from = F.to; F.to = t; $("f-from").value = F.from; $("f-to").value = F.to; }
    }
    F.mine = $("f-mine").value; F.siding = $("f-siding").value; F.vtype = $("f-vtype").value;
    var want = $("f-eq").value; fillSelect("f-eq", "All", eqOptions(), want); F.eq = $("f-eq").value;
    F.shift = $("f-shift").value; F.etype = $("f-etype").value; F.status = $("f-status").value;
  }
  function pushFilters() {
    $("f-preset").value = F.preset; $("f-from").value = F.from; $("f-to").value = F.to;
    $("f-mine").value = F.mine; $("f-siding").value = F.siding; $("f-vtype").value = F.vtype;
    fillSelect("f-eq", "All", eqOptions(), F.eq); $("f-shift").value = F.shift; $("f-etype").value = F.etype; $("f-status").value = F.status;
  }

  /* ================= calculations ================= */
  function base(r, fr, to) {
    return r.day >= fr && r.day <= to && (!F.mine || r.mine === F.mine) && (!F.siding || r.siding === F.siding) &&
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
  function effOf(list) { var l = sum(list, function (r) { return r.act; }); return l ? sum(list, function (r) { return r.km; }) / l : 0; }

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
    var cons = sum(pool, function (r) { return r.act; }), pcons = sum(view.prev, function (r) { return r.act; });
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
    view.pool.forEach(function (r) { var k = key(r.day); lit[k] += r.act; km[k] += r.km; });
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
    var defs = { "High Consumption": "(>" + S.high + "% above norm)", "Low Consumption": "(>" + S.low + "% below norm)", "Refueling Irregularity": "", "Mileage Mismatch": "", "Other": "" };
    $("type-legend").innerHTML = EXC_TYPES.map(function (t, i) {
      return '<li><span class="sw" style="background:' + EXC_COLORS[t] + '"></span><span><b>' + esc(t) + "</b> " + esc(defs[t]) + "<small>" + counts[i] + " (" + (total ? Math.round(counts[i] / total * 100) : 0) + "%)</small></span></li>";
    }).join("");
    upsert("type", { type: "doughnut", data: { labels: EXC_TYPES, datasets: [{ data: counts, backgroundColor: EXC_TYPES.map(function (t) { return EXC_COLORS[t]; }), borderColor: "#fff", borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "52%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return c.label + ": " + c.parsed; } } } } }, plugins: [donutPlugin] });
  }

  function renderMine() {
    var rows = META.mines.map(function (m) { return [m, view.exc.filter(function (r) { return r.mine === m; }).length]; }).sort(function (a, b) { return b[1] - a[1]; });
    toggleEmpty("empty-mine", !sum(rows, function (r) { return r[1]; }));
    upsert("mine", hbarCfg(rows.map(function (r) { return r[0]; }), rows.map(function (r) { return r[1]; }), "#0b57c7"));
  }

  function renderEff() {
    var rows = META.types.map(function (t) { var l = view.pool.filter(function (r) { return r.vtype === t; }); return [t, effOf(l), l.length]; }).filter(function (r) { return r[2]; }).sort(function (a, b) { return b[1] - a[1]; });
    toggleEmpty("empty-eff", !rows.length);
    upsert("eff", { type: "bar", data: { labels: rows.map(function (r) { return r[0]; }), datasets: [{ label: "km/l", data: rows.map(function (r) { return Math.round(r[1] * 100) / 100; }), backgroundColor: "#0b57c7", borderRadius: 3, showLabels: true, labelFmt: function (v) { return v.toFixed(2); } }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 18 } }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: "km/l" } }, x: { grid: { display: false } } } }, plugins: [labelPlugin] });
  }

  function renderEquip() {
    var rows = META.types.map(function (t) { return [t, sum(view.pool.filter(function (r) { return r.vtype === t; }), function (r) { return r.act; })]; }).filter(function (r) { return r[1]; }).sort(function (a, b) { return b[1] - a[1]; });
    toggleEmpty("empty-equip", !rows.length);
    var cfg = hbarCfg(rows.map(function (r) { return r[0]; }), rows.map(function (r) { return r[1]; }), "#0b57c7");
    cfg.options.layout.padding.right = 60;
    upsert("equip", cfg);
  }

  function renderLocations() {
    var by = {}; view.exc.forEach(function (r) { var k = r.mine + " – " + r.siding; by[k] = (by[k] || 0) + 1; });
    var rows = Object.keys(by).map(function (k) { return [k, by[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
    if (!rows.length) { $("top-locations").innerHTML = '<div class="empty-msg">No exceptions match the selected filters.</div>'; return; }
    var max = rows[0][1];
    $("top-locations").innerHTML = '<div class="loc-head"><span>Location</span><span>No. of exceptions</span></div>' + rows.map(function (r) {
      return '<div class="loc"><span>' + esc(r[0]) + '</span><span class="bar"><i style="width:' + Math.round(r[1] / max * 100) + '%"></i></span><b>' + r[1] + "</b></div>";
    }).join("");
  }

  /* ---- exception details table ---- */
  var COLS = [
    { key: "date", label: "Date", val: function (r) { return r.day; }, html: function (r) { return fmtDate(r.date); } },
    { key: "mine", label: "Mine", val: function (r) { return r.mine; }, html: function (r) { return esc(r.mine); } },
    { key: "no", label: "Vehicle No.", val: function (r) { return r.no; }, html: function (r) { return esc(r.no); } },
    { key: "vtype", label: "Equipment", val: function (r) { return r.vtype; }, html: function (r) { return esc(r.vtype); } },
    { key: "act", label: "Fuel Consumed (L)", num: 1, val: function (r) { return r.act; }, html: function (r) { return num(r.act); } },
    { key: "exp", label: "Expected (L)", num: 1, val: function (r) { return r.exp; }, html: function (r) { return num(r.exp); } },
    { key: "var", label: "Variance (L)", num: 1, val: function (r) { return r.act - r.exp; }, html: function (r) { var v = r.act - r.exp; return '<span class="' + (v > 0 ? "dev-bad" : "dev-low") + '">' + (v > 0 ? "+" : "") + num(v) + "</span>"; } },
    { key: "dev", label: "% Deviation", num: 1, val: function (r) { return devPct(r); }, html: function (r) { var d = devPct(r); return '<span class="' + (d > 0 ? "dev-bad" : "dev-low") + '">' + (d > 0 ? "+" : "") + num1(d) + "%</span>"; } },
    { key: "type", label: "Exception Type", val: function (r) { return r._t || ""; }, html: function (r) { return esc(r._t || ""); } },
    { key: "status", label: "Status", val: function (r) { return STATUSES.indexOf(statusOf(r)); }, html: function (r) { var s = statusOf(r); return '<span class="status-pill st-' + s.replace(/ /g, "-") + '">' + esc(s) + "</span>"; } }
  ];
  function detailRows() {
    var q = UI.search.trim().toLowerCase();
    return view.exc.filter(function (r) { return !q || [r.date, fmtDate(r.date), r.mine, r.siding, r.no, r.vtype, r._t, statusOf(r), r.shift].join(" ").toLowerCase().indexOf(q) !== -1; });
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
    var exc = view.exc, items = [], cons = sum(view.pool, function (r) { return r.act; });
    var dE = delta(exc.length, view.prevExc.length);
    if (dE !== null) items.push("Total diesel exceptions " + (dE > 0 ? "increased" : dE < 0 ? "decreased" : "are unchanged") + (dE ? " by " + num1(Math.abs(dE)) + "%" : "") + " compared with the previous period (" + exc.length + " vs " + view.prevExc.length + ").");
    else items.push(exc.length + " exception" + (exc.length === 1 ? "" : "s") + " in this period. There is no earlier period to compare.");
    if (exc.length) {
      var ct = EXC_TYPES.map(function (t) { return [t, exc.filter(function (r) { return r._t === t; }).length]; }).sort(function (a, b) { return b[1] - a[1]; });
      items.push(ct[0][0] + " cases (" + Math.round(ct[0][1] / exc.length * 100) + "%) are the major concern.");
      var cm = META.mines.map(function (m) { return [m, exc.filter(function (r) { return r.mine === m; }).length]; }).sort(function (a, b) { return b[1] - a[1]; }).filter(function (x) { return x[1]; });
      if (cm.length >= 2) items.push(cm[0][0] + " and " + cm[1][0] + " have the highest number of exceptions (" + cm[0][1] + " and " + cm[1][1] + ").");
      else if (cm.length) items.push(cm[0][0] + " has all the exceptions (" + cm[0][1] + ").");
      var excess = sum(exc.filter(function (r) { return r.act > r.exp; }), function (r) { return r.act - r.exp; });
      if (excess) items.push("Diesel above expected on exception records: " + num(excess) + " L, about " + rs(excess * S.price) + ".");
    }
    var eff = effOf(view.pool), dEf = delta(eff, effOf(view.prev));
    if (eff) items.push("Overall fuel efficiency " + (dEf === null ? "is " : dEf >= 0 ? "improved to " : "declined to ") + eff.toFixed(2) + " km/l" + (dEf === null ? "." : " (" + (dEf >= 0 ? "▲ " : "▼ ") + num1(Math.abs(dEf)) + "%)."));
    var bt = META.types.map(function (t) { return [t, sum(view.pool.filter(function (r) { return r.vtype === t; }), function (r) { return r.act; })]; }).sort(function (a, b) { return b[1] - a[1]; });
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
    if (exc.length) g["Fuel Management Team"].push("Check refuelling discipline at high exception locations: " + joinList(top(exc, function (r) { return r.mine + " – " + r.siding; }, 2)) + ".");
    var mm = exc.filter(function (r) { return r._t === "Mileage Mismatch"; });
    if (mm.length) g["Fuel Management Team"].push("Verify odometer / GPS data for mileage mismatch cases: " + joinList(top(mm, function (r) { return r.no; }, 3)) + ".");
    var open = exc.filter(function (r) { return statusOf(r) === "Open"; });
    if (open.length) g["Fuel Management Team"].push(open.length + " exception" + (open.length === 1 ? " is" : "s are") + " still Open. Assign an owner.");
    if (high.length) g["Fleet & Workshop"].push("Ensure timely maintenance of high fuel consuming equipment: " + joinList(top(high, function (r) { return r.vtype; }, 2)) + ".");
    var lowRef = exc.filter(function (r) { return r._t === "Low Consumption" || r._t === "Refueling Irregularity"; });
    if (lowRef.length) g["Fleet & Workshop"].push("Calibrate fuel sensors and meter systems (" + lowRef.length + " low-consumption / refuelling cases).");
    if (exc.length) g["Management"].push("Review fuel norms and set corrective targets for cases beyond " + S.high + "% deviation.");
    var crit = exc.filter(function (r) { return Math.abs(devPct(r)) >= S.crit; });
    if (crit.length) g["Management"].push(crit.length + " case" + (crit.length === 1 ? " is" : "s are") + " " + S.crit + "% or more away from norm. Review these first.");
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
    var d = devPct(r), v = r.act - r.exp, t = r._t || excType(r);
    $("rec-title").textContent = r.no + " – " + r.vtype + " · " + fmtDate(r.date);
    var rows = [["Mine / Siding", r.mine + " – " + r.siding], ["Shift", r.shift], ["Expected", num(r.exp) + " L"], ["Actual", num(r.act) + " L"],
      ["Variance", (v > 0 ? "+" : "") + num(v) + " L (" + (d > 0 ? "+" : "") + num1(d) + "%)"], ["Distance", num(r.km) + " km"], ["Efficiency", (r.km / r.act).toFixed(2) + " km/l"],
      ["Exception type", t || "Within limits"], ["Cost of excess", v > 0 ? rs(v * S.price) : "₹0"], ["Record", r.live ? "Simulated live reading" : "Sample record"]];
    var h = '<dl class="rec-grid">' + rows.map(function (x) { return "<div><dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd></div>"; }).join("") + "</dl>";
    h += '<div class="fld"><label for="rec-status">Status</label><select id="rec-status">' + STATUSES.map(function (s) { return '<option' + (s === statusOf(r) ? " selected" : "") + ">" + s + "</option>"; }).join("") + '</select></div>';
    h += '<button class="btn primary" id="rec-save" type="button" data-id="' + id + '">Save status</button><p class="note">Saved in this browser only (demo).</p>';
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
    ["drawer-alerts", "drawer-custom"].forEach(function (i) { $(i).hidden = true; });
    $("backdrop").hidden = true;
    if (!keepFocus && drawerOpener && document.contains(drawerOpener)) drawerOpener.focus();
  }

  /* ================= alerts ================= */
  function alertText(r) {
    var d = devPct(r), v = r.act - r.exp;
    return r.no + " (" + r.vtype + ") at " + r.mine + " – " + r.siding + ": " + r._t + ", " + (d > 0 ? "+" : "") + num1(d) + "% (" + (v > 0 ? "+" : "") + num(v) + " L vs expected " + num(r.exp) + " L)";
  }
  function addAlert(r, fresh) {
    var a = { id: alertSeq++, rec: r.id, sev: severity(r), text: alertText(r), when: fresh ? new Date() : null, label: fresh ? "" : "Recorded " + fmtShort(r.date), acked: false };
    alerts.unshift(a); if (alerts.length > 60) alerts.pop();
    return a;
  }
  function seedAlerts() {
    records.forEach(function (r) { r._t = excType(r); });
    var recent = records.filter(function (r) { return r._t && r.day >= DATA_MAX - 2 && statusOf(r) === "Open"; }).slice(-4);
    recent.forEach(function (r) { addAlert(r, false); });
  }
  function unacked() { return alerts.filter(function (a) { return !a.acked; }).length; }
  function updateBadge() {
    var n = unacked(), c = $("alert-count"); c.textContent = n; c.className = "count" + (n ? " on" : "");
    document.title = (n ? "(" + n + ") " : "") + "Fuel Overview Dashboard";
  }
  function renderAlerts() {
    var host = $("alert-list");
    if (!alerts.length) { host.innerHTML = '<div class="empty-msg">No alerts yet. Waiting for readings...</div>'; return; }
    host.innerHTML = alerts.map(function (a) {
      var when = a.when ? a.when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : a.label;
      return '<div class="al ' + a.sev + (a.acked ? " acked" : "") + '"><div class="al-top"><span class="badge ' + (a.sev === "crit" ? "b-solid" : "b-warn") + '">' + (a.sev === "crit" ? "■ Critical" : "▲ Warning") + "</span><span class=\"al-meta\">" + esc(when) + (a.acked ? " · acknowledged" : "") + "</span></div><div>" + esc(a.text) + '</div><div class="al-btns"><button class="btn" type="button" data-alrec="' + a.rec + '">View record</button>' + (a.acked ? "" : '<button class="btn" type="button" data-alack="' + a.id + '">Acknowledge</button>') + "</div></div>";
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
    if (!S.toasts) return;
    var box = $("toasts"), el = document.createElement("div");
    el.className = "toast " + a.sev; el.setAttribute("role", a.sev === "crit" ? "alert" : "status");
    el.innerHTML = "<b>" + (a.sev === "crit" ? "■ Critical alert" : "▲ Fuel alert") + "</b>" + esc(a.text) + '<div class="t-actions"><button class="btn" type="button" data-toast-view>View alerts</button><button class="btn" type="button" data-toast-x>Dismiss</button></div>';
    box.insertBefore(el, box.firstChild);
    while (box.children.length > 3) box.removeChild(box.lastChild);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 9000);
  }

  /* ---- simulated live feed ---- */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function makeReading(forceExc) {
    var m = machines[Math.floor(Math.random() * machines.length)], h = new Date().getHours();
    var shift = h >= 6 && h < 14 ? 0 : h >= 14 && h < 22 ? 1 : 2, flag = 0, dev, kmf = 1;
    if (forceExc || Math.random() < 0.3) {
      var p = Math.random();
      if (p < 0.6) dev = rnd(0.12, 0.42); else if (p < 0.75) dev = -rnd(0.12, 0.26);
      else if (p < 0.9) { dev = rnd(0.06, 0.14); flag = 1; } else { dev = rnd(0.04, 0.12); flag = 2; kmf = 0.72; }
    } else dev = rnd(-0.06, 0.06);
    var exp = m.norm, act = Math.round(exp * (1 + dev)), km = Math.round(exp * m.eff * kmf * rnd(0.98, 1.02));
    var r = { id: records.length, date: numToDate(DATA_MAX), day: DATA_MAX, no: m.no, vtype: META.types[m.type], mine: META.mines[m.mine], siding: META.sidings[Math.floor(Math.random() * 3)], shift: META.shifts[shift], exp: exp, act: act, km: km, flag: flag, status: "Open", live: true };
    r._t = excType(r); records.push(r); liveCount++;
    return r;
  }
  function tick(forceExc) {
    var r = makeReading(forceExc);
    var pill = $("live-pill"); pill.classList.add("flash"); setTimeout(function () { pill.classList.remove("flash"); }, 1200);
    $("live-text").textContent = "Live: on · " + liveCount + " new reading" + (liveCount === 1 ? "" : "s");
    if (r._t) {
      var a = addAlert(r, true); toast(a); if (a.sev === "crit" && S.sound) beep();
      if (!$("drawer-alerts").hidden) renderAlerts();
    }
    renderAll();
  }
  function startLive() {
    if (timer) { clearInterval(timer); timer = null; }
    var pill = $("live-pill");
    pill.className = "live-pill" + (S.live ? " on" : "");
    $("live-text").textContent = S.live ? "Live: on" + (liveCount ? " · " + liveCount + " new reading" + (liveCount === 1 ? "" : "s") : "") : "Live: paused";
    if (S.live) timer = setInterval(function () { tick(false); }, S.interval * 1000);
  }

  /* ================= customize panel ================= */
  function persist() { save("mclOverviewSettings", S); }
  function initCustomize() {
    $("c-high").value = S.high; $("c-low").value = S.low; $("c-crit").value = S.crit; $("c-price").value = S.price;
    $("c-live").checked = S.live; $("c-interval").value = String(S.interval); $("c-toasts").checked = S.toasts; $("c-sound").checked = S.sound;
    $("c-group").value = S.group; $("c-rows").value = String(S.rows);
    $("c-widgets").innerHTML = WIDGETS.map(function (w) { return '<label class="check"><input type="checkbox" data-w="' + w[0] + '"' + (S.widgets[w[0]] ? " checked" : "") + "> " + esc(w[1]) + "</label>"; }).join("");
    renderViews();
  }
  function renderViews() {
    $("v-list").innerHTML = views.length ? views.map(function (v, i) { return "<li><span>" + esc(v.name) + '</span><span><button class="btn" type="button" data-vapply="' + i + '">Apply</button> <button class="btn" type="button" data-vdel="' + i + '">Delete</button></span></li>'; }).join("") : '<li class="note">No saved views yet.</li>';
  }
  function bindCustomize() {
    function numField(id, key) { $(id).addEventListener("input", function () { var v = parseFloat(this.value); if (!(v > 0)) return; S[key] = v; persist(); renderAll(); }); }
    numField("c-high", "high"); numField("c-low", "low"); numField("c-crit", "crit"); numField("c-price", "price");
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
      var head = ["Date", "Mine", "Siding", "Vehicle No", "Equipment", "Shift", "Fuel Consumed (L)", "Expected (L)", "Variance (L)", "Deviation (%)", "Exception Type", "Status"];
      var lines = [head.join(",")];
      detailRows().forEach(function (r) { lines.push([r.date, r.mine, r.siding, r.no, r.vtype, r.shift, r.act, r.exp, r.act - r.exp, Math.round(devPct(r) * 10) / 10, r._t, statusOf(r)].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(",")); });
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "fuel-exceptions-sample.csv";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { showError("downloading the CSV file", e); }
  }

  /* ================= events ================= */
  function bind() {
    ["f-preset", "f-from", "f-to", "f-mine", "f-siding", "f-vtype", "f-eq", "f-shift", "f-etype", "f-status"].forEach(function (id) {
      $(id).addEventListener("change", function () { if (id === "f-from" || id === "f-to") $("f-preset").value = "custom"; readFilters(); UI.page = 1; renderAll(); });
    });
    $("f-reset").addEventListener("click", function () {
      F = { preset: "30", from: "", to: "", mine: "", siding: "", vtype: "", eq: "", shift: "", etype: "", status: "" }; UI.search = ""; $("d-search").value = ""; UI.page = 1;
      setPreset(); pushFilters(); renderAll();
    });
    $("filter-toggle").addEventListener("click", function () { var o = $("sidebar").classList.toggle("open"); this.setAttribute("aria-expanded", o ? "true" : "false"); });
    $("d-search").addEventListener("input", function () { UI.search = this.value; UI.page = 1; renderDetails(); });
    $("d-csv").addEventListener("click", downloadCsv);
    $("btn-alerts").addEventListener("click", function () { openDrawer("drawer-alerts"); });
    $("btn-custom").addEventListener("click", function () { openDrawer("drawer-custom"); });
    $("backdrop").addEventListener("click", function () { closeDrawers(); });
    document.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { closeDrawers(); }); });
    $("rec-close").addEventListener("click", closeRecord);
    $("rec-modal").addEventListener("click", function (e) { if (e.target === this) closeRecord(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeRecord(); closeDrawers(); } if ((e.key === "Enter") && e.target.getAttribute && e.target.getAttribute("data-rec")) openRecord(+e.target.getAttribute("data-rec")); });
    $("al-ack").addEventListener("click", function () { alerts.forEach(function (a) { a.acked = true; }); renderAlerts(); updateBadge(); });
    $("al-clear").addEventListener("click", function () { alerts = []; renderAlerts(); updateBadge(); });
    $("al-test").addEventListener("click", function () { tick(true); });
    $("alert-list").addEventListener("click", function (e) {
      var ack = e.target.getAttribute("data-alack"), rec = e.target.getAttribute("data-alrec");
      if (ack) { alerts.forEach(function (a) { if (a.id === +ack) a.acked = true; }); renderAlerts(); updateBadge(); }
      if (rec) { closeDrawers(true); openRecord(+rec); }
    });
    $("toasts").addEventListener("click", function (e) {
      if (e.target.hasAttribute("data-toast-x")) { var t = e.target.closest(".toast"); if (t) t.remove(); }
      if (e.target.hasAttribute("data-toast-view")) { $("toasts").innerHTML = ""; openDrawer("drawer-alerts"); }
    });
    $("rec-body").addEventListener("click", function (e) {
      if (e.target.id !== "rec-save") return;
      var r = records[+e.target.getAttribute("data-id")]; overrides[keyOf(r)] = $("rec-status").value; save("mclOverviewStatus", overrides); closeRecord(); renderAll();
    });
    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-sort],[data-page],tr[data-rec]") : null; if (!t) return;
      if (t.hasAttribute("data-sort")) { var k = t.getAttribute("data-sort"); if (UI.sortKey === k) UI.sortDir = UI.sortDir === "asc" ? "desc" : "asc"; else { UI.sortKey = k; UI.sortDir = "desc"; } renderDetails(); }
      else if (t.hasAttribute("data-page")) { UI.page += t.getAttribute("data-page") === "next" ? 1 : -1; renderDetails(); }
      else openRecord(+t.getAttribute("data-rec"));
    });
    document.addEventListener("change", function (e) { if (e.target.getAttribute && e.target.getAttribute("data-sortsel")) { var v = e.target.value.split("|"); UI.sortKey = v[0]; UI.sortDir = v[1]; renderDetails(); } });
  }

  /* ================= start ================= */
  try {
    initFilters(); initCustomize(); bindCustomize(); bind(); seedAlerts();
    renderAll(); startLive();
  } catch (e) { showError("starting the page", e); }
})();
