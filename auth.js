/* auth.js - REAL LOGIN with Supabase Auth (e-mail + password). Shared by every page.
   - Creates the one database client (window.mclDb) and checks who is signed in.
   - The ROLE comes from the account's app_metadata.role (set by the Data Keeper, people cannot edit it).
   - The database itself enforces the roles (database/06-login-security.sql); the buttons only mirror that.
   - index.html (hindrance) and dashboard.html (diesel) need a login; login.html is open. */
(function () {
  "use strict";
  var ROLES = {
    "Fuel Manager": { desc: "Everything: add readings, change status, send test readings, set alert rules.", can: { add: 1, status: 1, test: 1, rules: 1 } },
    "E&M Manager": { desc: "Add readings, change status, set alert rules.", can: { add: 1, status: 1, rules: 1 } },
    "Shift Supervisor": { desc: "Add readings. Cannot change status or alert rules.", can: { add: 1 } },
    "Viewer": { desc: "See the dashboard and acknowledge alerts. Cannot change data.", can: {} }
  };
  var page = (location.pathname.split("/").pop() || "index.html");
  var isLogin = page === "login.html", needsLogin = page === "dashboard.html" || page === "index.html";
  var listeners = [], user = { name: "", role: "", email: "", ok: false }, db = null, chip = null, modal = null, resolveReady, lastFocus = null;
  var ready = new Promise(function (r) { resolveReady = r; });
  window.MCLAuthReady = ready;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var cur = { name: "Guest", role: "Viewer" };
  function setUser(session) {
    if (!session || !session.user) { user = { name: "", role: "", email: "", ok: false }; cur = { name: "Guest", role: "Viewer" }; return; }
    var u = session.user, am = u.app_metadata || {}, um = u.user_metadata || {};
    var role = ROLES[am.role] ? am.role : "";
    var name = String(um.name || (u.email || "user").split("@")[0]);
    user = { name: name, role: role, email: u.email || "", ok: !!role };
    cur = { name: name, role: role || "No role" };
  }
  function can(a) { return !!(user.ok && ROLES[user.role] && ROLES[user.role].can[a]); }
  window.MCLUser = {
    get: function () { return { name: cur.name, role: cur.role }; },
    can: can,
    label: function () { return cur.name + " (" + cur.role + ")"; },
    roleDesc: function () { return user.ok ? ROLES[user.role].desc : "This account has no role yet."; },
    onChange: function (f) { listeners.push(f); },
    open: function () { openModal(); },
    signOut: signOut
  };
  function notify() { listeners.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } }); }

  // hide the page until we know the visitor may see it (avoids a flash of the dashboard)
  var hide = null;
  if (needsLogin) { hide = document.createElement("style"); hide.textContent = "body{visibility:hidden}"; document.head.appendChild(hide); }
  function show() { if (hide && hide.parentNode) hide.parentNode.removeChild(hide); }
  function toLogin() { location.replace("login.html?next=" + encodeURIComponent(page)); }

  function signOut() {
    var go = function () { location.replace("login.html"); };
    if (!db) { go(); return; }
    db.auth.signOut().then(go, go);
  }

  /* ---- header chip + account window ---- */
  function paint() {
    if (!chip) return;
    if (user.email) {
      chip.innerHTML = '<span class="uc-name">' + esc(user.name) + '</span><span class="uc-role">' + esc(user.role || "No role yet") + "</span>";
      chip.title = "Signed in as " + user.email + ". Click for details or to sign out.";
    } else { chip.innerHTML = '<span class="uc-name">Sign in</span><span class="uc-role">Not signed in</span>'; chip.title = "Sign in with your e-mail and password"; }
  }
  function buildModal() {
    modal = document.createElement("div"); modal.className = "overlay"; modal.id = "user-modal";
    modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); modal.setAttribute("aria-labelledby", "um-title");
    modal.innerHTML = '<div class="dialog" style="max-width:520px"><div class="dialog-head"><h2 id="um-title">Your account</h2><button class="btn" type="button" id="um-close">Close</button></div><div id="um-body"></div>' +
      '<div class="um-btns"><button class="btn primary" type="button" id="um-out">Sign out</button></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    modal.querySelector("#um-close").addEventListener("click", closeModal);
    modal.querySelector("#um-out").addEventListener("click", signOut);
  }
  function openModal() {
    if (!user.email) { location.href = "login.html"; return; }
    if (!modal) buildModal();
    lastFocus = document.activeElement;
    modal.querySelector("#um-body").innerHTML = '<dl class="rec-grid" style="display:grid;grid-template-columns:1fr;gap:6px"><div><dt style="color:var(--muted);font-size:12px;text-transform:uppercase;font-weight:700">Name</dt><dd style="margin:0 0 6px;font-weight:700">' + esc(user.name) + '</dd></div><div><dt style="color:var(--muted);font-size:12px;text-transform:uppercase;font-weight:700">E-mail</dt><dd style="margin:0 0 6px;font-weight:700">' + esc(user.email) + '</dd></div><div><dt style="color:var(--muted);font-size:12px;text-transform:uppercase;font-weight:700">Role</dt><dd style="margin:0 0 6px;font-weight:700">' + esc(user.role || "No role yet") + '</dd></div></dl><p class="note">' + esc(window.MCLUser.roleDesc()) + "</p>";
    modal.classList.add("open"); modal.querySelector("#um-close").focus();
  }
  function closeModal() { if (modal) modal.classList.remove("open"); if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && modal && modal.classList.contains("open")) closeModal(); });
  function initChip() {
    var menu = document.querySelector(".menu"); if (!menu) return;
    chip = document.createElement("button"); chip.type = "button"; chip.className = "user-chip"; chip.id = "user-chip";
    chip.addEventListener("click", openModal); menu.appendChild(chip); paint();
  }
  function blockNoRole() {
    show();
    var main = document.querySelector("main") || document.body;
    main.innerHTML = '<section class="card" style="max-width:640px;margin:24px auto"><h2>Your account has no role yet</h2><p>You are signed in as <strong>' + esc(user.email) + '</strong>, but no role has been given to this account. Ask the Data Keeper to set your role (Fuel Manager, E&amp;M Manager, Shift Supervisor or Viewer), then sign out and sign in again.</p><button class="btn primary" type="button" id="nr-out">Sign out</button></section>';
    document.getElementById("nr-out").addEventListener("click", signOut);
  }
  function fail(msg) {   // friendly message with the real error text (project rule 8)
    show();
    var main = document.querySelector("main") || document.body;
    main.insertAdjacentHTML("afterbegin", '<div class="error-box"><strong>Sorry, the sign-in check could not be done.</strong> Please send this message to the team:<code>' + esc(msg) + "</code></div>");
    resolveReady({ ok: false });
  }

  function start() {
    initChip();
    if (!window.supabase) { if (needsLogin || isLogin) fail("The Supabase library could not be loaded from cdn.jsdelivr.net. Check the internet connection."); else resolveReady({ ok: true }); return; }
    var url = window.SUPABASE_URL || "", key = window.SUPABASE_PUBLISHABLE_KEY || "";
    if (url.indexOf("PASTE") !== -1 || key.indexOf("PASTE") !== -1) { fail("config.js still has the placeholder Project URL or key."); return; }
    db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);
    window.mclDb = db;
    db.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_OUT" && !isLogin && needsLogin) { toLogin(); return; }
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") { var before = user.role; setUser(session); paint(); if (before !== user.role) notify(); }
    });
    db.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      setUser(session); paint();
      if (isLogin) { if (session) { location.replace(nextPage()); return; } show(); resolveReady({ ok: true }); return; }
      if (needsLogin && !session) { toLogin(); return; }
      if (needsLogin && session && !user.ok) { blockNoRole(); resolveReady({ ok: false }); return; }
      show(); resolveReady({ ok: true }); notify();
    }, function (e) { fail(e && e.message ? e.message : String(e)); });
  }
  function nextPage() {
    var n = new URLSearchParams(location.search).get("next");
    return (n === "dashboard.html" || n === "index.html") ? n : "index.html";
  }
  window.MCLAuth = { nextPage: nextPage, db: function () { return db; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
