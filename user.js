/* user.js - "Who are you?" picker shared by every page. NO password.
   The role only decides what the screen lets you do. It is a guide, not security:
   anyone with the link can still pick any role (project rule: no login). */
(function () {
  "use strict";
  var KEY = "mclUser";
  var ROLES = {
    "Fuel Manager": { desc: "Everything: add readings, change status, send test readings, set alert rules.", can: { add: 1, status: 1, test: 1, rules: 1 } },
    "E&M Manager": { desc: "Add readings, change status, set alert rules.", can: { add: 1, status: 1, rules: 1 } },
    "Shift Supervisor": { desc: "Add readings for the shift. Cannot change status or alert rules.", can: { add: 1 } },
    "Viewer": { desc: "See the dashboard and acknowledge alerts. Cannot change data.", can: {} }
  };
  var listeners = [];
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function read() {
    try { var u = JSON.parse(localStorage.getItem(KEY) || "null"); if (u && ROLES[u.role]) return u; } catch (e) { /* ignore */ }
    return null;
  }
  var user = read() || { name: "Guest", role: "Viewer", fresh: true };
  function write(u) { user = { name: u.name, role: u.role }; try { localStorage.setItem(KEY, JSON.stringify(user)); } catch (e) { /* ignore */ } paint(); listeners.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } }); }
  function label() { return user.name + " (" + user.role + ")"; }
  var api = {
    get: function () { return { name: user.name, role: user.role }; },
    can: function (action) { return !!ROLES[user.role].can[action]; },
    label: label,
    roleDesc: function () { return ROLES[user.role].desc; },
    onChange: function (f) { listeners.push(f); },
    open: function () { openModal(); }
  };
  window.MCLUser = api;

  var chip, modal, lastFocus;
  function paint() {
    if (!chip) return;
    chip.innerHTML = '<span class="uc-name">' + esc(user.name) + '</span><span class="uc-role">' + esc(user.role) + "</span>";
    chip.title = "You are " + label() + ". Click to switch. " + ROLES[user.role].desc;
  }
  function buildModal() {
    modal = document.createElement("div"); modal.className = "overlay"; modal.id = "user-modal";
    modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); modal.setAttribute("aria-labelledby", "um-title");
    modal.innerHTML = '<div class="dialog" style="max-width:560px"><div class="dialog-head"><div><h2 id="um-title">Who are you?</h2><p class="sub" style="margin:4px 0 0">Pick your role. No password. The role decides what buttons work for you on this device.</p></div></div>' +
      '<div class="fld"><label for="um-name" style="display:block;font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">Your name or ID (made-up)</label><input type="text" id="um-name" maxlength="30" autocomplete="off" placeholder="e.g. FM-Demo-01" style="width:100%;min-height:44px;padding:6px 10px;border:1px solid #a9b3bd;border-radius:8px"></div>' +
      '<fieldset class="role-list"><legend class="sr" style="position:absolute;width:1px;height:1px;overflow:hidden">Role</legend>' +
      Object.keys(ROLES).map(function (r) { return '<label class="role-card"><input type="radio" name="um-role" value="' + esc(r) + '"><span><b>' + esc(r) + "</b><small>" + esc(ROLES[r].desc) + "</small></span></label>"; }).join("") +
      '</fieldset><p class="note">Please use a made-up name or ID, not a real one. The role only guides this screen. It is not security: anyone with the link can pick any role.</p>' +
      '<div class="um-btns"><button class="btn primary" type="button" id="um-save">Save</button><button class="btn" type="button" id="um-cancel">Continue as Viewer</button></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(true); });
    modal.querySelector("#um-save").addEventListener("click", function () {
      var role = (modal.querySelector("input[name=um-role]:checked") || {}).value || "Viewer";
      var name = modal.querySelector("#um-name").value.trim() || (role === "Viewer" ? "Guest" : role);
      write({ name: name, role: role }); closeModal(false);
    });
    modal.querySelector("#um-cancel").addEventListener("click", function () { closeModal(true); });
  }
  function openModal() {
    if (!modal) buildModal();
    lastFocus = document.activeElement;
    modal.querySelector("#um-name").value = user.fresh ? "" : user.name;
    var r = modal.querySelector("input[name=um-role][value='" + user.role.replace(/'/g, "") + "']"); if (r) r.checked = true;
    modal.classList.add("open"); modal.querySelector("#um-name").focus();
  }
  function closeModal(skip) {
    modal.classList.remove("open");
    if (skip && (user.fresh || !read())) write({ name: "Guest", role: "Viewer" });   // remember the choice so we do not nag again
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && modal && modal.classList.contains("open")) closeModal(true); });

  function init() {
    var menu = document.querySelector(".menu"); if (!menu) return;
    chip = document.createElement("button"); chip.type = "button"; chip.className = "user-chip"; chip.id = "user-chip";
    chip.addEventListener("click", openModal); menu.appendChild(chip); paint();
    if (!read()) setTimeout(openModal, 400);   // first visit: ask once
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
