/* hindrance.js - Daily Hindrance Entry tool (index.html).
   Parts: (1) core maths + voice/text reader (no screen, easy to test), (2) the screen.
   The NET hindrance never counts overlapping periods twice (same location + same date).
   The single records are never changed: the net time is worked out separately. */
(function () {
  "use strict";

  /* ================= 1. CORE ================= */
  var LOCS = ["Laikera", "Kanika", "Inpit", "Sardega"];
  var CATS = ["Equipment Breakdown", "Power Failure", "Weather / Rain", "Water Logging", "Road / Haul Road Blocked",
    "Blasting / Drilling", "Coal Handling / Loading", "Fuel / Diesel Shortage", "Manpower / Shift Issue",
    "Law & Order / Local Issue", "Other"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function toMin(t) { if (!t) return null; var p = String(t).split(":"); var h = +p[0], m = +p[1]; return (isNaN(h) || isNaN(m)) ? null : h * 60 + m; }
  function minToHHMM(m) { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function hm(min) { min = Math.round(min || 0); var h = Math.floor(min / 60), m = min % 60; return h + "h " + pad(m) + "m"; }
  function hrs(min) { return Math.round((min || 0) / 60 * 100) / 100; }
  function fmtDate(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : (iso || ""); }
  function isoToday() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function validDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); if (!m) return false;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] && +m[1] >= 2000;
  }
  function addDays(iso, n) { var p = iso.split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2] + n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  // start/end minutes of an entry; an entry that ends next day gets end + 1440
  function span(r) {
    var s = toMin(r.start_time), e = toMin(r.end_time);
    if (s == null || e == null) return null;
    if (r.ends_next_day) e += 1440;
    return e > s || (r.ends_next_day && e >= s) ? { s: s, e: e } : null;
  }

  /* NET time: merge overlapping periods so every minute is counted once.
     Each minute is given to the entry that started first, so the categories add up to the net exactly. */
  function analyse(list) {
    var timed = [];
    list.forEach(function (r) { var sp = span(r); if (sp) timed.push({ s: sp.s, e: sp.e, category: r.category || "Other" }); });
    timed.sort(function (a, b) { return a.s - b.s || a.e - b.e; });
    var cur = -Infinity, net = 0, gross = 0, byCat = {};
    timed.forEach(function (t) {
      gross += t.e - t.s;
      var from = Math.max(t.s, cur);
      if (t.e > from) { net += t.e - from; byCat[t.category] = (byCat[t.category] || 0) + (t.e - from); }
      cur = Math.max(cur, t.e);
    });
    return { entries: list.length, timed: timed.length, gross: gross, net: net, overlap: gross - net, byCat: byCat };
  }

  // group rows by "date|location" and analyse each group
  function groupDayLoc(rows) {
    var map = {};
    rows.forEach(function (r) { var k = r.entry_date + "|" + r.location; (map[k] = map[k] || { date: r.entry_date, location: r.location, rows: [] }).rows.push(r); });
    return Object.keys(map).map(function (k) { var g = map[k]; g.a = analyse(g.rows); return g; })
      .sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : LOCS.indexOf(x.location) - LOCS.indexOf(y.location); });
  }

  /* ---------- reading times, equipment, cause, location, category from words ---------- */
  var TP = "(\\d{1,2})(?:\\s*[:.]\\s*(\\d{2}))?\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)?";
  function to24(h, m, ap) {
    h = +h; m = m == null || m === "" ? 0 : +m;
    if (m > 59) return null;
    if (ap) { ap = ap.toLowerCase().charAt(0); if (h < 1 || h > 12) return null; h = (h % 12) + (ap === "p" ? 12 : 0); }
    else if (h > 23) return null;
    return h * 60 + m;
  }
  function findTimes(text) {
    var re = new RegExp("(?:\\b(from|between|at|since)\\s+)?" + TP + "\\s*(?:hrs?|hours?)?\\s*(?:to|till|until|through|and|-|–)\\s*" + TP + "\\s*(?:hrs?|hours?)?", "ig"), m;
    while ((m = re.exec(text))) {
      var lead = m[1], h1 = m[2], m1 = m[3], a1 = m[4], h2 = m[5], m2 = m[6], a2 = m[7];
      var evidence = lead || (m1 && m2) || a1 || a2;
      if (!evidence) continue;
      var s, e;
      if (!a1 && a2) { e = to24(h2, m2, a2); s = to24(h1, m1, a2); if (s != null && e != null && s > e) s = to24(h1, m1, /^p/i.test(a2) ? "am" : "pm"); }
      else if (a1 && !a2) { s = to24(h1, m1, a1); e = to24(h2, m2, a1); if (s != null && e != null && e < s) e += 720; }
      else { s = to24(h1, m1, a1); e = to24(h2, m2, a2); }
      if (s == null || e == null) continue;
      return { start: minToHHMM(s), end: minToHHMM(e) };
    }
    var one = new RegExp("\\b(?:from|since|starting(?: at)?|started(?: at)?|at)\\s+" + TP, "i").exec(text);
    if (one && (one[2] || one[3] || one[4])) { var t = to24(one[1], one[2], one[3]); if (t != null) return { start: minToHHMM(t), end: "" }; }
    return null;
  }
  var STOP = { at: 1, to: 1, by: 1, of: 1, on: 1, in: 1, from: 1, hrs: 1, hr: 1, for: 1, no: 1, rs: 1, am: 1, pm: 1, and: 1, is: 1, up: 1, as: 1, we: 1, so: 1, till: 1 };
  var EQ_WORDS = "surface miner|dumper|dozer|shovel|excavator|drill|crusher|pump|grader|loader|payloader|water tanker|tipper|truck|crane|conveyor|compactor|rig|hd";
  function findEquipment(text) {
    var m = /\b([A-Z]{1,5})\s?-\s?(\d{1,5})\b/.exec(text) || /\b([A-Z]{2,5})\s(\d{2,5})\b/.exec(text);
    if (m && !STOP[m[1].toLowerCase()]) return m[1] + "-" + m[2];
    m = new RegExp("\\b(" + EQ_WORDS + ")\\s*(?:no\\.?|number|#)?\\s*-?\\s*(\\d{1,5})\\b", "i").exec(text);
    if (m) { var w = m[1].replace(/\b\w/g, function (c) { return c.toUpperCase(); }); return w + " " + m[2]; }
    m = /\b([a-z]{1,4})\s?-\s?(\d{2,5})\b/i.exec(text);
    if (m && !STOP[m[1].toLowerCase()]) return m[1].toUpperCase() + "-" + m[2];
    return "";
  }
  function findCause(text) {
    var m = /(?:due to|because of|owing to|on account of|caused by|reason(?: is|:)?)\s+(.+?)(?:\s+(?:from|between|since|till|until|at)\s+\d|[.;]|$)/i.exec(text);
    if (!m) return "";
    var c = m[1].replace(/[\s,.]+$/, "").trim();
    return c ? c.charAt(0).toUpperCase() + c.slice(1) : "";
  }
  var LOC_WORDS = { Laikera: "laikera|laikara|lakhera|laikeera", Kanika: "kanika|kanica|kaneeka", Inpit: "inpit|in-pit mine|location in pit|site in pit", Sardega: "sardega|sardiga|sardeega" };
  function findLocation(text, voice) {
    var hit = [];
    LOCS.forEach(function (l) { if (new RegExp("\\b(?:" + LOC_WORDS[l] + ")\\b", "i").test(text)) hit.push(l); });
    return hit.length === 1 ? hit[0] : "";   // only when exactly one location is named
  }
  var CAT_RULES = [
    [/power|electric|feeder|transformer|no supply|tripp?ed|substation|\bht\b/i, "Power Failure"],
    [/rain|storm|fog|weather|lightning|flood|cyclone/i, "Weather / Rain"],
    [/water ?logg|waterlog|seepage|pumping|inundat/i, "Water Logging"],
    [/villager|agitation|protest|strike|bandh|law and order|dharna|gherao|land owner|rehabilitation|trespass|local people|\bmaoist/i, "Law & Order / Local Issue"],
    [/blast|drill|misfire|explosive|shot ?firing/i, "Blasting / Drilling"],
    [/diesel|fuel|\bhsd\b/i, "Fuel / Diesel Shortage"],
    [/manpower|operator|absent|attendance|crew|shift change|labou?r|no operator|short of men/i, "Manpower / Shift Issue"],
    [/coal handling|loading|rake|stock|siding|crusher|conveyor|\bchp\b|weighbridge|wagon/i, "Coal Handling / Loading"],
    [/road|haul|ramp|blocked|block|jam|diversion|bench/i, "Road / Haul Road Blocked"],
    [/breakdown|broke ?down|breakdown|hydraulic|engine|puncture|tyre|tire|repair|maintenance|gear|clutch|brake|fault|failure|not working|stuck/i, "Equipment Breakdown"]
  ];
  function guessCategory(cause, detail) {
    var srcs = [cause, detail];
    for (var s = 0; s < srcs.length; s++) {
      if (!srcs[s]) continue;
      for (var i = 0; i < CAT_RULES.length; i++) if (CAT_RULES[i][0].test(srcs[s])) return CAT_RULES[i][1];
    }
    return "";
  }
  function readText(text, voice) {
    var t = findTimes(text) || {}, cause = findCause(text);
    return { start: t.start || "", end: t.end || "", equipment: findEquipment(text), cause: cause, location: findLocation(text, voice), category: guessCategory(cause, text) };
  }

  window.HindranceCore = { LOCS: LOCS, CATS: CATS, analyse: analyse, groupDayLoc: groupDayLoc, readText: readText, span: span, hm: hm, hrs: hrs, toMin: toMin, fmtDate: fmtDate, validDate: validDate };
  if (typeof document === "undefined") return;

  /* ================= 2. SCREEN ================= */
  var XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  var TABLE = "hindrance_entries";
  var db = null, rows = [], loaded = false, rec = null, listening = false, submitKey = newKey(), saving = false, dupWarned = "";
  var touched = {}, view = "entry", histShown = 50, todayDate = isoToday(), summaryDate = isoToday();

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function newKey() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "k" + Date.now() + "-" + Math.random().toString(16).slice(2); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  function errBox(title, err) {   // friendly message + real error text (project rule 8)
    var msg = err && err.message ? err.message : String(err || "");
    var hint = "";
    if (/does not exist|schema cache|relation/i.test(msg)) hint = " The table may not exist yet. Ask the Data Keeper to run database/11-hindrance.sql in Supabase.";
    else if (/permission denied|row-level security|violates row/i.test(msg)) hint = " Your account may not be allowed to do this. Viewers can only read.";
    else if (/failed to fetch|network/i.test(msg)) hint = " This looks like an internet problem. Please try again.";
    $("err").innerHTML = '<div class="error-box"><strong>' + esc(title) + "</strong>" + esc(hint) + " If it keeps happening, send this message to the team:<code>" + esc(msg) + "</code></div>";
    $("err").scrollIntoView({ block: "nearest" });
  }
  function clearErr() { $("err").innerHTML = ""; }
  function flash(html, bad) {
    var el = $("flash"); el.className = "hx-flash " + (bad ? "bad" : "ok"); el.innerHTML = html; el.hidden = false;
    clearTimeout(flash.t); flash.t = setTimeout(function () { el.hidden = true; }, 9000);
  }

  /* ---------- data ---------- */
  function norm(r) { r.start_time = r.start_time ? String(r.start_time).slice(0, 5) : ""; r.end_time = r.end_time ? String(r.end_time).slice(0, 5) : ""; r.category = r.category || "Other"; return r; }
  function load() {
    $("load-state").textContent = "Loading entries...";
    var all = [];
    function page(from) {
      return db.from(TABLE).select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false }).range(from, from + 999).then(function (res) {
        if (res.error) throw res.error;
        all = all.concat(res.data || []);
        if ((res.data || []).length === 1000) return page(from + 1000);
      });
    }
    return page(0).then(function () { rows = all.map(norm); loaded = true; $("load-state").textContent = rows.length + " entries loaded."; renderAll(); }, function (e) { $("load-state").textContent = "Could not load entries."; errBox("Sorry, the hindrance entries could not be read.", e); });
  }

  /* ---------- views ---------- */
  function setView(v) {
    view = v;
    ["entry", "today", "history"].forEach(function (n) { $("v-" + n).hidden = n !== v; var b = document.querySelector('[data-view="' + n + '"]'); if (b) b.setAttribute("aria-current", n === v ? "page" : "false"); });
    window.scrollTo(0, 0);
    if (v === "today") renderToday();
    if (v === "history") renderHistory();
  }
  function renderAll() { fillFilterLists(); if (view === "today") renderToday(); if (view === "history") renderHistory(); renderMini(); }

  /* ---------- ENTRY form ---------- */
  function fillSelects() {
    $("f-loc").innerHTML = LOCS.map(function (l) { return '<option value="' + l + '">' + l + "</option>"; }).join("");
    $("f-cat").innerHTML = CATS.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("");
    $("h-loc").innerHTML = '<option value="">All locations</option>' + LOCS.map(function (l) { return '<option value="' + l + '">' + l + "</option>"; }).join("");
    $("h-cat").innerHTML = '<option value="">All categories</option>' + CATS.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("");
  }
  function paintLocBanner() { var l = $("f-loc").value; $("loc-banner").textContent = "📍 " + l.toUpperCase(); $("loc-banner").className = "hx-locbar loc-" + l.toLowerCase(); }
  function tickClock() { var d = new Date(); $("f-entry-time").textContent = pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function setIf(id, val, flag) { if (val && !touched[flag]) { $(id).value = val; return true; } return false; }
  function applyReading(voice) {
    var text = $("f-detail").value, r = readText(text, voice), got = [];
    if (setIf("f-start", r.start, "start")) got.push("Start " + r.start);
    if (setIf("f-end", r.end, "end")) got.push("End " + r.end);
    if (setIf("f-equip", r.equipment, "equip")) got.push("Equipment " + r.equipment);
    if (setIf("f-cause", r.cause, "cause")) got.push("Reason " + r.cause);
    if (r.location && !touched.loc) { $("f-loc").value = r.location; paintLocBanner(); got.push("Location " + r.location); }
    if (r.category && !touched.cat) { $("f-cat").value = r.category; got.push("Category " + r.category); }
    checkOvernight();
    $("detected").hidden = !got.length;
    $("detected").innerHTML = got.length ? "<strong>Picked up from your words:</strong> " + got.map(function (g) { return '<span class="chip">' + esc(g) + "</span>"; }).join(" ") + "<br>Please check these before saving." : "";
    updateDuration();
  }
  function checkOvernight() {
    var s = toMin($("f-start").value), e = toMin($("f-end").value);
    var need = s != null && e != null && e <= s;   // the user must tick "Ends next day" themselves: no silent guess
    $("next-wrap").hidden = !need && !$("f-next").checked;
  }
  function updateDuration() {
    var s = toMin($("f-start").value), e = toMin($("f-end").value), out = $("f-dur");
    if (s == null || e == null) { out.textContent = "Duration: -"; return; }
    var next = $("f-next").checked; if (next) e += 1440;
    if (e < s || (e === s && !next)) { out.textContent = "Duration: check the times"; return; }
    out.textContent = "Duration: " + hm(e - s) + " (" + hrs(e - s) + " hrs)";
  }
  function formRows() { return { date: $("f-date").value, loc: $("f-loc").value, detail: $("f-detail").value.trim() }; }

  function validate() {
    var date = $("f-date").value, loc = $("f-loc").value, detail = $("f-detail").value.trim();
    var s = $("f-start").value, e = $("f-end").value, next = $("f-next").checked;
    if (!validDate(date)) return "Please choose a valid date.";
    if (date > isoToday()) return "The date is in the future. Please choose today or an earlier date.";
    if (LOCS.indexOf(loc) < 0) return "Please choose a location.";
    if (detail.length < 3) return "Please type or speak the hindrance detail.";
    if ((s && !e) || (!s && e)) return "Please fill BOTH start time and end time, or leave both empty.";
    if (s && e) {
      var sm = toMin(s), em = toMin(e);
      if (sm == null || em == null) return "Start or end time is not valid.";
      if (!next && em <= sm) return em === sm ? "Start and end time are the same. Please check them." : "End time is earlier than start time. If the hindrance ended the next day, tick \"Ends next day\".";
      if (next && em > sm) return "\"Ends next day\" is ticked, but the end time is later than the start time. Untick it or fix the times.";
    }
    return "";
  }
  function isDuplicate(p) {
    return rows.some(function (r) { return r.entry_date === p.entry_date && r.location === p.location && r.start_time === (p.start_time || "") && r.end_time === (p.end_time || "") && r.detail.trim().toLowerCase() === p.detail.toLowerCase(); });
  }
  function save() {
    if (saving) return;
    clearErr();
    if (window.MCLUser && !window.MCLUser.can("add")) { flash("Your role (Viewer) can only read. You cannot add entries.", true); return; }
    var bad = validate();
    if (bad) { flash(esc(bad), true); return; }
    var p = {
      entry_date: $("f-date").value, location: $("f-loc").value, category: $("f-cat").value, detail: $("f-detail").value.trim(),
      equipment_no: $("f-equip").value.trim() || null, cause: $("f-cause").value.trim() || null,
      start_time: $("f-start").value || null, end_time: $("f-end").value || null, ends_next_day: !!($("f-start").value && $("f-end").value && $("f-next").checked),
      entered_by: window.MCLUser ? window.MCLUser.get().name : null, source: $("f-src").value === "voice" ? "voice" : "typed", submit_key: submitKey
    };
    var sig = p.entry_date + p.location + p.detail + (p.start_time || "") + (p.end_time || "");
    if (isDuplicate({ entry_date: p.entry_date, location: p.location, start_time: p.start_time, end_time: p.end_time, detail: p.detail }) && dupWarned !== sig) {
      dupWarned = sig; $("btn-save").textContent = "SAVE ANYWAY";
      flash("This looks the same as an entry already saved (same date, location, text and times). Tap <strong>SAVE ANYWAY</strong> only if it is a different hindrance.", true); return;
    }
    saving = true; $("btn-save").disabled = true; $("btn-save").textContent = "Saving...";
    db.from(TABLE).insert(p).select().single().then(function (res) {
      saving = false; $("btn-save").disabled = false; $("btn-save").textContent = "SAVE ENTRY";
      if (res.error) {
        if (res.error.code === "23505") { flash("This entry was already saved (double tap). Nothing was added twice.", false); resetForm(); load(); return; }
        errBox("Sorry, the entry could not be saved. Your text is still on the screen.", res.error); return;
      }
      var r = norm(res.data); rows.unshift(r);
      var a = analyse(rows.filter(function (x) { return x.entry_date === r.entry_date && x.location === r.location; }));
      flash("✅ <strong>Saved.</strong> " + esc(r.location) + ", " + fmtDate(r.entry_date) + (span(r) ? ", " + hm(span(r).e - span(r).s) : "") + ".<br>Net hindrance for " + esc(r.location) + " on that day: <strong>" + hm(a.net) + "</strong>" + (a.overlap ? " (" + hm(a.overlap) + " overlap not counted twice)" : "") + ".", false);
      resetForm(); renderAll();
    }, function (e) { saving = false; $("btn-save").disabled = false; $("btn-save").textContent = "SAVE ENTRY"; errBox("Sorry, the entry could not be saved. Your text is still on the screen.", e); });
  }
  function resetForm() {
    ["f-detail", "f-start", "f-end", "f-equip", "f-cause"].forEach(function (id) { $(id).value = ""; });
    $("f-next").checked = false; $("next-wrap").hidden = true; $("detected").hidden = true; $("f-src").value = "typed";
    touched = {}; submitKey = newKey(); dupWarned = ""; $("btn-save").textContent = "SAVE ENTRY"; updateDuration();
  }

  /* ---------- VOICE ---------- */
  function voiceError(code) {
    var m = { "not-allowed": "The microphone is blocked. Allow the microphone for this website in the browser settings.", "service-not-allowed": "Voice typing is not allowed on this phone or browser.", "no-speech": "Nothing was heard. Tap the microphone and speak again.", "audio-capture": "No microphone was found.", "network": "Voice typing needs the internet. Please check the connection." };
    $("voice-msg").textContent = m[code] || ("Voice typing stopped: " + code);
  }
  function toggleVoice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { $("voice-msg").textContent = "Voice typing is not supported in this browser. Use Chrome on Android, or tap the microphone key on your phone's keyboard."; return; }
    if (listening) { try { rec.stop(); } catch (e) { /* ignore */ } return; }
    var base = $("f-detail").value.trim(), finalTxt = "";
    rec = new SR(); rec.lang = $("f-lang").value; rec.continuous = true; rec.interimResults = true;
    rec.onstart = function () { listening = true; $("btn-mic").classList.add("on"); $("mic-label").textContent = "LISTENING... TAP TO STOP"; $("voice-msg").textContent = "Speak now."; };
    rec.onresult = function (ev) {
      var interim = "";
      for (var i = ev.resultIndex; i < ev.results.length; i++) { var t = ev.results[i][0].transcript; if (ev.results[i].isFinal) finalTxt += t + " "; else interim += t; }
      $("f-detail").value = (base ? base + " " : "") + (finalTxt + interim).trim();
    };
    rec.onerror = function (ev) { voiceError(ev.error); };
    rec.onend = function () {
      listening = false; $("btn-mic").classList.remove("on"); $("mic-label").textContent = "TAP TO SPEAK";
      if ($("f-detail").value.trim()) { $("f-src").value = "voice"; applyReading(true); if (!$("voice-msg").textContent || $("voice-msg").textContent === "Speak now.") $("voice-msg").textContent = "Done. Please read the text, correct it if needed, then tap SAVE ENTRY."; }
    };
    try { rec.start(); } catch (e) { voiceError(String(e && e.message)); }
  }

  /* ---------- TODAY ---------- */
  function renderToday() {
    var d = summaryDate; $("s-date").value = d;
    $("s-title").textContent = (d === isoToday() ? "Today's Hindrance" : "Hindrance on " + fmtDate(d)) + " – " + fmtDate(d);
    var day = rows.filter(function (r) { return r.entry_date === d; }), totalNet = 0, totalGross = 0, cats = {}, catCount = {};
    var cards = LOCS.map(function (l) {
      var list = day.filter(function (r) { return r.location === l; }), a = analyse(list);
      totalNet += a.net; totalGross += a.gross;
      Object.keys(a.byCat).forEach(function (c) { cats[c] = (cats[c] || 0) + a.byCat[c]; });
      return '<div class="hx-loc-card loc-' + l.toLowerCase() + '"><div class="hx-loc-name">' + l + '</div><div class="hx-loc-hrs">' + hrs(a.net) + ' <small>hrs</small></div><div class="hx-loc-sub">' + hm(a.net) + " &middot; " + a.entries + (a.entries === 1 ? " entry" : " entries") + (a.overlap ? '<br><span class="ov">overlap ' + hm(a.overlap) + " not double-counted</span>" : "") + "</div></div>";
    }).join("");
    day.forEach(function (r) { catCount[r.category] = (catCount[r.category] || 0) + 1; });
    $("s-cards").innerHTML = cards;
    $("s-total").innerHTML = '<div><div class="k">TOTAL HINDRANCE</div><div class="v">' + hrs(totalNet) + ' hrs</div><div class="sub">' + hm(totalNet) + "</div></div><div><div class=\"k\">ENTRIES</div><div class=\"v\">" + day.length + '</div><div class="sub">' + day.filter(function (r) { return span(r); }).length + " with times</div></div>";
    var cl = Object.keys(catCount).sort(function (a, b) { return (cats[b] || 0) - (cats[a] || 0) || catCount[b] - catCount[a]; });
    $("s-cats").innerHTML = cl.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Category</th><th class="num">Entries</th><th class="num">Net hrs</th></tr></thead><tbody>' + cl.map(function (c) { return '<tr><td data-label="Category">' + esc(c) + '</td><td class="num" data-label="Entries">' + catCount[c] + '</td><td class="num" data-label="Net hrs">' + hrs(cats[c] || 0) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<div class="empty-msg">No entries for this date.</div>';
    $("s-list").innerHTML = day.length ? day.map(cardHtml).join("") : '<div class="empty-msg">No entries for this date.</div>';
  }
  function cardHtml(r) {
    var sp = span(r), t = r.created_at ? new Date(r.created_at) : null;
    return '<article class="hx-entry loc-' + r.location.toLowerCase() + '"><div class="hx-entry-top"><span class="hx-tag">' + esc(r.location) + '</span><span class="badge b-info">' + esc(r.category) + "</span>" +
      '<span class="hx-dur">' + (sp ? hm(sp.e - sp.s) : "no time") + "</span></div><p>" + esc(r.detail) + "</p>" +
      '<div class="hx-meta">' + (sp ? esc(r.start_time) + " → " + esc(r.end_time) + (r.ends_next_day ? " (next day)" : "") + " &middot; " : "") + (r.equipment_no ? "Equipment " + esc(r.equipment_no) + " &middot; " : "") + (r.entered_by ? "By " + esc(r.entered_by) : "") + (t ? " &middot; entered " + pad(t.getHours()) + ":" + pad(t.getMinutes()) : "") + "</div></article>";
  }
  function renderMini() {
    var day = rows.filter(function (r) { return r.entry_date === isoToday(); }), tot = 0;
    LOCS.forEach(function (l) { tot += analyse(day.filter(function (r) { return r.location === l; })).net; });
    $("mini").textContent = "Today: " + day.length + (day.length === 1 ? " entry" : " entries") + " · " + hm(tot) + " net hindrance";
  }

  /* ---------- HISTORY ---------- */
  function fillFilterLists() {
    var names = {}; rows.forEach(function (r) { if (r.entered_by) names[r.entered_by] = 1; });
    var cur = $("h-by").value;
    $("h-by").innerHTML = '<option value="">Everyone</option>' + Object.keys(names).sort().map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + "</option>"; }).join("");
    $("h-by").value = cur;
  }
  function filtered() {
    var from = $("h-from").value, to = $("h-to").value, loc = $("h-loc").value, cat = $("h-cat").value, eq = $("h-eq").value.trim().toLowerCase(), by = $("h-by").value, q = $("h-q").value.trim().toLowerCase();
    return rows.filter(function (r) {
      return (!from || r.entry_date >= from) && (!to || r.entry_date <= to) && (!loc || r.location === loc) && (!cat || r.category === cat) &&
        (!eq || (r.equipment_no || "").toLowerCase().indexOf(eq) >= 0) && (!by || r.entered_by === by) &&
        (!q || (r.detail + " " + (r.cause || "") + " " + (r.equipment_no || "")).toLowerCase().indexOf(q) >= 0);
    });
  }
  function renderHistory() {
    var list = filtered(), total = 0;
    var groups = groupDayLoc(list); groups.forEach(function (g) { total += g.a.net; });
    $("h-summary").innerHTML = "<strong>" + list.length + "</strong> entries &middot; net hindrance <strong>" + hm(total) + "</strong> (" + hrs(total) + " hrs)" + LOCS.map(function (l) { var n = 0; groups.forEach(function (g) { if (g.location === l) n += g.a.net; }); return '<span class="hx-pill loc-' + l.toLowerCase() + '">' + l + " " + hrs(n) + " h</span>"; }).join("");
    var shown = list.slice(0, histShown);
    $("h-body").innerHTML = shown.map(function (r) {
      var sp = span(r), t = r.created_at ? new Date(r.created_at) : null;
      return '<tr class="loc-' + r.location.toLowerCase() + '"><td data-l="Date">' + fmtDate(r.entry_date) + '</td><td data-l="Location"><span class="hx-tag">' + esc(r.location) + '</span></td><td data-l="Category">' + esc(r.category) +
        '</td><td data-l="Hindrance Detail">' + esc(r.detail) + '<div class="hx-meta">' + (r.equipment_no ? "Equipment " + esc(r.equipment_no) + " &middot; " : "") + (r.cause ? "Reason: " + esc(r.cause) + " &middot; " : "") + (t ? "Entered " + fmtDate(t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate())) + " " + pad(t.getHours()) + ":" + pad(t.getMinutes()) : "") + "</div></td>" +
        '<td data-l="Start">' + (esc(r.start_time) || "-") + '</td><td data-l="End">' + (esc(r.end_time) || "-") + (r.ends_next_day ? " (+1)" : "") + '</td><td data-l="Duration" class="num">' + (sp ? hm(sp.e - sp.s) : "-") + '</td><td data-l="Entered By">' + esc(r.entered_by || "-") + "</td></tr>";
    }).join("");
    $("h-empty").hidden = list.length > 0;
    $("h-more").hidden = list.length <= histShown;
    $("h-more").textContent = "Show more (" + (list.length - histShown) + " left)";
    var months = groups.slice().reverse();
    $("h-days").innerHTML = months.length ? months.map(function (g) {
      return '<tr class="loc-' + g.location.toLowerCase() + '"><td data-l="Date">' + fmtDate(g.date) + '</td><td data-l="Location"><span class="hx-tag">' + g.location + '</span></td><td data-l="Entries" class="num">' + g.a.entries + '</td><td data-l="Sum of entries (hrs)" class="num">' + hrs(g.a.gross) + '</td><td data-l="Net hours" class="num"><strong>' + hrs(g.a.net) + "</strong></td></tr>";
    }).join("") : '<tr><td colspan="5">No entries.</td></tr>';
  }
  function setRange(kind) {
    var t = isoToday();
    if (kind === "today") { $("h-from").value = t; $("h-to").value = t; }
    else if (kind === "7") { $("h-from").value = addDays(t, -6); $("h-to").value = t; }
    else if (kind === "month") { $("h-from").value = t.slice(0, 8) + "01"; $("h-to").value = t; }
    else { $("h-from").value = ""; $("h-to").value = ""; }
    histShown = 50; renderHistory();
  }

  /* ---------- EXCEL ---------- */
  function loadXlsx() {
    return new Promise(function (ok, no) {
      if (window.XLSX) { ok(); return; }
      var s = document.createElement("script"); s.src = XLSX_URL; s.onload = function () { window.XLSX ? ok() : no(new Error("Excel library did not start")); };
      s.onerror = function () { no(new Error("Could not load the Excel library from cdn.jsdelivr.net")); }; document.head.appendChild(s);
    });
  }
  function serial(iso) { var p = iso.split("-"); return (Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 86400000; }
  function dcell(iso) { return { t: "n", v: serial(iso), z: "dd-mm-yyyy" }; }
  function ncell(v) { return { t: "n", v: v, z: "0.00" }; }
  function exportExcel() {
    clearErr(); var btn = $("btn-export"); btn.disabled = true;
    if (!loaded) { flash("The entries are still loading. Please try again in a moment.", true); btn.disabled = false; return; }
    loadXlsx().then(function () {
      var X = window.XLSX, wb = X.utils.book_new();
      var sorted = rows.slice().sort(function (a, b) { return a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : (a.start_time || "") < (b.start_time || "") ? -1 : (a.start_time || "") > (b.start_time || "") ? 1 : (a.created_at < b.created_at ? -1 : 1); });
      var head = ["Entry ID", "Date", "Location", "Category", "Hindrance Detail", "Equipment", "Reason / Cause", "Start Time", "End Time", "Ends Next Day", "Duration (h:mm)", "Duration (hrs)", "Entered By", "Entry Time"];
      function line(r) {
        var sp = span(r), t = r.created_at ? new Date(r.created_at) : null;
        return [r.id, dcell(r.entry_date), r.location, r.category, r.detail, r.equipment_no || "", r.cause || "", r.start_time || "", r.end_time || "", r.ends_next_day ? "Yes" : "",
          sp ? Math.floor((sp.e - sp.s) / 60) + ":" + pad((sp.e - sp.s) % 60) : "", sp ? ncell((sp.e - sp.s) / 60) : "", r.entered_by || "",
          t ? t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate()) + " " + pad(t.getHours()) + ":" + pad(t.getMinutes()) : ""];
      }
      var widths = [{ wch: 38 }, { wch: 12 }, { wch: 11 }, { wch: 24 }, { wch: 60 }, { wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 17 }];
      function sheet(list, name) { var ws = X.utils.aoa_to_sheet([head].concat(list.map(line))); ws["!cols"] = widths; ws["!freeze"] = { xSplit: 0, ySplit: 1 }; X.utils.book_append_sheet(wb, ws, name); }
      sheet(sorted, "All Entries");
      LOCS.forEach(function (l) { sheet(sorted.filter(function (r) { return r.location === l; }), l); });
      var sh = ["Date", "Location", "Entries", "Entries with times", "Sum of entries (hrs)", "NET unique hindrance (hrs)", "NET (h:mm)", "Overlap not counted (hrs)"], out = [sh];
      var groups = groupDayLoc(sorted), i = 0;
      while (i < groups.length) {
        var date = groups[i].date, dayNet = 0, dayGross = 0, dayEnt = 0, dayTimed = 0;
        while (i < groups.length && groups[i].date === date) {
          var g = groups[i], a = g.a; dayNet += a.net; dayGross += a.gross; dayEnt += a.entries; dayTimed += a.timed;
          out.push([dcell(date), g.location, a.entries, a.timed, ncell(a.gross / 60), ncell(a.net / 60), Math.floor(a.net / 60) + ":" + pad(a.net % 60), ncell(a.overlap / 60)]); i++;
        }
        out.push([dcell(date), "ALL LOCATIONS", dayEnt, dayTimed, ncell(dayGross / 60), ncell(dayNet / 60), Math.floor(dayNet / 60) + ":" + pad(dayNet % 60), ncell((dayGross - dayNet) / 60)]);
      }
      out.push([]); out.push(["Note: NET hours merge overlapping periods of the same location and date, so no minute is counted twice. The single entries in the other sheets are unchanged. A hindrance that runs past midnight is counted on its entry date."]);
      var ws = X.utils.aoa_to_sheet(out); ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 9 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 11 }, { wch: 22 }];
      X.utils.book_append_sheet(wb, ws, "Daily Summary");
      var d = new Date();
      X.writeFile(wb, "hindrance-entries-" + isoToday() + "-" + pad(d.getHours()) + pad(d.getMinutes()) + ".xlsx");
      flash("✅ Excel file downloaded (" + rows.length + " entries, 6 sheets).", false);
    }).catch(function (e) { errBox("Sorry, the Excel file could not be made.", e); }).then(function () { btn.disabled = false; });
  }

  /* ---------- start ---------- */
  function wire() {
    fillSelects();
    $("f-date").value = isoToday(); $("f-date").max = isoToday();
    paintLocBanner(); tickClock(); setInterval(tickClock, 20000);
    var saved = lsGet("hx-loc"); if (saved && LOCS.indexOf(saved) >= 0) { $("f-loc").value = saved; paintLocBanner(); }
    var lang = lsGet("hx-lang"); if (lang) $("f-lang").value = lang;
    $("f-lang").addEventListener("change", function () { lsSet("hx-lang", this.value); });
    $("f-loc").addEventListener("change", function () { touched.loc = true; lsSet("hx-loc", this.value); paintLocBanner(); });
    $("f-cat").addEventListener("change", function () { touched.cat = true; });
    [["f-start", "start"], ["f-end", "end"], ["f-equip", "equip"], ["f-cause", "cause"]].forEach(function (p) { $(p[0]).addEventListener("input", function () { touched[p[1]] = true; checkOvernight(); updateDuration(); }); });
    $("f-next").addEventListener("change", function () { touched.next = true; updateDuration(); });
    var tm; $("f-detail").addEventListener("input", function () { $("f-src").value = $("f-src").value === "voice" ? "voice" : "typed"; clearTimeout(tm); tm = setTimeout(function () { applyReading(false); }, 700); });
    $("btn-mic").addEventListener("click", toggleVoice);
    $("btn-save").addEventListener("click", save);
    $("btn-clear").addEventListener("click", function () { resetForm(); $("voice-msg").textContent = ""; });
    document.querySelectorAll("[data-view]").forEach(function (b) { b.addEventListener("click", function () { setView(b.getAttribute("data-view")); }); });
    $("btn-export").addEventListener("click", exportExcel);
    $("btn-refresh").addEventListener("click", function () { clearErr(); load(); });
    $("s-date").addEventListener("change", function () { if (validDate(this.value)) { summaryDate = this.value; renderToday(); } });
    $("s-prev").addEventListener("click", function () { summaryDate = addDays(summaryDate, -1); renderToday(); });
    $("s-next").addEventListener("click", function () { summaryDate = addDays(summaryDate, 1); renderToday(); });
    $("s-now").addEventListener("click", function () { summaryDate = isoToday(); renderToday(); });
    ["h-from", "h-to", "h-loc", "h-cat", "h-eq", "h-by", "h-q"].forEach(function (id) { $(id).addEventListener("input", function () { histShown = 50; renderHistory(); }); });
    document.querySelectorAll("[data-range]").forEach(function (b) { b.addEventListener("click", function () { setRange(b.getAttribute("data-range")); }); });
    $("h-more").addEventListener("click", function () { histShown += 50; renderHistory(); });
    $("h-reset").addEventListener("click", function () { ["h-loc", "h-cat", "h-eq", "h-by", "h-q"].forEach(function (id) { $(id).value = ""; }); setRange("7"); });
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) $("voice-msg").textContent = "Voice typing is not available in this browser. You can still type, or use the microphone key on your phone's keyboard.";
    setRange("7"); updateDuration();
    window.addEventListener("beforeunload", function (e) { if (!saving && $("f-detail").value.trim().length > 15) { e.preventDefault(); e.returnValue = ""; } });
  }
  function applyRole() {
    var ok = !window.MCLUser || window.MCLUser.can("add");
    $("btn-save").disabled = !ok || saving; $("btn-mic").disabled = !ok;
    ["f-date", "f-loc", "f-detail", "f-start", "f-end", "f-cat", "f-equip", "f-cause", "f-next"].forEach(function (id) { $(id).disabled = !ok; });
    $("role-note").hidden = ok;
  }
  function start() {
    wire();
    var go = function (res) {
      if (res && res.ok === false) return;      // auth.js already showed the reason
      db = window.mclDb;
      if (!db) { errBox("Sorry, the database could not be reached.", "The database client did not start."); return; }
      if (window.MCLUser) { window.MCLUser.onChange(applyRole); applyRole(); }
      load();
    };
    if (window.MCLAuthReady) window.MCLAuthReady.then(go); else errBox("Sorry, the sign-in check is missing.", "auth.js did not load.");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
