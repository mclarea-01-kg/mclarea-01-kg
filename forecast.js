/* forecast.js - next-month diesel forecast, operator counselling and dumper trip capacity.
   Reads the same records as the dashboard (window.DIESEL_DATA). Simple, explainable rules.
   Trip counts are NOT in the data, so "trips per shift at norm" is an adjustable assumption. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  if (!$("fc-kpis")) return;
  var TYPES = ["Dumper", "Shovel", "Dozer", "Loader", "Other"];
  var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var HALF_LIFE = 10, WINDOW = 30;
  var chart = null;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { return Math.round(n).toLocaleString("en-IN"); }
  function rs(n) { return "\u20B9" + Math.round(n).toLocaleString("en-IN"); }
  function pct(r) { return Math.round(r * 100) + "%"; }
  function sum(a, f) { var t = 0; a.forEach(function (x) { t += f(x); }); return t; }
  function badge(cls, t) { return '<span class="badge ' + cls + '">' + esc(t) + "</span>"; }
  function dayNum(s) { var p = s.split("-"); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function uniq(a) { var o = {}; a.forEach(function (x) { o[x] = 1; }); return Object.keys(o); }
  function showError(e) {
    $("fc-error").innerHTML = '<div class="error-box"><strong>Sorry, the forecast could not be drawn.</strong> Please send this message to the team:<code>' + esc(e && e.message ? e.message : e) + "</code></div>";
  }

  var recs = (window.DIESEL_DATA || []).map(function (r) {
    return { day: dayNum(r.date), type: r.type, eq: r.eq, op: r.operator, norm: r.norm, actual: r.actual, ratio: r.actual / r.norm, excess: Math.max(0, r.actual - r.norm) };
  });
  var maxDay = recs.length ? Math.max.apply(null, recs.map(function (r) { return r.day; })) : 0;
  recs = recs.filter(function (r) { return r.day > maxDay - WINDOW; });

  // next month = the calendar month after the latest record
  var last = new Date(maxDay * 86400000);
  var ny = last.getUTCFullYear(), nm = last.getUTCMonth() + 1;
  if (nm > 11) { nm = 0; ny++; }
  var daysNext = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  var monthName = MON[nm] + " " + ny;

  function model(activity, tripsPerShift) {
    var by = {};
    recs.forEach(function (r) { (by[r.eq] = by[r.eq] || []).push(r); });
    var machines = Object.keys(by).sort().map(function (eq) {
      var list = by[eq].slice().sort(function (a, b) { return a.day - b.day; });
      var norm = sum(list, function (r) { return r.norm; }) / list.length;
      var wsum = 0, wr = 0;
      list.forEach(function (r) { var w = Math.pow(0.5, (maxDay - r.day) / HALF_LIFE); wsum += w; wr += w * r.ratio; });
      var expected = wr / wsum;
      var within = list.filter(function (r) { return r.ratio <= 1; });
      var typical = within.length ? sum(within, function (r) { return r.ratio; }) / within.length : 1;
      var best = Math.min(expected, typical);
      var l3 = list.slice(-3), recent = sum(l3, function (r) { return r.ratio; }) / l3.length;
      var worst = Math.max(expected, recent);
      var shifts = list.length * daysNext / WINDOW * activity / 100;
      var m = { eq: eq, type: list[0].type, shifts: shifts, norm: norm, ratio: expected, approved: shifts * norm };
      m.expL = m.approved * expected; m.bestL = m.approved * best; m.worstL = m.approved * worst;
      m.excessL = m.expL - m.approved;
      // dumper trips: planned at norm, achievable inside the approved diesel at current use
      m.tripsPlanned = shifts * tripsPerShift;
      m.tripsCan = expected > 1 ? m.tripsPlanned / expected : m.tripsPlanned;
      m.tripsLost = m.tripsPlanned - m.tripsCan;
      m.litresPerTrip = norm * expected / tripsPerShift;
      return m;
    });
    // operators
    var exc = recs.filter(function (r) { return r.excess > 0; });
    var opsOnMachine = {};
    machines.forEach(function (m) { opsOnMachine[m.eq] = uniq(exc.filter(function (r) { return r.eq === m.eq; }).map(function (r) { return r.op; })).length; });
    var byOp = {};
    exc.forEach(function (r) { (byOp[r.op] = byOp[r.op] || []).push(r); });
    var scale = daysNext / WINDOW * activity / 100;
    var ops = Object.keys(byOp).map(function (op) {
      var l = byOp[op], total = sum(l, function (r) { return r.excess; }), count = l.length;
      var recent = sum(l.filter(function (r) { return r.day > maxDay - 10; }), function (r) { return r.excess; }) / 10;
      var earlier = sum(l.filter(function (r) { return r.day <= maxDay - 10; }), function (r) { return r.excess; }) / 20;
      var trend = (recent * 10 >= 40 && recent > earlier * 1.2) ? "Rising" : recent < earlier * 0.8 ? "Falling" : "Steady";
      var lvl = (count >= 3 || total >= 300) ? 3 : (count >= 2 || total >= 150) ? 2 : 1;
      if (trend === "Rising" && lvl === 1) lvl = 2;
      var machinesOf = uniq(l.map(function (r) { return r.eq; })).sort();
      return { op: op, count: count, total: total, trend: trend, lvl: lvl, pCount: count * scale, pExcess: total * scale, machines: machinesOf, shared: machinesOf.filter(function (e) { return opsOnMachine[e] >= 2; }) };
    }).sort(function (a, b) { return b.lvl - a.lvl || b.total - a.total; });
    return { machines: machines, ops: ops };
  }

  function table(id, cols, rows, empty, totalRow) {
    if (!rows.length) { $(id).innerHTML = '<div class="empty-msg">' + empty + "</div>"; return; }
    var h = '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + cols.map(function (c) { return '<th class="' + (c.num ? "num" : "") + '">' + esc(c.label) + "</th>"; }).join("") + "</tr></thead><tbody>";
    rows.concat(totalRow ? [totalRow] : []).forEach(function (r) {
      h += "<tr" + (r.__total ? ' class="total-row"' : "") + ">" + cols.map(function (c) { return '<td class="' + (c.num ? "num" : "") + '" data-label="' + esc(c.label) + '">' + c.html(r) + "</td>"; }).join("") + "</tr>";
    });
    $(id).innerHTML = h + "</tbody></table></div>";
  }

  function kpi(title, value, sev, note) {
    var b = sev === "crit" ? badge("b-crit", "■ Critical") : sev === "warn" ? badge("b-warn", "▲ Warning") : badge("b-ok", "✔ Normal");
    return '<div class="kpi s-' + sev + '"><div class="k-title">' + title + '</div><div class="k-value">' + value + "</div><div>" + b + '</div><div class="k-note">' + note + "</div></div>";
  }

  function render() {
    try {
      $("fc-error").innerHTML = "";
      var activity = Math.min(150, Math.max(50, parseFloat($("fc-activity").value) || 100));
      var tps = Math.min(60, Math.max(1, parseFloat($("fc-trips").value) || 18));
      $("fc-sub").textContent = "Forecast for " + monthName + " (" + daysNext + " days), built from the last " + WINDOW + " days of records. It does not follow the filters above.";
      if (!recs.length) { $("fc-kpis").innerHTML = ""; ["t-fc-machine", "t-fc-op", "t-fc-trips"].forEach(function (id) { $(id).innerHTML = '<div class="empty-msg">No records to forecast from.</div>'; }); return; }
      var P = window.DIESEL_PRICE || 95;
      var m = model(activity, tps), mc = m.machines;
      var approved = sum(mc, function (x) { return x.approved; }), exp = sum(mc, function (x) { return x.expL; });
      var best = sum(mc, function (x) { return x.bestL; }), worst = sum(mc, function (x) { return x.worstL; });
      var over = exp / approved - 1;
      var dumpers = mc.filter(function (x) { return x.type === "Dumper"; });
      var planned = sum(dumpers, function (x) { return x.tripsPlanned; }), can = sum(dumpers, function (x) { return x.tripsCan; }), lost = planned - can;
      var retrain = m.ops.filter(function (o) { return o.lvl === 3; }).length, counsel = m.ops.filter(function (o) { return o.lvl === 2; }).length;

      $("fc-kpis").innerHTML =
        kpi("Forecast diesel – " + esc(MON[nm]), num(exp) + " <small>L</small>", over >= 0.15 ? "crit" : over >= 0.05 ? "warn" : "ok", "Range " + num(best) + " to " + num(worst) + " L · approved (norm) " + num(approved) + " L · cost about " + rs(exp * P) + " vs budget " + rs(approved * P)) +
        kpi("Expected excess over norm", num(exp - approved) + " <small>L</small>", over >= 0.15 ? "crit" : over >= 0.05 ? "warn" : "ok", pct(Math.max(0, over)) + " above approved \u00B7 extra cost about " + rs((exp - approved) * P) + " (best case " + rs(Math.max(0, best - approved) * P) + ", worst " + rs((worst - approved) * P) + ")") +
        kpi("Operators needing action", retrain + counsel, retrain > 0 ? "crit" : counsel > 0 ? "warn" : "ok", retrain + " retrain · " + counsel + " counsel · " + (m.ops.length - retrain - counsel) + " monitor") +
        kpi("Dumper trips lost to excess diesel", num(lost), planned && lost / planned >= 0.1 ? "crit" : lost > 0 ? "warn" : "ok", num(can) + " trips possible of " + num(planned) + " planned (" + num(tps) + " per shift)");

      // chart by type
      var byType = TYPES.map(function (t) { var l = mc.filter(function (x) { return x.type === t; }); return { a: sum(l, function (x) { return x.approved; }), b: sum(l, function (x) { return x.bestL; }), e: sum(l, function (x) { return x.expL; }), w: sum(l, function (x) { return x.worstL; }) }; });
      if (typeof Chart !== "undefined") {
        var ds = [
          { label: "Approved (norm)", data: byType.map(function (x) { return x.a; }), backgroundColor: "#9aa7b2" },
          { label: "Best case", data: byType.map(function (x) { return x.b; }), backgroundColor: "#2e7d32" },
          { label: "Expected", data: byType.map(function (x) { return x.e; }), backgroundColor: "#1b5a94" },
          { label: "Worst case", data: byType.map(function (x) { return x.w; }), backgroundColor: "#a3231b" }
        ];
        if (!chart) {
          chart = new Chart($("ch-fc"), { type: "bar", data: { labels: TYPES, datasets: ds }, options: {
            responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + num(c.parsed.y) + " L"; } } } },
            scales: { y: { beginAtZero: true, title: { display: true, text: "Litres next month" }, ticks: { precision: 0 } } } } });
        } else { chart.data.datasets = ds; chart.update(); }
      }

      table("t-fc-machine", [
        { label: "Machine", html: function (x) { return esc(x.eq) + " <span class=\"chip\">" + esc(x.type) + "</span>"; } },
        { label: "Shifts", num: 1, html: function (x) { return num(x.shifts); } },
        { label: "Uses norm at", num: 1, html: function (x) { return x.ratio > 1 ? "<strong>" + pct(x.ratio) + "</strong>" : pct(x.ratio); } },
        { label: "Approved (L)", num: 1, html: function (x) { return num(x.approved); } },
        { label: "Expected (L)", num: 1, html: function (x) { return num(x.expL); } },
        { label: "Excess (L)", num: 1, html: function (x) { return x.excessL > 0 ? "<strong>" + num(x.excessL) + "</strong>" : "0"; } },
        { label: "Range (L)", num: 1, html: function (x) { return num(x.bestL) + "–" + num(x.worstL); } }
      ], mc.slice().sort(function (a, b) { return b.excessL - a.excessL; }), "No machines.");

      table("t-fc-op", [
        { label: "Operator", html: function (o) { return esc(o.op); } },
        { label: "Last 30 days", num: 1, html: function (o) { return o.count + " exc · " + num(o.total) + " L"; } },
        { label: "Trend", html: function (o) { return o.trend === "Rising" ? badge("b-crit", "▲ Rising") : o.trend === "Falling" ? badge("b-ok", "▼ Falling") : badge("b-info", "● Steady"); } },
        { label: "If pattern continues", num: 1, html: function (o) { return "~" + (Math.round(o.pCount * 10) / 10) + " exc · " + num(o.pExcess) + " L"; } },
        { label: "Counselling", html: function (o) {
          var b = o.lvl === 3 ? badge("b-crit", "▲ Retrain") : o.lvl === 2 ? badge("b-warn", "● Counsel") : badge("b-info", "○ Monitor");
          return b + (o.shared.length && o.lvl >= 2 ? '<div class="note">Inspect ' + esc(o.shared.join(", ")) + " first (other operators also exceed norm).</div>" : ""); } }
      ], m.ops, "No operator has an exception, so no counselling is needed.");

      table("t-fc-trips", [
        { label: "Dumper", html: function (x) { return esc(x.eq); } },
        { label: "Trips planned", num: 1, html: function (x) { return num(x.tripsPlanned); } },
        { label: "Trips possible", num: 1, html: function (x) { return num(x.tripsCan); } },
        { label: "Trips lost", num: 1, html: function (x) { return x.tripsLost >= 0.5 ? "<strong>" + num(x.tripsLost) + "</strong>" : "0"; } },
        { label: "Litres per trip", num: 1, html: function (x) { return (Math.round(x.litresPerTrip * 10) / 10); } }
      ], dumpers.slice().sort(function (a, b) { return b.tripsLost - a.tripsLost; }), "No dumper records.",
      { __total: 1, eq: "Fleet total", tripsPlanned: planned, tripsCan: can, tripsLost: lost, litresPerTrip: sum(dumpers, function (x) { return x.approved * x.ratio; }) / Math.max(1, sum(dumpers, function (x) { return x.shifts; }) * tps) });
    } catch (e) { showError(e); if (window.console) console.error(e); }
  }

  ["fc-activity", "fc-trips"].forEach(function (id) { $(id).addEventListener("input", render); });
  window.DIESEL_FC_RENDER = render;
  render();
})();
